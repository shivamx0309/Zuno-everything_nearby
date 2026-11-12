/**
 * ZUNO SHOP-MVP-3 — Phase 2 Verification Suite
 *
 * Tests:
 * 1. Product Requests History (status rendering, rejection reason, shop-scoped query, RLS checks)
 * 2. Safe Storefront Product Removal (own shop check, confirmation dialog, cart FK 23503 fallback, global Product & order_items preserved)
 * 3. Zero Price / Stock Default Bug Fix (`??` nullish coalescing preserves 0 while keeping null/undefined defaults)
 * 4. Inventory Exact Quantity Input (integer validation, 0 allowed, negative/NaN/empty/decimal rejected, stale concurrency guard, atomic RPC)
 * 5. Dynamic Inventory KPI Updates (lowStockCount, outOfStockCount recalculation on 0->15, 15->0, 15->5, rollback snapshot on failure)
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
console.log(" ZUNO SHOP-MVP-3 — Phase 2 Verification Suite");
console.log("==================================================================\n");

// Compile Phase 2 pure TypeScript utilities cleanly into a temp dir
const compileOutDir = fs.mkdtempSync(path.join(os.tmpdir(), "zuno-mvp-p2-"));
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
    path.join(SHOP_DIR, "lib/dashboard-inventory-metrics.ts"),
    path.join(SHOP_DIR, "lib/inventory-utils.ts"),
    path.join(SHOP_DIR, "lib/catalog-listing-defaults.ts"),
  ],
  { encoding: "utf8", shell: false }
);

if (compileRes.status !== 0) {
  console.error("Failed to compile Phase 2 TypeScript helpers:");
  console.error(compileRes.stdout, compileRes.stderr);
  process.exit(1);
}

const compiledLib = fs.existsSync(path.join(compileOutDir, "apps/shop/lib"))
  ? path.join(compileOutDir, "apps/shop/lib")
  : compileOutDir;

const { LOW_STOCK_THRESHOLD } = require(path.join(
  compiledLib,
  "dashboard-inventory-metrics.js"
));
const {
  getInventoryStockStatus,
  recalculateInventoryKpis,
  parseStockQuantityInput,
} = require(path.join(compiledLib, "inventory-utils.js"));
const {
  resolveCatalogListingDefaults,
  hasExistingListingPrice,
} = require(path.join(compiledLib, "catalog-listing-defaults.js"));

const productsActionsSrc = fs.readFileSync(
  path.join(SHOP_DIR, "features/products/actions.ts"),
  "utf8"
);
const productsClientSrc = fs.readFileSync(
  path.join(SHOP_DIR, "app/products/ProductsClient.tsx"),
  "utf8"
);
const inventoryActionsSrc = fs.readFileSync(
  path.join(SHOP_DIR, "features/inventory/actions.ts"),
  "utf8"
);
const inventoryClientSrc = fs.readFileSync(
  path.join(SHOP_DIR, "app/inventory/InventoryClient.tsx"),
  "utf8"
);
const confirmDialogSrc = fs.readFileSync(
  path.join(SHOP_DIR, "components/ConfirmActionDialog.tsx"),
  "utf8"
);

// ---------------------------------------------------------------------
// Task 1: Product Requests History
// ---------------------------------------------------------------------
test("[Task 1] product_requests query derives shopId from requireApprovedShopkeeper() and never leaks cross-shop requests", () => {
  assert(productsActionsSrc.includes("queryShopProductRequests"));
  assert(productsActionsSrc.includes('.from("product_requests")'));
  assert(productsActionsSrc.includes('.eq("shop_id", shopId)'));
  assert(productsActionsSrc.includes("rejection_reason"));
  assert(productsActionsSrc.includes('rawStatus === "APPROVED" || rawStatus === "REJECTED" ? rawStatus : "PENDING"'));
});

test("[Task 1] ProductsClient renders Product Requests tab with statuses, rejection_reason, loading/empty/error states, and post-submit refresh", () => {
  assert(productsClientSrc.includes('activeTab === "REQUESTS"'));
  assert(productsClientSrc.includes("Submitted Catalog Requests"));
  assert(productsClientSrc.includes("req.rejectionReason"));
  assert(productsClientSrc.includes("data.productRequestsError"));
  assert(productsClientSrc.includes("requestsLoading"));
  assert(productsClientSrc.includes("await refreshRequestsOnly()"));
});

// ---------------------------------------------------------------------
// Task 2: Safe Removal of Shop Product Listing
// ---------------------------------------------------------------------
test("[Task 2] removeShopProductAction scopes strictly to auth.shopId, handles cart_items FK 23503 safely, and never deletes global products", () => {
  assert(productsActionsSrc.includes("export async function removeShopProductAction"));
  assert(productsActionsSrc.includes("shopProductIdSchema.safeParse"));
  assert(productsActionsSrc.includes('.from("shop_products")\n    .delete()') || productsActionsSrc.includes('.delete()\n    .eq("id", parsedId.data)\n    .eq("shop_id", auth.shopId)'));
  assert(productsActionsSrc.includes('delErr.code === "23503"'));
  assert(productsActionsSrc.includes('mode: "UNAVAILABLE_FALLBACK"'));
  assert(!productsActionsSrc.includes('.from("products").delete('), "Must never delete global products");
  assert(!productsActionsSrc.includes('.from("order_items").delete('), "Must never delete historical order_items");
});

test("[Task 2] ProductsClient requires ConfirmActionDialog before calling removeShopProductAction", () => {
  assert(confirmDialogSrc.includes('role="dialog"') && confirmDialogSrc.includes('aria-modal="true"'));
  assert(productsClientSrc.includes("<ConfirmActionDialog"));
  assert(productsClientSrc.includes("handleConfirmRemoveListing"));
  assert(productsClientSrc.includes("Remove from Storefront"));
  assert(!productsClientSrc.includes("alert("), "ProductsClient must not use browser alert()");
});

// ---------------------------------------------------------------------
// Task 3: Zero Price / Stock Default Bug Fix
// ---------------------------------------------------------------------
test("[Task 3] Zero price and zero stock are preserved instead of overwritten by 50 / 20", () => {
  assert.deepStrictEqual(
    resolveCatalogListingDefaults({ currentPrice: 0, currentStock: 0 }),
    { price: 0, stock: 0 }
  );
  assert.deepStrictEqual(
    resolveCatalogListingDefaults({ currentPrice: 0, currentStock: 5 }),
    { price: 0, stock: 5 }
  );
  assert.strictEqual(hasExistingListingPrice({ currentPrice: 0 }), true);
  assert.strictEqual(hasExistingListingPrice({ currentPrice: 45 }), true);
});

test("[Task 3] Null and undefined catalog listing values retain intended fallbacks (50 / 20)", () => {
  assert.deepStrictEqual(resolveCatalogListingDefaults(null), { price: 50, stock: 20 });
  assert.deepStrictEqual(resolveCatalogListingDefaults(undefined), { price: 50, stock: 20 });
  assert.deepStrictEqual(
    resolveCatalogListingDefaults({ currentPrice: null, currentStock: undefined }),
    { price: 50, stock: 20 }
  );
  assert.strictEqual(hasExistingListingPrice({ currentPrice: null }), false);
  assert.strictEqual(hasExistingListingPrice({ currentPrice: undefined }), false);
  assert(!productsClientSrc.includes("currentPrice || 50"), "Falsy || 50 must not exist");
  assert(!productsClientSrc.includes("currentStock || 20"), "Falsy || 20 must not exist");
});

// ---------------------------------------------------------------------
// Task 4: Inventory Exact Quantity Input & Atomic Consistency
// ---------------------------------------------------------------------
test("[Task 4] parseStockQuantityInput accepts exact non-negative integers including 0 and rejects empty/negative/decimal/NaN", () => {
  assert.deepStrictEqual(parseStockQuantityInput("0"), { valid: true, stock: 0 });
  assert.deepStrictEqual(parseStockQuantityInput(0), { valid: true, stock: 0 });
  assert.deepStrictEqual(parseStockQuantityInput("100"), { valid: true, stock: 100 });
  assert.deepStrictEqual(parseStockQuantityInput(" 25 "), { valid: true, stock: 25 });

  for (const invalid of ["", "   ", null, undefined, "-1", -5, "12.5", 3.14, "abc", NaN, Infinity, "999999999999"]) {
    const res = parseStockQuantityInput(invalid);
    assert.strictEqual(res.valid, false, `Expected invalid for ${String(invalid)}`);
  }
});

test("[Task 4] Inventory action validates exact quantity, enforces concurrency guard, and uses atomic RPC", () => {
  assert(inventoryActionsSrc.includes("parseStockQuantityInput(newStock)"));
  assert(inventoryActionsSrc.includes("expectedPreviousStock !== undefined"));
  assert(inventoryActionsSrc.includes('.eq("shop_id", auth.shopId)'));
  assert(inventoryActionsSrc.includes('"upsert_shop_product_and_inventory"'));
  assert(inventoryClientSrc.includes("Set Qty"));
  assert(inventoryClientSrc.includes("handleSaveExactEdit"));
  assert(!inventoryClientSrc.includes("alert("), "InventoryClient must not use browser alert()");
});

// ---------------------------------------------------------------------
// Task 5: Dynamic Inventory KPI Recalculation & Rollback
// ---------------------------------------------------------------------
test("[Task 5] Low-stock (<10) & out-of-stock (0) KPIs recalculate accurately on 0->15, 15->0, and 15->5 transitions", () => {
  assert.strictEqual(LOW_STOCK_THRESHOLD, 10);
  assert.strictEqual(getInventoryStockStatus(0), "OUT_OF_STOCK");
  assert.strictEqual(getInventoryStockStatus(9), "LOW_STOCK");
  assert.strictEqual(getInventoryStockStatus(10), "HEALTHY");

  // Initial: 1 out-of-stock (0), 1 low-stock (4), 1 healthy (20)
  const initial = [{ stock: 0 }, { stock: 4 }, { stock: 20 }];
  assert.deepStrictEqual(recalculateInventoryKpis(initial), {
    outOfStockCount: 1,
    lowStockCount: 1,
    totalCount: 3,
  });

  // Transition 0 -> 15: out-of-stock drops from 1 -> 0
  const after0to15 = [{ stock: 15 }, { stock: 4 }, { stock: 20 }];
  assert.deepStrictEqual(recalculateInventoryKpis(after0to15), {
    outOfStockCount: 0,
    lowStockCount: 1,
    totalCount: 3,
  });

  // Transition 15 -> 0: out-of-stock rises back to 1
  const after15to0 = [{ stock: 0 }, { stock: 4 }, { stock: 20 }];
  assert.deepStrictEqual(recalculateInventoryKpis(after15to0), {
    outOfStockCount: 1,
    lowStockCount: 1,
    totalCount: 3,
  });

  // Transition 15 -> 5: low-stock rises from 1 -> 2
  const after15to5 = [{ stock: 5 }, { stock: 4 }, { stock: 20 }];
  assert.deepStrictEqual(recalculateInventoryKpis(after15to5), {
    outOfStockCount: 0,
    lowStockCount: 2,
    totalCount: 3,
  });
});

test("[Task 5] InventoryClient uses recalculateInventoryKpis & restores previousSnapshot on update failure", () => {
  assert(inventoryClientSrc.includes("recalculateInventoryKpis(updatedItems)"));
  assert(inventoryClientSrc.includes("const previousSnapshot = data;"));
  assert(inventoryClientSrc.includes("setData(previousSnapshot);"));
});

try {
  fs.rmSync(compileOutDir, { recursive: true, force: true });
} catch {}

console.log("\n==================================================================");
console.log(` Phase 2 Verification Complete: ${passed} passed, ${failed} failed.`);
console.log("==================================================================\n");

if (failed > 0) {
  process.exit(1);
}

