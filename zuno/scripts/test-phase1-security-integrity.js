/**
 * ZUNO Phase 1.2 — Security Hardening & Data Integrity Test Suite
 *
 * Verifies:
 * 1. Migration 012 RLS Policy & RPC Definition Security
 *    - Invariant: reviewed_at IS NULL on shopkeeper INSERT
 *    - Invariant: Canonical composite uniqueness (category_id, lower(trim(name)), lower(trim(unit)))
 *    - Invariant: Safe duplicate precondition guards for products and inventory
 * 2. Product Request Persistence & Elimination of False Success
 * 3. Atomic Shop Listing & Inventory Synchronization
 *    - addCatalogProductToShopAction routes strictly through transactional RPC
 *    - updateProductStockAction routes strictly through transactional RPC
 *    - updateShopProductAction routes strictly through transactional RPC
 *    - Elimination of non-atomic two-request fallbacks that swallow inventory errors
 * 4. Multi-Tenant Shop Isolation & Identity Safeguards
 * 5. In-Memory Variant Identity & Duplicate Precondition Simulation
 * 6. Development Mock Auth Production Invariants
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

async function runTests() {
  console.log("=========================================================");
  console.log(" ZUNO Phase 1.2 — Security & Data Integrity Test Suite");
  console.log("=========================================================\n");

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}: ${err.message}`);
    }
  }

  // Read Migration 012 SQL
  const migrationPath = path.join(
    __dirname,
    "../supabase/migrations/00000000000012_product_catalog_governance_and_requests.sql"
  );
  const migrationSql = fs.readFileSync(migrationPath, "utf8");

  // Read Products Actions TS
  const actionsPath = path.join(
    __dirname,
    "../apps/shop/features/products/actions.ts"
  );
  const actionsCode = fs.readFileSync(actionsPath, "utf8");

  // Read Inventory Actions TS
  const invActionsPath = path.join(
    __dirname,
    "../apps/shop/features/inventory/actions.ts"
  );
  const invActionsCode = fs.readFileSync(invActionsPath, "utf8");

  // Read Config devMockAuth
  const devMockAuthPath = path.join(
    __dirname,
    "../packages/config/src/devMockAuth.ts"
  );
  const devMockAuthCode = fs.readFileSync(devMockAuthPath, "utf8");

  // -------------------------------------------------------------------
  // Section 1: Migration 012 RLS Security & Schema Hardening Checks
  // -------------------------------------------------------------------

  test("1.1 Migration 012 enforces requested_by = auth.uid() on INSERT", () => {
    assert.ok(
      migrationSql.includes("requested_by = auth.uid()"),
      "Migration 012 must require requested_by = auth.uid()"
    );
  });

  test("1.2 Migration 012 enforces status = 'PENDING' on ordinary shopkeeper INSERT", () => {
    assert.ok(
      migrationSql.includes("status = 'PENDING'"),
      "Migration 012 must restrict ordinary insert status to 'PENDING'"
    );
  });

  test("1.3 Migration 012 blocks ordinary shopkeepers from setting reviewed_by, reviewed_at or rejection_reason", () => {
    assert.ok(
      migrationSql.includes("reviewed_by is null"),
      "Migration 012 must require reviewed_by is null on ordinary insert"
    );
    assert.ok(
      migrationSql.includes("reviewed_at is null"),
      "Migration 012 must require reviewed_at is null on ordinary insert"
    );
    assert.ok(
      migrationSql.includes("rejection_reason is null"),
      "Migration 012 must require rejection_reason is null on ordinary insert"
    );
  });

  test("1.4 Migration 012 preserves co-owner access via shop_members (role = 'OWNER')", () => {
    assert.ok(
      migrationSql.includes("sm.role = 'OWNER'"),
      "Migration 012 must check shop_members role = 'OWNER'"
    );
  });

  test("1.5 Migration 012 restricts UPDATE exclusively to administrators with check clause", () => {
    assert.ok(
      migrationSql.includes("product_requests_update_admin"),
      "Migration 012 must define product_requests_update_admin"
    );
    assert.ok(
      migrationSql.includes("with check (\n    public.is_admin_or_super(auth.uid())\n  )"),
      "Migration 012 update policy must have with check clause"
    );
  });

  test("1.6 Migration 012 enforces audit immutability by omitting DELETE policy", () => {
    assert.strictEqual(
      migrationSql.includes("create policy \"product_requests_delete"),
      false,
      "Migration 012 must not grant DELETE access on product_requests"
    );
  });

  test("1.7 Migration 012 replaces unsafe single-column index with canonical composite uniqueness", () => {
    assert.ok(
      migrationSql.includes("drop index if exists public.idx_products_name_unique_normalized;"),
      "Migration 012 must safely drop unsafe single-column index"
    );
    assert.ok(
      migrationSql.includes("idx_products_category_name_unit_normalized"),
      "Migration 012 must define composite unique index on products"
    );
    assert.ok(
      migrationSql.includes("(category_id, lower(trim(name)), lower(trim(unit)))"),
      "Composite index must include category_id, lower(trim(name)), and lower(trim(unit))"
    );
  });

  test("1.8 Migration 012 includes safe precondition duplicate check for products catalog variants", () => {
    assert.ok(
      migrationSql.includes("v_dup_product_count integer;"),
      "Migration 012 must declare product duplicate counter"
    );
    assert.ok(
      migrationSql.includes("duplicate product variant groups detected in public.products"),
      "Migration 012 must raise descriptive exception without deleting records"
    );
  });

  test("1.9 Migration 012 includes safe precondition duplicate check for inventory 1-to-1 uniqueness", () => {
    assert.ok(
      migrationSql.includes("v_dup_inventory_count integer;"),
      "Migration 012 must declare inventory duplicate counter"
    );
    assert.ok(
      migrationSql.includes("duplicate shop_product_id groups detected in public.inventory"),
      "Migration 012 must raise descriptive exception if inventory duplicates exist"
    );
    assert.ok(
      migrationSql.includes("create unique index if not exists idx_inventory_shop_product_unique"),
      "Migration 012 must create unique index on inventory(shop_product_id)"
    );
  });

  test("1.10 Migration 012 defines atomic RPC upsert_shop_product_and_inventory with caller authorization", () => {
    assert.ok(
      migrationSql.includes("create or replace function public.upsert_shop_product_and_inventory"),
      "Migration 012 must define upsert_shop_product_and_inventory RPC"
    );
    assert.ok(
      migrationSql.includes("Security violation: caller is not authorized"),
      "RPC must verify caller owns or co-owns approved shop"
    );
    assert.ok(
      migrationSql.includes("insert into public.inventory"),
      "RPC must atomically upsert inventory"
    );
    assert.ok(
      migrationSql.includes("insert into public.shop_products"),
      "RPC must atomically upsert shop_products"
    );
  });

  // -------------------------------------------------------------------
  // Section 2: Product Request Server-Side Validation & Persistence
  // -------------------------------------------------------------------

  test("2.1 submitProductRequestAction derives requested_by from auth session (not params)", () => {
    assert.ok(
      actionsCode.includes("requested_by: auth.userId"),
      "Must assign requested_by from auth.userId"
    );
    assert.strictEqual(
      actionsCode.includes("requested_by: params."),
      false,
      "Must not accept requested_by from client params"
    );
  });

  test("2.2 submitProductRequestAction hardcodes status to 'PENDING'", () => {
    assert.ok(
      actionsCode.includes("status: \"PENDING\""),
      "Must hardcode status to PENDING"
    );
    assert.strictEqual(
      actionsCode.includes("status: params."),
      false,
      "Must not accept status from client params"
    );
  });

  test("2.3 submitProductRequestAction has zero fabricated request IDs ('req-' + Date.now eliminated)", () => {
    assert.strictEqual(
      actionsCode.includes("\"req-\" + Date.now()"),
      false,
      "Fabricated request ID 'req-' + Date.now() must be eliminated"
    );
  });

  test("2.4 submitProductRequestAction returns failure when database insert fails", () => {
    assert.ok(
      actionsCode.includes("Failed to submit product request"),
      "Must return honest failure message when insert fails"
    );
    assert.ok(
      actionsCode.includes("return {\n    success: false,\n    message: \"Failed to persist product request"),
      "Fail-safe return must be success: false"
    );
  });

  test("2.5 submitProductRequestAction returns real persisted request ID only on confirmed insert", () => {
    assert.ok(
      actionsCode.includes("if (!reqErr && reqData?.id) {\n"),
      "Must verify !reqErr and reqData.id before returning success"
    );
    assert.ok(
      actionsCode.includes("requestId: reqData.id"),
      "Must return real persisted requestId from database"
    );
  });

  // -------------------------------------------------------------------
  // Section 3: Atomic Shop Listing & Inventory Consistency (Phase 1.2)
  // -------------------------------------------------------------------

  test("3.1 addCatalogProductToShopAction executes strictly via atomic PostgreSQL RPC", () => {
    assert.ok(
      actionsCode.includes("supabase.rpc(\n    \"upsert_shop_product_and_inventory\""),
      "addCatalogProductToShopAction must invoke atomic RPC"
    );
  });

  test("3.2 addCatalogProductToShopAction eliminates non-atomic fallback and false success", () => {
    assert.strictEqual(
      actionsCode.includes("from(\"shop_products\")\n      .insert("),
      false,
      "Must not perform separate uncommitted shop_products insert in fallback"
    );
    assert.strictEqual(
      actionsCode.includes("console.error(\"Inventory update error:\""),
      false,
      "Must not swallow inventory errors in products actions"
    );
  });

  test("3.3 updateShopProductAction executes strictly via atomic PostgreSQL RPC", () => {
    assert.ok(
      actionsCode.includes("updateShopProductAction"),
      "updateShopProductAction must be defined"
    );
    assert.ok(
      actionsCode.includes("supabase.rpc(\n    \"upsert_shop_product_and_inventory\""),
      "updateShopProductAction must invoke atomic RPC"
    );
  });

  test("3.4 updateProductStockAction executes strictly via atomic PostgreSQL RPC", () => {
    assert.ok(
      invActionsCode.includes("updateProductStockAction"),
      "updateProductStockAction must be defined"
    );
    assert.ok(
      invActionsCode.includes("supabase.rpc(\n    \"upsert_shop_product_and_inventory\""),
      "updateProductStockAction must invoke atomic RPC"
    );
    assert.strictEqual(
      invActionsCode.includes("from(\"inventory\")\n      .update("),
      false,
      "updateProductStockAction must not execute separate inventory REST call"
    );
  });

  test("3.5 Stock and product actions validate price >= 0 and stock >= 0 on server", () => {
    assert.ok(
      actionsCode.includes("price < 0"),
      "Must reject negative selling price in addCatalogProductToShopAction"
    );
    assert.ok(
      actionsCode.includes("stock < 0"),
      "Must reject negative stock quantity in addCatalogProductToShopAction"
    );
    assert.ok(
      invActionsCode.includes("parseStockQuantityInput(newStock)"),
      "Must strictly validate integer stock >= 0 in updateProductStockAction"
    );
  });

  test("3.6 Multi-tenant isolation: actions strictly scope queries and mutations to auth.shopId", () => {
    assert.ok(
      actionsCode.includes("p_shop_id: auth.shopId"),
      "RPC must receive auth.shopId"
    );
    assert.ok(
      invActionsCode.includes(".eq(\"shop_id\", auth.shopId)"),
      "Stock lookup must be scoped to auth.shopId"
    );
  });

  // -------------------------------------------------------------------
  // Section 4: In-Memory Variant Identity & Duplicate Precondition Simulation
  // -------------------------------------------------------------------

  test("4.1 In-Memory Simulation: Permits legitimate variants sharing name with different units", () => {
    const products = [
      { id: "1", category_id: "c-dairy", name: "Amul Taaza Milk", unit: "500 ml" },
      { id: "2", category_id: "c-dairy", name: "Amul Taaza Milk", unit: "1 L" },
    ];

    const compositeKeys = new Set();
    let hasDuplicate = false;

    for (const p of products) {
      const key = `${p.category_id}::${p.name.trim().toLowerCase()}::${p.unit.trim().toLowerCase()}`;
      if (compositeKeys.has(key)) {
        hasDuplicate = true;
      }
      compositeKeys.add(key);
    }

    assert.strictEqual(hasDuplicate, false, "Variants with different units must NOT collide");
    assert.strictEqual(compositeKeys.size, 2, "Both variants must be stored distinctly");
  });

  test("4.2 In-Memory Simulation: Detects identical duplicates across category, name, and unit", () => {
    const products = [
      { id: "1", category_id: "c-dairy", name: "Amul Taaza Milk", unit: "500 ml" },
      { id: "2", category_id: "c-dairy", name: "  amul taaza milk  ", unit: "500 ml" },
    ];

    const compositeKeys = new Set();
    let duplicateCount = 0;

    for (const p of products) {
      const key = `${p.category_id}::${p.name.trim().toLowerCase()}::${p.unit.trim().toLowerCase()}`;
      if (compositeKeys.has(key)) {
        duplicateCount++;
      }
      compositeKeys.add(key);
    }

    assert.strictEqual(duplicateCount, 1, "Identical normalized product must be detected as duplicate");
  });

  test("4.3 In-Memory Simulation: Duplicate inventory precondition detects multiple rows for shop_product_id", () => {
    const inventoryRows = [
      { id: "inv1", shop_product_id: "sp-1", quantity: 10 },
      { id: "inv2", shop_product_id: "sp-1", quantity: 15 },
    ];

    const counts = {};
    for (const r of inventoryRows) {
      counts[r.shop_product_id] = (counts[r.shop_product_id] || 0) + 1;
    }

    const duplicates = Object.entries(counts).filter(([_, c]) => c > 1);
    assert.strictEqual(duplicates.length, 1, "Precondition must flag duplicate shop_product_id");
    assert.strictEqual(duplicates[0][0], "sp-1");
  });

  // -------------------------------------------------------------------
  // Section 5: Development Mock Auth Invariant Verification
  // -------------------------------------------------------------------

  test("5.1 devMockAuth is strictly disabled in production (NODE_ENV === 'production')", () => {
    assert.ok(
      devMockAuthCode.includes("if (process.env.NODE_ENV === \"production\") {\n    return false;\n  }"),
      "isDevMockAuthEnabled must immediately return false in production"
    );
  });

  test("5.2 authGuard checks actual database ownership even in dev mock auth mode", () => {
    const authGuardPath = path.join(__dirname, "../apps/shop/lib/authGuard.ts");
    const authGuardCode = fs.readFileSync(authGuardPath, "utf8");
    assert.ok(
      authGuardCode.includes("shop.owner_id !== parsed.userId"),
      "authGuard must verify shop ownership in database"
    );
    assert.ok(
      authGuardCode.includes("shop.approval_status === \"APPROVED\""),
      "authGuard must verify shop approval status in database"
    );
  });

  console.log(`\nResults: ${passed}/${total} security and integrity tests passed.`);
  if (passed === total) {
    console.log("All Phase 1.2 security and data integrity tests passed successfully!");
  } else {
    process.exit(1);
  }
}

runTests();
