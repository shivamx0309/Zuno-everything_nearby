/**
 * ZUNO SHOP-MVP-2 — Phase 1 Automated Verification Suite
 *
 * Tests:
 * 1. ESLint configuration (non-interactive Next.js + TypeScript)
 * 2. Shop profile server-side Zod + Indian phone validation (runtime + source invariants)
 * 3. Dashboard low-stock & out-of-stock metrics (runtime deduplication, threshold, error safety)
 * 4. Supabase Realtime shop-scoped order subscription conventions & cleanup
 * 5. Order detail status controls & server-side state transition validation
 * 6. Reject order confirmation dialog & duplicate-submission guards
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const SHOP_DIR = path.join(ROOT_DIR, "apps/shop");

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
console.log(" ZUNO SHOP-MVP-2 — Phase 1 Verification Suite");
console.log("==================================================================\n");

// Compile pure Phase 1 TypeScript helpers + @zuno/validation dependency cleanly into temp dir
const compileOutDir = fs.mkdtempSync(path.join(os.tmpdir(), "zuno-mvp-p1-"));
const tscBin = path.join(ROOT_DIR, "node_modules", "typescript", "bin", "tsc");
const altTscBin = path.join(SHOP_DIR, "node_modules", "typescript", "bin", "tsc");
const resolvedTsc = fs.existsSync(altTscBin) ? altTscBin : tscBin;

const compileRes = spawnSync(
  process.execPath,
  [
    resolvedTsc,
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
    path.join(SHOP_DIR, "lib/shop-profile-validation.ts"),
    path.join(SHOP_DIR, "lib/dashboard-inventory-metrics.ts"),
    path.join(SHOP_DIR, "lib/shop-order-transitions.ts"),
    path.join(ROOT_DIR, "packages/validation/src/auth.ts"),
  ],
  { encoding: "utf8", shell: false }
);

if (compileRes.status !== 0) {
  console.error("Failed to compile Phase 1 TypeScript helpers for runtime testing:");
  console.error(compileRes.stdout, compileRes.stderr);
  process.exit(1);
}

// Provide minimal Module resolver alias for @zuno/validation & zod when executing from os.tmpdir()
const Module = require("module");
const origLoad = Module._load;
const resolvedZodPath = require.resolve("zod", { paths: [SHOP_DIR, ROOT_DIR] });
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "zod") {
    return origLoad.call(this, resolvedZodPath, parent, isMain);
  }
  if (request === "@zuno/validation") {
    const authPath = path.join(compileOutDir, "packages/validation/src/auth.js");
    if (fs.existsSync(authPath)) return origLoad.call(this, authPath, parent, isMain);
    // Single-root layout if tsc didn't preserve packages/ parent
    return origLoad.call(this, path.join(compileOutDir, "auth.js"), parent, isMain);
  }
  return origLoad.call(this, request, parent, isMain);
};

const compiledShopLib = fs.existsSync(path.join(compileOutDir, "apps/shop/lib"))
  ? path.join(compileOutDir, "apps/shop/lib")
  : compileOutDir;

const { validateShopProfileUpdate } = require(path.join(
  compiledShopLib,
  "shop-profile-validation.js"
));
const {
  LOW_STOCK_THRESHOLD,
  computeDashboardInventoryMetrics,
} = require(path.join(compiledShopLib, "dashboard-inventory-metrics.js"));
const {
  isValidShopkeeperOrderTransition,
  getShopkeeperOrderActions,
} = require(path.join(compiledShopLib, "shop-order-transitions.js"));

// ---------------------------------------------------------------------
// Task 1: ESLint Config Checks
// ---------------------------------------------------------------------
test("[Task 1] apps/shop/.eslintrc.json exists and extends next/core-web-vitals", () => {
  const eslintPath = path.join(SHOP_DIR, ".eslintrc.json");
  assert(fs.existsSync(eslintPath), "Missing .eslintrc.json");
  const cfg = JSON.parse(fs.readFileSync(eslintPath, "utf8"));
  const ext = Array.isArray(cfg.extends) ? cfg.extends : [cfg.extends];
  assert(ext.includes("next/core-web-vitals"), "Must extend next/core-web-vitals");
});

// ---------------------------------------------------------------------
// Task 2: Shop Profile Server-Side Validation
// ---------------------------------------------------------------------
test("[Task 2] Valid shop profile input is trimmed and normalized to +91 E.164", () => {
  const res = validateShopProfileUpdate({
    name: "  Gupta Kirana Store  ",
    description: "  Fresh groceries daily  ",
    phone: " 09876543210 ",
    addressLine: "  Main Market Road, Shop 4  ",
    locality: "  Renukoot  ",
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.data.name, "Gupta Kirana Store");
  assert.strictEqual(res.data.description, "Fresh groceries daily");
  assert.strictEqual(res.data.phone, "+919876543210");
  assert.strictEqual(res.data.addressLine, "Main Market Road, Shop 4");
  assert.strictEqual(res.data.locality, "Renukoot");
});

test("[Task 2] Invalid short shop name, invalid Indian mobile, short address, and short locality return structured fieldErrors", () => {
  const res = validateShopProfileUpdate({
    name: "A",
    description: "",
    phone: "1234567890",
    addressLine: "AB",
    locality: "X",
  });
  assert.strictEqual(res.success, false);
  assert(res.error && res.error.length > 0);
  assert(res.fieldErrors.name, "Expected fieldError for name");
  assert(res.fieldErrors.phone, "Expected fieldError for phone");
  assert(res.fieldErrors.addressLine, "Expected fieldError for addressLine");
  assert(res.fieldErrors.locality, "Expected fieldError for locality");
});

test("[Task 2] Phone numbers not equal to 10 digits or not starting with 6-9 are rejected", () => {
  for (const badPhone of ["98765", "5551234567", "999888777666", ""]) {
    const res = validateShopProfileUpdate({
      name: "Valid Shop",
      description: "",
      phone: badPhone,
      addressLine: "Main Road",
      locality: "Renukoot",
    });
    assert.strictEqual(res.success, false, `Expected failure for phone "${badPhone}"`);
    assert(res.fieldErrors.phone, `Expected phone fieldError for "${badPhone}"`);
  }
});

test("[Task 2] updateShopProfileAction enforces requireApprovedShopkeeper(), server auth.shopId, and structured error returns", () => {
  const src = fs.readFileSync(path.join(SHOP_DIR, "features/shop/actions.ts"), "utf8");
  assert(src.includes("await requireApprovedShopkeeper()"));
  assert(src.includes("validateShopProfileUpdate(data)"));
  assert(src.includes('.eq("id", auth.shopId)'));
  assert(!src.includes("owner_id"), "updateShopProfileAction must not allow changing owner_id");
});

// ---------------------------------------------------------------------
// Task 3: Dashboard Low-Stock Metric
// ---------------------------------------------------------------------
test("[Task 3] Dashboard low-stock uses existing threshold (<10) & separates out-of-stock (0)", () => {
  assert.strictEqual(LOW_STOCK_THRESHOLD, 10);
  const res = computeDashboardInventoryMetrics([
    { id: "sp-1", product_id: "p-1", stock: 0 },
    { id: "sp-2", product_id: "p-2", stock: 1 },
    { id: "sp-3", product_id: "p-3", stock: 9 },
    { id: "sp-4", product_id: "p-4", stock: 10 },
    { id: "sp-5", product_id: "p-5", stock: 50 },
  ]);
  assert.strictEqual(res.totalListedCount, 5);
  assert.strictEqual(res.outOfStockCount, 1);
  assert.strictEqual(res.lowStockCount, 2);
});

test("[Task 3] Dashboard inventory metric handles empty arrays and deduplicates duplicate product rows", () => {
  const empty = computeDashboardInventoryMetrics([]);
  assert.deepStrictEqual(empty, {
    lowStockCount: 0,
    outOfStockCount: 0,
    totalListedCount: 0,
  });

  const deduped = computeDashboardInventoryMetrics([
    { id: "sp-1", product_id: "p-1", stock: 0 },
    { id: "sp-1-dup", product_id: "p-1", stock: 0 },
    { id: "sp-2", product_id: "p-2", stock: 5 },
    { id: "sp-2", product_id: "p-2", stock: 5 },
  ]);
  assert.strictEqual(deduped.totalListedCount, 2);
  assert.strictEqual(deduped.outOfStockCount, 1);
  assert.strictEqual(deduped.lowStockCount, 1);
});

test("[Task 3] Dashboard action & UI remove static Store Rating card and link Low-Stock card to /inventory", () => {
  const actSrc = fs.readFileSync(path.join(SHOP_DIR, "features/dashboard/actions.ts"), "utf8");
  const uiSrc = fs.readFileSync(path.join(SHOP_DIR, "app/dashboard/ShopDashboardClient.tsx"), "utf8");
  assert(!actSrc.includes("ratingDisplay"), "ratingDisplay placeholder must be removed");
  assert(actSrc.includes('.from("shop_products")') && actSrc.includes('.eq("shop_id", shopId)'));
  assert(!uiSrc.includes("Store Rating"), "Static Store Rating card must be removed");
  assert(uiSrc.includes('href: "/inventory"'), "Inventory KPI card must link to /inventory");
});

// ---------------------------------------------------------------------
// Task 4: Supabase Realtime Shop-Scoped Order Updates
// ---------------------------------------------------------------------
test("[Task 4] Realtime hook filters strictly to shop_id, validates payload shop_id, cleans up channel, and runs on Dashboard & Orders", () => {
  const hookSrc = fs.readFileSync(path.join(SHOP_DIR, "hooks/useShopOrdersRealtime.ts"), "utf8");
  const dashSrc = fs.readFileSync(path.join(SHOP_DIR, "app/dashboard/ShopDashboardClient.tsx"), "utf8");
  const ordersSrc = fs.readFileSync(path.join(SHOP_DIR, "app/orders/OrdersClient.tsx"), "utf8");

  assert(hookSrc.includes("filter: `shop_id=eq.${shopId}`"));
  assert(hookSrc.includes("incomingShopId && incomingShopId !== shopId"));
  assert(hookSrc.includes("supabase.removeChannel(channel)"));
  assert(dashSrc.includes("useShopOrdersRealtime(data.shop.id") || dashSrc.includes("useShopOrdersRealtime(\n    data.shop.id"));
  assert(ordersSrc.includes("useShopOrdersRealtime(data.shop.id") || ordersSrc.includes("useShopOrdersRealtime(\n    data.shop.id"));
});

// ---------------------------------------------------------------------
// Task 5: Order Detail Status Controls & State Transition Validation
// ---------------------------------------------------------------------
test("[Task 5] Valid shopkeeper order transitions succeed and invalid jumps/terminal mutations are rejected", () => {
  assert.strictEqual(isValidShopkeeperOrderTransition("PLACED", "ACCEPTED"), true);
  assert.strictEqual(isValidShopkeeperOrderTransition("PLACED", "REJECTED"), true);
  assert.strictEqual(isValidShopkeeperOrderTransition("ACCEPTED", "PREPARING"), true);
  assert.strictEqual(isValidShopkeeperOrderTransition("PREPARING", "READY_FOR_PICKUP"), true);

  // Invalid skips / unauthorized / terminal states
  assert.strictEqual(isValidShopkeeperOrderTransition("PLACED", "DELIVERED"), false);
  assert.strictEqual(isValidShopkeeperOrderTransition("PLACED", "PREPARING"), false);
  assert.strictEqual(isValidShopkeeperOrderTransition("PLACED", "READY_FOR_PICKUP"), false);
  assert.strictEqual(isValidShopkeeperOrderTransition("READY_FOR_PICKUP", "DELIVERED"), false);
  assert.strictEqual(isValidShopkeeperOrderTransition("READY_FOR_PICKUP", "ACCEPTED"), false);
  assert.strictEqual(isValidShopkeeperOrderTransition("REJECTED", "ACCEPTED"), false);
  assert.strictEqual(isValidShopkeeperOrderTransition("DELIVERED", "PREPARING"), false);
  assert.strictEqual(isValidShopkeeperOrderTransition("COMPLETED", "READY_FOR_PICKUP"), false);
});

test("[Task 5] Context-sensitive action mapping matches exact order status rules", () => {
  assert.deepStrictEqual(
    getShopkeeperOrderActions("PLACED").map((a) => a.nextStatus),
    ["REJECTED", "ACCEPTED"]
  );
  assert.deepStrictEqual(
    getShopkeeperOrderActions("ACCEPTED").map((a) => a.nextStatus),
    ["PREPARING"]
  );
  assert.deepStrictEqual(
    getShopkeeperOrderActions("PREPARING").map((a) => a.nextStatus),
    ["READY_FOR_PICKUP"]
  );
  assert.deepStrictEqual(getShopkeeperOrderActions("READY_FOR_PICKUP"), []);
  assert.deepStrictEqual(getShopkeeperOrderActions("REJECTED"), []);
  assert.deepStrictEqual(getShopkeeperOrderActions("DELIVERED"), []);
  assert.deepStrictEqual(getShopkeeperOrderActions("COMPLETED"), []);
});

test("[Task 5] Order detail page & server action enforce canonical transition checks and shop ownership", () => {
  const orderActionsSrc = fs.readFileSync(path.join(SHOP_DIR, "features/orders/actions.ts"), "utf8");
  const detailPageSrc = fs.readFileSync(path.join(SHOP_DIR, "app/orders/[id]/page.tsx"), "utf8");
  const detailClientSrc = fs.readFileSync(
    path.join(SHOP_DIR, "app/orders/[id]/OrderDetailActions.tsx"),
    "utf8"
  );

  assert(orderActionsSrc.includes("isValidShopkeeperOrderTransition("));
  assert(orderActionsSrc.includes('.eq("shop_id", auth.shopId)'));
  assert(orderActionsSrc.includes('.eq("status", existingOrder.status)'));
  assert(detailPageSrc.includes("<OrderDetailActions"));
  assert(detailClientSrc.includes("updateShopOrderStatusAction"));
  assert(detailClientSrc.includes("router.refresh()"));
  assert(detailClientSrc.includes("<RejectOrderDialog"));
});

// ---------------------------------------------------------------------
// Task 6: Reject Order Confirmation
// ---------------------------------------------------------------------
test("[Task 6] Reject confirmation dialog guards against accidental rejection and repeated clicks without browser alert()", () => {
  const dialogSrc = fs.readFileSync(path.join(SHOP_DIR, "components/RejectOrderDialog.tsx"), "utf8");
  const ordersClientSrc = fs.readFileSync(path.join(SHOP_DIR, "app/orders/OrdersClient.tsx"), "utf8");

  assert(dialogSrc.includes('role="dialog"') && dialogSrc.includes('aria-modal="true"'));
  assert(dialogSrc.includes("Confirm Reject Order") && dialogSrc.includes("Keep Order"));
  assert(dialogSrc.includes("disabled={isSubmitting}"));
  assert(ordersClientSrc.includes("<RejectOrderDialog"));
  assert(ordersClientSrc.includes("setRejectTarget(order)"));
  assert(!ordersClientSrc.includes("alert("), "OrdersClient must not use browser alert()");
  assert(!ordersClientSrc.match(/onClick=\{\(\)\s*=>\s*handleUpdateStatus\(order\.id,\s*"REJECTED"\)/), "Direct click without dialog confirmation must be removed");
});

// Cleanup compiled temp dir
try {
  fs.rmSync(compileOutDir, { recursive: true, force: true });
} catch {}

console.log("\n==================================================================");
console.log(` Phase 1 Verification Complete: ${passed} passed, ${failed} failed.`);
console.log("==================================================================\n");

if (failed > 0) {
  process.exit(1);
}
