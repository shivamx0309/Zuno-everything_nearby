/**
 * ZUNO SHOP-P0 — Security & Live Runtime Remediation Regression Suite
 *
 * Offline / static / unit / logic verification covering:
 * - P0-A: Non-recursive Orders <-> Deliveries RLS helpers & policies
 * - P0-B: Locked down approve_or_reject_shop RPC
 * - P0-C: Secured register_shop_application RPC + server register route
 * - P0-D: Shopkeeper SELECT policies on shop_products & inventory
 * - P0-E: Orders, Dashboard, Analytics & Earnings schema alignment & error handling
 * - P0-F: Least-privilege fulfillment context RPC & scoped address RLS
 * - P0-G: Public storefronts view & authenticated-only /status endpoint
 * - P0-H: Server authorization guards on /products/new & /products/[id]
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const SHOP_DIR = path.join(ROOT_DIR, "apps/shop");
const MIGRATION_013_PATH = path.join(
  ROOT_DIR,
  "supabase/migrations/00000000000013_p0_security_and_rls_remediation.sql"
);

const m013 = fs.readFileSync(MIGRATION_013_PATH, "utf8");
const m013Lower = m013.toLowerCase();

const ordersActions = fs.readFileSync(path.join(SHOP_DIR, "features/orders/actions.ts"), "utf8");
const ordersClient = fs.readFileSync(path.join(SHOP_DIR, "app/orders/OrdersClient.tsx"), "utf8");
const orderDetailPage = fs.readFileSync(path.join(SHOP_DIR, "app/orders/[id]/page.tsx"), "utf8");
const earningsActions = fs.readFileSync(path.join(SHOP_DIR, "features/earnings/actions.ts"), "utf8");
const earningsClient = fs.readFileSync(path.join(SHOP_DIR, "app/earnings/EarningsClient.tsx"), "utf8");
const dashboardActions = fs.readFileSync(path.join(SHOP_DIR, "features/dashboard/actions.ts"), "utf8");
const dashboardClient = fs.readFileSync(path.join(SHOP_DIR, "app/dashboard/ShopDashboardClient.tsx"), "utf8");
const analyticsActions = fs.readFileSync(path.join(SHOP_DIR, "features/analytics/actions.ts"), "utf8");
const productsActions = fs.readFileSync(path.join(SHOP_DIR, "features/products/actions.ts"), "utf8");
const newProductPage = fs.readFileSync(path.join(SHOP_DIR, "app/products/new/page.tsx"), "utf8");
const editProductPage = fs.readFileSync(path.join(SHOP_DIR, "app/products/[id]/page.tsx"), "utf8");
const registerRoute = fs.readFileSync(path.join(SHOP_DIR, "app/api/auth/register/route.ts"), "utf8");
const loginRoute = fs.readFileSync(path.join(SHOP_DIR, "app/api/auth/login/route.ts"), "utf8");
const statusRoute = fs.readFileSync(path.join(SHOP_DIR, "app/api/auth/status/route.ts"), "utf8");
const statusPage = fs.readFileSync(path.join(SHOP_DIR, "app/status/page.tsx"), "utf8");
const authApi = fs.readFileSync(path.join(SHOP_DIR, "features/auth/api.ts"), "utf8");
const customerShopsApi = fs.readFileSync(path.join(ROOT_DIR, "apps/customer/features/shops/api.ts"), "utf8");
const customerOrdersApi = fs.readFileSync(path.join(ROOT_DIR, "apps/customer/features/orders/api.ts"), "utf8");
const deliveryApi = fs.readFileSync(path.join(ROOT_DIR, "apps/delivery/features/deliveries/api.ts"), "utf8");

let passed = 0;
let failed = 0;

function test(group, name, fn) {
  try {
    fn();
    passed++;
    console.log(`[PASS] [${group}] ${name}`);
  } catch (err) {
    failed++;
    console.error(`[FAIL] [${group}] ${name}: ${err.message}`);
  }
}

function extractFunctionBody(sql, fnName) {
  const regex = new RegExp(
    `create or replace function public\\.${fnName}\\b[\\s\\S]*?\\$\\$\\s*language[^;]*;`,
    "i"
  );
  const match = sql.match(regex);
  return match ? match[0] : "";
}

console.log("==================================================================");
console.log(" ZUNO SHOP-P0 — Security & Runtime Remediation Verification");
console.log("==================================================================\n");

// P0-A: Non-recursive RLS
test("P0-A", "Migration 013 breaks orders <-> deliveries policy recursion using SECURITY DEFINER helpers", () => {
  const riderOrderFn = extractFunctionBody(m013, "is_assigned_delivery_partner_for_order");
  const custOrderFn = extractFunctionBody(m013, "is_customer_of_order");
  const shopOrderFn = extractFunctionBody(m013, "is_shopkeeper_of_order");

  assert(riderOrderFn.length > 0, "is_assigned_delivery_partner_for_order must exist");
  assert(!riderOrderFn.toLowerCase().includes("public.orders"), "Rider helper must never touch public.orders");
  assert(riderOrderFn.toLowerCase().includes("set search_path = public, pg_temp"), "Must set safe search_path");

  assert(custOrderFn.length > 0 && !custOrderFn.toLowerCase().includes("public.deliveries"), "Customer helper must not touch deliveries");
  assert(shopOrderFn.length > 0 && !shopOrderFn.toLowerCase().includes("public.deliveries"), "Shopkeeper helper must not touch deliveries");

  assert(m013Lower.includes('create policy "orders_select_delivery_partner" on public.orders\n  for select using (public.is_assigned_delivery_partner_for_order(id));'));
  assert(m013Lower.includes('create policy "deliveries_select_own" on public.deliveries\n  for select using (public.is_customer_of_order(order_id));'));
});

test("P0-A", "deliveries_select_partner restricts UNASSIGNED rows strictly to approved delivery partners", () => {
  assert(m013Lower.includes("status = 'unassigned' and public.is_approved_delivery_partner()"));
});

// P0-B: Shop approval RPC lockdown
test("P0-B", "approve_or_reject_shop revokes anon & public and enforces is_admin_or_super(auth.uid())", () => {
  const approveFn = extractFunctionBody(m013, "approve_or_reject_shop");
  assert(approveFn.toLowerCase().includes("public.is_admin_or_super(v_caller_id)"));
  assert(approveFn.toLowerCase().includes("errcode = '42501'"));
  assert(m013Lower.includes("revoke all on function public.approve_or_reject_shop(uuid, text) from public, anon;"));
  assert(m013Lower.includes("grant execute on function public.approve_or_reject_shop(uuid, text) to authenticated, service_role;"));
});

// P0-C: Registration RPC & server route security
test("P0-C", "register_shop_application blocks anon, blocks role conversion, and enforces identity match", () => {
  const regFn = extractFunctionBody(m013, "register_shop_application");
  assert(m013Lower.includes("revoke all on function public.register_shop_application(text, text, text, text, text, text, text) from public, anon;"));
  assert(regFn.toLowerCase().includes("v_caller_id is null and not v_is_service"));
  assert(regFn.toLowerCase().includes("v_existing_role <> 'shopkeeper'"));
  assert(!regFn.toLowerCase().includes("insert into auth.users"), "Must not insert passwordless auth.users rows");
});

test("P0-C", "register route removes anon shops query, invokes rpc via adminClient, and creates session cleanly", () => {
  assert(!registerRoute.includes('from("shops")') || !registerRoute.includes("existingApprovedShop"), "Must not run anon shops lookup");
  assert(registerRoute.includes("const rpcClient = adminClient || supabase;"));
  assert(registerRoute.includes("await supabase.auth.signInWithPassword("));
  assert(!registerRoute.includes("&phone="));
});

// P0-D: Shopkeeper product & inventory SELECT RLS
test("P0-D", "Migration 013 adds shop_products_select_shopkeeper & inventory_select_shopkeeper regardless of availability/stock", () => {
  assert(m013Lower.includes('create policy "shop_products_select_shopkeeper" on public.shop_products'));
  assert(m013Lower.includes('create policy "inventory_select_shopkeeper" on public.inventory'));
  assert(productsActions.includes('.select("id")') && productsActions.includes('.eq("shop_id", auth.shopId)'));
});

// P0-E: Orders, Dashboard, Analytics & Earnings schema alignment
test("P0-E", "orders/actions.ts uses verified snapshot columns and stops returning silent empty list on DB error", () => {
  assert(!ordersActions.includes("payment_method,\n"));
  assert(!ordersActions.includes("payment_status,\n"));
  assert(!ordersActions.includes("delivery_address,\n"));
  assert(!ordersActions.includes("unit_price,\n"));
  assert(!ordersActions.includes("total_price,\n"));
  assert(ordersActions.includes("product_name_snapshot"));
  assert(ordersActions.includes("unit_price_snapshot"));
  assert(ordersActions.includes("error: \"Unable to load orders right now. Please try refreshing.\""));
  assert(ordersActions.includes("orderStatusUpdateSchema"));
  assert(ordersClient.includes("data.error ?"));
  assert(
    ordersClient.includes('handleUpdateStatus(rejectTarget.id, "REJECTED")') &&
      ordersClient.includes("<RejectOrderDialog")
  );
  assert(orderDetailPage.includes("if (error)"));
});

test("P0-E", "earnings/actions.ts separates subtotal merchandise revenue from delivery_fee and discloses unsupported settlements", () => {
  assert(!earningsActions.includes("payment_method,\n"));
  assert(!earningsActions.includes("payment_status,\n"));
  assert(earningsActions.includes("merchandiseSubtotal"));
  assert(earningsActions.includes("deliveryFee"));
  assert(earningsActions.includes("settlementSupported: false"));
  assert(earningsActions.includes("error: \"Unable to load order earnings right now."));
  assert(earningsClient.includes("!data.settlementSupported"));
  assert(!earningsClient.includes("Settled / Delivered"));
  assert(!earningsClient.includes("Settlement Amount"));
  assert(earningsClient.includes("data.error ?"));
});

test("P0-E", "dashboard & analytics handle order errors cleanly and link directly to /orders/[id]", () => {
  assert(dashboardActions.includes("dashboardError ="));
  assert(dashboardActions.includes("todayRevenue += Number(o.subtotal || 0)"));
  assert(dashboardClient.includes('href={`/orders/${order.id}`}'));
  assert(dashboardClient.includes("initialData.error || null"));
  assert(analyticsActions.includes("totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0"));
});

// P0-F: Least-privilege customer/address/payment/delivery reads
test("P0-F", "Migration 013 scopes addresses and provides least-privilege get_shop_order_fulfillment_context RPC", () => {
  const ctxFn = extractFunctionBody(m013, "get_shop_order_fulfillment_context");
  assert(m013Lower.includes('create policy "addresses_select_shopkeeper" on public.addresses'));
  assert(ctxFn.toLowerCase().includes("public.is_shop_owner_or_member(p_shop_id)"));
  assert(!ctxFn.toLowerCase().includes("provider_reference"), "Never expose payment provider tokens");
  assert(!ctxFn.toLowerCase().includes("p.email"), "Never expose customer email");
  assert(m013Lower.includes("revoke all on function public.get_shop_order_fulfillment_context(uuid, uuid[]) from public, anon;"));
});

// P0-G: Public shop data separation & authenticated status lookup
test("P0-G", "Migration 013 revokes anon SELECT on public.shops and creates column-safe public_storefronts view", () => {
  assert(m013Lower.includes("revoke all on public.shops from anon;"));
  assert(m013Lower.includes("create or replace view public.public_storefronts"));
  const viewMatch = m013Lower.match(
    /create or replace view public\.public_storefronts[\s\S]*?as\s+select([\s\S]*?)from public\.shops/i
  );
  assert(viewMatch && viewMatch[1], "Must project specific storefront columns");
  const selectCols = viewMatch[1];
  assert(!selectCols.includes("owner_id") && !selectCols.includes("phone") && !selectCols.includes("approval_status") && !selectCols.includes("address_line"));
});

test("P0-G", "Status lookup requires authenticated session and eliminates getShopByPhone / ?phone= enumeration", () => {
  assert(!authApi.includes("getShopByPhone"));
  assert(!authApi.includes("phoneFallback"));
  assert(!statusPage.includes('get("phone")'));
  assert(!loginRoute.includes("/status?phone="));
  assert(statusRoute.includes("supabase.auth.getUser()"));
  assert(statusRoute.includes("status: 401"));
  assert(!statusRoute.includes("SUPABASE_SERVICE_ROLE_KEY"));
});

// P0-H: Protected product routes
test("P0-H", "/products/new and /products/[id] enforce requireApprovedShopkeeper() and eliminate TODO stubs", () => {
  assert(newProductPage.includes("await requireApprovedShopkeeper()"));
  assert(!newProductPage.includes("TODO"));
  assert(editProductPage.includes("await requireApprovedShopkeeper()"));
  assert(!editProductPage.includes("TODO"));
});

// Cross-App Compatibility (P0.1)
test("P0.1-Customer", "Customer shop discovery & order lookups query public_storefronts without exposing private shops fields", () => {
  assert(customerShopsApi.includes('from("public_storefronts")'));
  assert(customerShopsApi.includes("id, name, description") && customerShopsApi.includes("is_active"));
  assert(!customerShopsApi.includes("owner_id") || customerShopsApi.includes("never exposes owner_id"));
  assert(!customerShopsApi.includes("address_line") && !customerShopsApi.includes("approval_status"));
  assert(!customerShopsApi.includes('from("shops")'));
  assert(customerOrdersApi.includes('from("public_storefronts")'));
  assert(!customerOrdersApi.includes("shops (name"));
});

test("P0.1-Delivery", "Unassigned delivery riders only discover minimal delivery fields; shops helper requires assignment", () => {
  const riderShopFn = extractFunctionBody(m013, "is_delivery_partner_for_shop");
  assert(!riderShopFn.toLowerCase().includes("status = 'unassigned'"), "Unassigned riders must not gain shops read access");
  assert(deliveryApi.includes("const orderObj = d.orders || null;"));
  assert(deliveryApi.includes('shopPhone: shopObj?.phone || ""'));
  assert(deliveryApi.includes("subtotal: Number(orderObj?.subtotal || 0)"));
});

console.log(`\n==================================================================`);
console.log(` ZUNO SHOP-P0 Suite Complete: ${passed} passed, ${failed} failed.`);
console.log(`==================================================================`);

if (failed > 0) {
  process.exit(1);
}
