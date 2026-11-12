/**
 * ZUNO SHOP-MVP-4 — Phase 3 Verification Suite
 *
 * Covers:
 * 1. Migration 014 schema, defaults, public_storefronts view & checkout trigger contract
 * 2. Opening hours 24h validation (closed days, overnight midnight boundaries, invalid rejection)
 * 3. Asia/Kolkata timezone evaluation & legacy/corrupt schedule handling
 * 4. Shopkeeper server actions & ShopProfile/Settings UI (auth.shopId scoping, independent delivery toggle)
 * 5. Customer storefront discovery, detail screen & strict public_storefronts usage
 * 6. Customer checkout server-backed availability validation & failure rejection
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const SHOP_DIR = path.join(ROOT_DIR, "apps/shop");
const CUSTOMER_DIR = path.join(ROOT_DIR, "apps/customer");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`[PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`[FAIL] ${name}: ${err.message}`);
  }
}

console.log("==================================================================");
console.log(" ZUNO SHOP-MVP-4 — Phase 3 Verification Suite");
console.log("==================================================================\n");

// Compile shared @zuno/utils shopHours.ts cleanly into a temporary folder
const compileOutDir = fs.mkdtempSync(path.join(os.tmpdir(), "zuno-mvp-p3-"));
const altTscBin = path.join(SHOP_DIR, "node_modules", "typescript", "bin", "tsc");
const tscBin = fs.existsSync(altTscBin)
  ? altTscBin
  : path.join(ROOT_DIR, "node_modules", "typescript", "bin", "tsc");

const compileRes = spawnSync(
  process.execPath,
  [
    tscBin,
    "--outDir",
    compileOutDir,
    "--module",
    "commonjs",
    "--target",
    "es2020",
    "--moduleResolution",
    "node",
    "--esModuleInterop",
    "--skipLibCheck",
    path.join(ROOT_DIR, "packages/utils/src/shopHours.ts"),
  ],
  { encoding: "utf8" }
);

if (compileRes.status !== 0) {
  console.error("Failed to compile Phase 3 TypeScript helper:\n", compileRes.stderr || compileRes.stdout);
  process.exit(1);
}

const shopHoursMod = require(path.join(compileOutDir, "shopHours.js"));
const {
  createDefaultShopOpeningHours,
  validateShopOpeningHours,
  evaluateShopAvailability,
  formatOpeningHoursDaySummary,
} = shopHoursMod;

// ------------------------------------------------------------------
// 1. Migration 014 Verification
// ------------------------------------------------------------------
const migration014 = fs.readFileSync(
  path.join(ROOT_DIR, "supabase/migrations/00000000000014_shop_hours_and_mvp_ops.sql"),
  "utf8"
);

test("[Migration 014] Adds opening_hours jsonb default and is_delivery_available not null default true", () => {
  assert(
    migration014.includes("add column if not exists opening_hours jsonb not null default public.default_shop_opening_hours()"),
    "Must add opening_hours JSONB with default"
  );
  assert(
    migration014.includes("add column if not exists is_delivery_available boolean not null default true"),
    "Must add is_delivery_available boolean not null default true"
  );
  assert(
    migration014.includes("check (public.is_valid_opening_hours(opening_hours))"),
    "Must enforce opening_hours check constraint"
  );
});

test("[Migration 014] Updates public_storefronts with security_barrier, preserves PII exclusion, and revokes shops from anon", () => {
  assert(migration014.includes("with (security_barrier = true)"), "Must preserve security_barrier = true");
  assert(migration014.includes("s.is_delivery_available"), "Must expose is_delivery_available");
  assert(migration014.includes("s.opening_hours"), "Must expose opening_hours");
  assert(migration014.includes("revoke all on public.shops from anon"), "Must keep anon revoked on public.shops");
  assert(!migration014.match(/select[\s\S]*from public\.shops[\s\S]*where[\s\S]*is_delivery_available\s*=\s*true/i),
    "public_storefronts must not hide delivery-paused active shops");
  for (const privateField of ["s.owner_id", "s.phone", "s.address_line", "s.approval_status", "s.is_approved"]) {
    assert(
      !migration014.split("from public.shops s")[0].split("create or replace view public.public_storefronts")[1]?.includes(privateField),
      `public_storefronts SELECT list must not contain ${privateField}`
    );
  }
});

test("[Migration 014] Adds BEFORE INSERT order availability trigger enforcing active, delivery, and Asia/Kolkata hours", () => {
  assert(migration014.includes("create trigger trigger_enforce_order_shop_availability"), "Missing trigger");
  assert(migration014.includes("before insert on public.orders"), "Trigger must run ONLY before insert");
  assert(migration014.includes("at time zone 'Asia/Kolkata'"), "Must evaluate opening hours in Asia/Kolkata");
  assert(migration014.includes("if not v_shop.is_active then"), "Must reject offline shop");
  assert(migration014.includes("if not v_shop.is_delivery_available then"), "Must reject paused delivery");
  assert(migration014.includes("if not public.is_shop_open_now(v_shop.opening_hours, now()) then"), "Must reject closed shop");
});

// ------------------------------------------------------------------
// 2. Opening Hours Validation & Normalization
// ------------------------------------------------------------------
test("[Validation] Accepts valid 7-day schedules, closed weekdays, and midnight-wrapping shifts", () => {
  const schedule = createDefaultShopOpeningHours();
  schedule.sunday = { enabled: false, open: null, close: null };
  schedule.friday = { enabled: true, open: "18:00", close: "02:00" };
  schedule.saturday = { enabled: true, open: "08:00", close: "00:00" };

  const res = validateShopOpeningHours(schedule);
  assert.strictEqual(res.valid, true);
  assert.deepStrictEqual(res.data.sunday, { enabled: false, open: null, close: null });
  assert.strictEqual(formatOpeningHoursDaySummary(res.data.friday), "18:00 – 02:00 (+1 day)");
  assert.strictEqual(formatOpeningHoursDaySummary(res.data.saturday), "08:00 – 00:00 (Midnight)");
  assert.strictEqual(formatOpeningHoursDaySummary(res.data.sunday), "Closed");
});

test("[Validation] Rejects invalid times (25:00, non-24h), identical open/close, missing weekdays, and unknown keys", () => {
  const badTime = createDefaultShopOpeningHours();
  badTime.monday = { enabled: true, open: "25:00", close: "21:00" };
  assert.strictEqual(validateShopOpeningHours(badTime).valid, false);

  const sameTime = createDefaultShopOpeningHours();
  sameTime.tuesday = { enabled: true, open: "09:00", close: "09:00" };
  assert.strictEqual(validateShopOpeningHours(sameTime).valid, false);

  const missingDay = { ...createDefaultShopOpeningHours() };
  delete missingDay.wednesday;
  assert.strictEqual(validateShopOpeningHours(missingDay).valid, false);

  const extraKey = { ...createDefaultShopOpeningHours(), holiday: { enabled: false, open: null, close: null } };
  assert.strictEqual(validateShopOpeningHours(extraKey).valid, false);
});

// ------------------------------------------------------------------
// 3. Asia/Kolkata Timezone & Availability Evaluation
// ------------------------------------------------------------------
test("[Availability] Evaluates IST open/closed windows, overnight midnight boundaries, legacy null, and corrupt data", () => {
  const schedule = createDefaultShopOpeningHours();
  schedule.monday = { enabled: true, open: "20:00", close: "02:00" };
  schedule.tuesday = { enabled: true, open: "08:00", close: "21:00" };
  schedule.sunday = { enabled: false, open: null, close: null };

  // Monday 2026-11-09 22:15 IST => Open
  const monNight = new Date("2026-11-09T16:45:00.000Z"); // 22:15 IST
  assert.strictEqual(
    evaluateShopAvailability({ isActive: true, isDeliveryAvailable: true, openingHours: schedule }, monNight).isOpenNow,
    true
  );

  // Tuesday 2026-11-10 01:30 IST => Still open from Monday 20:00-02:00 overnight shift
  const tueEarly = new Date("2026-11-09T20:00:00.000Z"); // 01:30 IST Tuesday
  assert.strictEqual(
    evaluateShopAvailability({ isActive: true, isDeliveryAvailable: true, openingHours: schedule }, tueEarly).isOpenNow,
    true
  );

  // Tuesday 2026-11-10 02:15 IST => Closed
  const tueClosed = new Date("2026-11-09T20:45:00.000Z"); // 02:15 IST Tuesday
  const closedEval = evaluateShopAvailability({ isActive: true, isDeliveryAvailable: true, openingHours: schedule }, tueClosed);
  assert.strictEqual(closedEval.isOpenNow, false);
  assert.strictEqual(closedEval.canAcceptDeliveryOrder, false);
  assert.strictEqual(closedEval.reasonCode, "SCHEDULE_CLOSED");

  // Sunday 2026-11-15 12:00 IST => Closed day
  const sunNoon = new Date("2026-11-15T06:30:00.000Z");
  assert.strictEqual(
    evaluateShopAvailability({ isActive: true, isDeliveryAvailable: true, openingHours: schedule }, sunNoon).isOpenNow,
    false
  );

  // Paused delivery during open hours: store stays Open & visible, delivery blocked
  const pausedEval = evaluateShopAvailability(
    { isActive: true, isDeliveryAvailable: false, openingHours: schedule },
    monNight
  );
  assert.strictEqual(pausedEval.isOpenNow, true);
  assert.strictEqual(pausedEval.canAcceptDeliveryOrder, false);
  assert.strictEqual(pausedEval.reasonCode, "DELIVERY_PAUSED");

  // Offline shop overrides open schedule
  const offlineEval = evaluateShopAvailability(
    { isActive: false, isDeliveryAvailable: true, openingHours: schedule },
    monNight
  );
  assert.strictEqual(offlineEval.isOpenNow, false);
  assert.strictEqual(offlineEval.canAcceptDeliveryOrder, false);
  assert.strictEqual(offlineEval.reasonCode, "SHOP_OFFLINE");

  // Legacy null opening_hours falls back gracefully when active
  const legacyEval = evaluateShopAvailability({ isActive: true, isDeliveryAvailable: true, openingHours: null }, tueClosed);
  assert.strictEqual(legacyEval.isOpenNow, true);
  assert.strictEqual(legacyEval.hasConfiguredSchedule, false);

  // Corrupt non-null schedule fails closed
  const corruptEval = evaluateShopAvailability({ isActive: true, isDeliveryAvailable: true, openingHours: { monday: "broken" } }, monNight);
  assert.strictEqual(corruptEval.isOpenNow, false);
  assert.strictEqual(corruptEval.isScheduleValid, false);
  assert.strictEqual(corruptEval.canAcceptDeliveryOrder, false);
});

// ------------------------------------------------------------------
// 4. Shopkeeper Actions & UI
// ------------------------------------------------------------------
const shopActions = fs.readFileSync(path.join(SHOP_DIR, "features/shop/actions.ts"), "utf8");
const shopProfileClient = fs.readFileSync(path.join(SHOP_DIR, "app/shop/ShopProfileClient.tsx"), "utf8");
const settingsClient = fs.readFileSync(path.join(SHOP_DIR, "app/settings/SettingsClient.tsx"), "utf8");

test("[Shopkeeper] Actions derive shopId from requireApprovedShopkeeper() and isolate opening_hours / is_delivery_available", () => {
  assert(shopActions.includes("updateShopOpeningHoursAction"), "Missing updateShopOpeningHoursAction");
  assert(shopActions.includes("toggleDeliveryAvailabilityAction"), "Missing toggleDeliveryAvailabilityAction");
  assert(shopActions.includes("validateShopOpeningHours"), "Must validate opening hours server-side");
  assert(shopActions.includes('.eq("id", auth.shopId)'), "Must strictly scope to auth.shopId");
  assert(!shopActions.match(/toggleDeliveryAvailabilityAction[\s\S]*is_active:/), "Delivery toggle must never mutate is_active");
});

test("[Shopkeeper] ShopProfileClient & SettingsClient expose hours editor, bulk apply, preview, and independent delivery toggle", () => {
  assert(shopProfileClient.includes("Apply Same Schedule to Selected Days"), "Missing bulk apply control");
  assert(shopProfileClient.includes("Weekly Schedule Preview"), "Missing weekly preview");
  assert(shopProfileClient.includes("Delivery Availability"), "Missing delivery availability card");
  assert(shopProfileClient.includes("Pause Delivery"), "Missing Pause Delivery action");
  assert(!shopProfileClient.includes("alert("), "ShopProfileClient must not use alert()");
  assert(settingsClient.includes("toggleDeliveryAvailabilitySettingAction"), "SettingsClient missing delivery toggle");
  assert(!settingsClient.includes("alert("), "SettingsClient must not use alert()");
});

// ------------------------------------------------------------------
// 5. Customer Storefront Compatibility
// ------------------------------------------------------------------
const customerShopsApi = fs.readFileSync(path.join(CUSTOMER_DIR, "features/shops/api.ts"), "utf8");
const customerHomeScreen = fs.readFileSync(path.join(CUSTOMER_DIR, "app/(tabs)/index.tsx"), "utf8");
const customerShopDetail = fs.readFileSync(path.join(CUSTOMER_DIR, "app/shop/[id].tsx"), "utf8");

test("[Customer] Queries public_storefronts safely (never public.shops) and exposes open/closed & delivery status", () => {
  assert(customerShopsApi.includes('.from("public_storefronts")'), "Must query public_storefronts");
  assert(!customerShopsApi.includes('.from("shops")'), "Customer must never query private public.shops table");
  assert(customerShopsApi.includes("is_delivery_available, opening_hours"), "Must select new storefront fields");
  assert(customerShopsApi.includes("evaluateShopAvailability"), "Must evaluate schedule in IST");
  assert(customerHomeScreen.includes("Delivery Paused"), "Home discovery cards must show Delivery Paused badge");
  assert(customerShopDetail.includes("getPublicStorefrontById"), "Shop detail screen must load storefront by ID");
  assert(!customerShopDetail.toLowerCase().includes("pickup available"), "Must not invent pickup feature");
});

// ------------------------------------------------------------------
// 6. Checkout Safety
// ------------------------------------------------------------------
const customerCheckoutApi = fs.readFileSync(path.join(CUSTOMER_DIR, "features/checkout/api.ts"), "utf8");
const customerCheckoutScreen = fs.readFileSync(path.join(CUSTOMER_DIR, "app/checkout.tsx"), "utf8");

test("[Checkout] Enforces live storefront availability before quote/order and fails safely on DB rejection", () => {
  assert(customerCheckoutApi.includes("validateCheckoutShopAvailability"), "Missing live availability validator");
  assert(customerCheckoutApi.includes('.from("public_storefronts")'), "Checkout must verify public_storefronts");
  assert(
    customerCheckoutApi.includes("if (rpcErr || !rpcData || !rpcData.success || !rpcData.order_id)") ||
      customerCheckoutApi.includes("if (orderErr || !orderData)"),
    "Checkout must handle DB rejection explicitly"
  );
  assert(!customerCheckoutApi.includes("if (!orderErr && orderData) {\n        finalOrderId = orderData.id;"),
    "Must not silently ignore DB order insert failures");
  assert(customerCheckoutScreen.includes("orderError"), "Checkout screen must display rejection error");
  assert(customerCheckoutScreen.includes("quote.shopAvailable === false"), "Checkout screen must disable CTA when unavailable");
});

console.log("\n==================================================================");
console.log(` Phase 3 Verification Complete: ${passed} passed, ${failed} failed.`);
console.log("==================================================================\n");

try {
  fs.rmSync(compileOutDir, { recursive: true, force: true });
} catch {}

if (failed > 0) {
  process.exit(1);
}

