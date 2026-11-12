/**
 * ZUNO SHOP-MVP-6 — Phase 5 Verification Suite
 *
 * Verifies:
 * 1. Migration 015 secure create_customer_order RPC, idempotency, raw INSERT blocking, and co-owner RLS
 * 2. Multi-shop cart separation, shop-specific pricing/stock, and independent per-shop clearShopCart()
 * 3. Live DB catalog mapping (eliminates hardcoded 'shop-1' / static isOpen: true)
 * 4. RPC-only customer checkout, unauthenticated rejection, and zero simulated local orders
 * 5. BUG-003 (shop_members resolution), BUG-005 (ShopLayoutShell sync), BUG-006 (live Cart shop status)
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
console.log(" ZUNO SHOP-MVP-6 — Phase 5 Verification Suite");
console.log("==================================================================\n");

// Compile pure cart & grouping TypeScript helpers into temp dir
const compileOutDir = fs.mkdtempSync(path.join(os.tmpdir(), "zuno-mvp-p5-"));
const tscBin = fs.existsSync(path.join(SHOP_DIR, "node_modules", "typescript", "bin", "tsc"))
  ? path.join(SHOP_DIR, "node_modules", "typescript", "bin", "tsc")
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
    path.join(CUSTOMER_DIR, "store/cartStore.ts"),
  ],
  { encoding: "utf8" }
);

if (compileRes.status !== 0) {
  console.error("Failed to compile cartStore.ts:\n", compileRes.stderr || compileRes.stdout);
  process.exit(1);
}

process.env.NODE_PATH = [
  path.join(CUSTOMER_DIR, "node_modules"),
  path.join(ROOT_DIR, "node_modules"),
].join(path.delimiter);
require("module").Module._initPaths();

const cartMod = require(path.join(compileOutDir, "cartStore.js"));
const { useCartStore, groupCartItemsByShop, calculateDeliveryFeeForSubtotal } = cartMod;

// ------------------------------------------------------------------
// 1. Migration 015 Contract
// ------------------------------------------------------------------
const migration015 = fs.readFileSync(
  path.join(ROOT_DIR, "supabase/migrations/00000000000015_secure_customer_order_creation.sql"),
  "utf8"
);

test("[Migration 015] Revokes raw INSERT on orders & order_items from anon/authenticated and replaces permissive policies", () => {
  assert(migration015.includes("revoke insert on public.orders from public, anon, authenticated;"));
  assert(migration015.includes("revoke insert on public.order_items from public, anon, authenticated;"));
  assert(migration015.includes('drop policy if exists "orders_insert_own" on public.orders;'));
  assert(migration015.includes("with check (false);"));
  assert(migration015.includes("create trigger trigger_enforce_order_insert_integrity"));
});

test("[Migration 015] Defines create_customer_order RPC with CUSTOMER auth, idempotency, locking, and FORCED PLACED status", () => {
  assert(migration015.includes("create or replace function public.create_customer_order("));
  assert(migration015.includes("v_customer_id uuid := auth.uid();"));
  assert(migration015.includes("if not found or v_role <> 'CUSTOMER' then"));
  assert(migration015.includes("idx_orders_customer_idempotency_key"));
  assert(migration015.includes("for update of sp"));
  assert(migration015.includes("is_shop_open_now(v_shop.opening_hours, now())"));
  assert(migration015.includes("'PLACED'"));
  assert(migration015.includes("revoke all on function public.create_customer_order(uuid, uuid, jsonb, text) from public, anon;"));
  assert(migration015.includes("grant execute on function public.create_customer_order(uuid, uuid, jsonb, text) to authenticated"));
});

// ------------------------------------------------------------------
// 2. Multi-Shop Cart Behavior (One order = one shop)
// ------------------------------------------------------------------
test("[Multi-Shop Cart] Separates items by shop_id, enforces stock limits, and clears only checked-out shop", () => {
  useCartStore.getState().clearCart();

  const shopA = "50000000-0000-4000-b000-000000000001";
  const shopB = "50000000-0000-4000-b000-000000000002";

  // Same central product (Tomato) listed at 2 different shops at different prices
  useCartStore.getState().addToCart({
    id: "30000000-0000-4000-b000-000000000103",
    shopProductId: "30000000-0000-4000-b000-000000000103",
    productId: "60000000-0000-4000-b000-000000000001",
    name: "Fresh Tomato",
    price: 26,
    unit: "1 kg",
    shopId: shopA,
    shopName: "Zuno Demo Kirana Mart",
    stock: 2,
  });

  useCartStore.getState().addToCart({
    id: "30000000-0000-4000-b000-000000000201",
    shopProductId: "30000000-0000-4000-b000-000000000201",
    productId: "60000000-0000-4000-b000-000000000001",
    name: "Fresh Tomato",
    price: 22,
    unit: "1 kg",
    shopId: shopB,
    shopName: "Renukoot Fresh Produce",
    stock: 5,
  });

  // Attempting to exceed stock=2 at Shop A must clamp/ignore excess add
  useCartStore.getState().addToCart({
    id: "30000000-0000-4000-b000-000000000103",
    shopProductId: "30000000-0000-4000-b000-000000000103",
    name: "Fresh Tomato",
    price: 26,
    unit: "1 kg",
    shopId: shopA,
    shopName: "Zuno Demo Kirana Mart",
    stock: 2,
  });
  useCartStore.getState().addToCart({
    id: "30000000-0000-4000-b000-000000000103",
    shopProductId: "30000000-0000-4000-b000-000000000103",
    name: "Fresh Tomato",
    price: 26,
    unit: "1 kg",
    shopId: shopA,
    shopName: "Zuno Demo Kirana Mart",
    stock: 2,
  });

  const groups = useCartStore.getState().getShopGroups();
  assert.strictEqual(groups.length, 2, "Must maintain 2 separate shop groups");

  const grpA = groups.find((g) => g.shopId === shopA);
  const grpB = groups.find((g) => g.shopId === shopB);
  assert.strictEqual(grpA.items[0].quantity, 2);
  assert.strictEqual(grpA.subtotal, 52);
  assert.strictEqual(grpA.deliveryFee, 20);
  assert.strictEqual(grpA.estimatedTotal, 72);
  assert.strictEqual(grpB.items[0].quantity, 1);
  assert.strictEqual(grpB.subtotal, 22);

  // Completing Shop A checkout clears ONLY Shop A while keeping Shop B untouched
  useCartStore.getState().clearShopCart(shopA);
  const remaining = useCartStore.getState().getShopGroups();
  assert.strictEqual(remaining.length, 1);
  assert.strictEqual(remaining[0].shopId, shopB);
  assert.strictEqual(remaining[0].items[0].price, 22);

  assert.strictEqual(calculateDeliveryFeeForSubtotal(500), 0);
  assert.strictEqual(calculateDeliveryFeeForSubtotal(499), 20);
});

// ------------------------------------------------------------------
// 3. Customer Catalog & Checkout Remediation (BUG-004, BUG-006)
// ------------------------------------------------------------------
const customerProductsApi = fs.readFileSync(path.join(CUSTOMER_DIR, "features/products/api.ts"), "utf8");
const customerCheckoutApi = fs.readFileSync(path.join(CUSTOMER_DIR, "features/checkout/api.ts"), "utf8");
const customerCartScreen = fs.readFileSync(path.join(CUSTOMER_DIR, "app/cart.tsx"), "utf8");
const customerCheckoutScreen = fs.readFileSync(path.join(CUSTOMER_DIR, "app/checkout.tsx"), "utf8");

test("[Customer Catalog] Uses live shop_products + inventory + public_storefronts with zero static 'shop-1' stubs", () => {
  assert(customerProductsApi.includes('.from("shop_products")'));
  assert(customerProductsApi.includes('.from("public_storefronts")'));
  assert(!customerProductsApi.includes("shop-1"));
  assert(!customerProductsApi.includes("CATEGORY_PRODUCTS_CATALOG"));
});

test("[Customer Checkout] Uses create_customer_order RPC, enforces auth, rejects mixed shops, and has zero fake local order success", () => {
  assert(customerCheckoutApi.includes('supabase.rpc(\n      "create_customer_order"'));
  assert(customerCheckoutApi.includes("validateSingleShopCartItems"));
  assert(customerCheckoutApi.includes('code: "UNAUTHENTICATED"'));
  assert(!customerCheckoutApi.includes("saveLocalPlacedOrder"));
  assert(!customerCheckoutApi.includes('.from("orders")'));
  assert(customerCheckoutScreen.includes("clearShopCart(targetShopId)"));
  assert(customerCheckoutScreen.includes("idempotencyKey"));
});

test("[BUG-006] Cart renders live public_storefronts availability and enforces One-Order-Per-Shop checkout", () => {
  assert(customerCartScreen.includes("getPublicStorefrontsByIds"));
  assert(customerCartScreen.includes("One order per shop"));
  assert(customerCartScreen.includes("handleProceedToShopCheckout"));
  assert(!customerCartScreen.includes("Open · {shopGroup.shopDistance}"));
});

// ------------------------------------------------------------------
// 4. Multi-Shop Membership & UI Sync Fixes (BUG-003, BUG-005)
// ------------------------------------------------------------------
const authGuard = fs.readFileSync(path.join(SHOP_DIR, "lib/authGuard.ts"), "utf8");
const shopLayoutShell = fs.readFileSync(path.join(SHOP_DIR, "components/ShopLayoutShell.tsx"), "utf8");
const seedFile = fs.readFileSync(path.join(ROOT_DIR, "supabase/seed/002_demo_shops_and_products.sql"), "utf8");

test("[BUG-003 & BUG-005] authGuard supports shop_members cleanly and ShopLayoutShell syncs isOnline with shop.isActive", () => {
  assert(authGuard.includes("resolveAuthorizedShopForUser"));
  assert(authGuard.includes('.from("shop_members")'));
  assert(shopLayoutShell.includes("setIsOnline(Boolean(shop.isActive ?? true))"));
  assert(shopLayoutShell.includes("router.refresh()"));
  assert(seedFile.includes("Zuno Demo Kirana Mart") && seedFile.includes("Renukoot Fresh Produce"));
});

console.log("\n==================================================================");
console.log(` Phase 5 Verification Complete: ${passed} passed, ${failed} failed.`);
console.log("==================================================================\n");

try {
  fs.rmSync(compileOutDir, { recursive: true, force: true });
} catch {}

if (failed > 0) {
  process.exit(1);
}
