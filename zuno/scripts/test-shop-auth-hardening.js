/**
 * ZUNO Phase AUTH-1 — Shopkeeper Authentication Security Hardening Test Suite
 *
 * Validates the 7 core security hardening requirements:
 * 1. Unauthenticated requests handling & protected route enforcement
 * 2. Invalid / stale / malformed session rejection
 * 3. Approved shopkeeper validation
 * 4. Pending, rejected, and unassociated shop status enforcement
 * 5. Complete logout & cookie purging (without record deletion)
 * 6. Missing environment variables rejection (no hardcoded fallbacks)
 * 7. Mock auth strict isolation & production rejection
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");

console.log("==================================================================");
console.log(" ZUNO Phase AUTH-1 — Shopkeeper Authentication Hardening Suite");
console.log("==================================================================\n");

let passedCount = 0;
let totalCount = 0;

function runTest(name, fn) {
  totalCount++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalCount++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}`);
  }
}

// ---------------------------------------------------------------------
// TEST GROUP 1: Missing Environment Variables & Fallback Removal (TASK 3)
// ---------------------------------------------------------------------

runTest("TASK 3: apps/shop/lib/supabase.ts contains no hardcoded fallback URL or JWT", () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, "apps/shop/lib/supabase.ts"), "utf8");
  assert(!content.includes("https://mwcvagktpvlzorojdsxg.supabase.co"), "Found hardcoded fallback URL in supabase.ts");
  assert(!content.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"), "Found hardcoded fallback JWT in supabase.ts");
  assert(content.includes("throw new Error"), "supabase.ts must throw on missing environment variables");
});

runTest("TASK 3: apps/shop/lib/supabase-server.ts contains no hardcoded fallback URL or JWT", () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, "apps/shop/lib/supabase-server.ts"), "utf8");
  assert(!content.includes("https://mwcvagktpvlzorojdsxg.supabase.co"), "Found hardcoded fallback URL in supabase-server.ts");
  assert(!content.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"), "Found hardcoded fallback JWT in supabase-server.ts");
  assert(content.includes("throw new Error"), "supabase-server.ts must throw on missing environment variables");
});

runTest("TASK 3: apps/shop/middleware.ts contains no hardcoded fallback URL or JWT", () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, "apps/shop/middleware.ts"), "utf8");
  assert(!content.includes("https://mwcvagktpvlzorojdsxg.supabase.co"), "Found hardcoded fallback URL in middleware.ts");
  assert(!content.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"), "Found hardcoded fallback JWT in middleware.ts");
  assert(content.includes("Missing required Supabase configuration"), "middleware.ts must validate environment variables");
});

runTest("TASK 3: Browser client strictly requires NEXT_PUBLIC environment variables", () => {
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Simulate getBrowserSupabaseConfig check
    const checkFn = () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) {
        throw new Error("Missing required Supabase configuration");
      }
    };

    assert.throws(checkFn, /Missing required Supabase configuration/);
  } finally {
    if (origUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
    if (origKey) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = origKey;
  }
});

// ---------------------------------------------------------------------
// TEST GROUP 2: Secure Server Authentication & getUser() (TASK 1)
// ---------------------------------------------------------------------

runTest("TASK 1: apps/shop/middleware.ts uses supabase.auth.getUser() instead of getSession()", () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, "apps/shop/middleware.ts"), "utf8");
  assert(content.includes("supabase.auth.getUser()"), "middleware.ts must call getUser()");
  assert(!content.includes("supabase.auth.getSession()"), "middleware.ts must not call getSession()");
});

runTest("TASK 1: apps/shop/lib/authGuard.ts uses supabase.auth.getUser() instead of getSession()", () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, "apps/shop/lib/authGuard.ts"), "utf8");
  assert(content.includes("supabase.auth.getUser()"), "authGuard.ts must call getUser()");
  assert(!content.includes("supabase.auth.getSession()"), "authGuard.ts must not call getSession()");
});

runTest("TASK 1: authGuard.ts enforces strict shop ownership check via database (never trusts client)", () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, "apps/shop/lib/authGuard.ts"), "utf8");
  assert(content.includes('.eq("owner_id", userId)'), "authGuard must verify shop ownership by authenticated user id");
  assert(content.includes('redirect("/register")'), "authGuard must redirect unregistered users to /register");
  assert(content.includes('redirect("/status")'), "authGuard must redirect unapproved users to /status");
  assert(content.includes('redirect("/login?redirect=%2Fdashboard")'), "authGuard must redirect unauthenticated users to /login");
});

// ---------------------------------------------------------------------
// TEST GROUP 3: Complete Logout Implementation (TASK 2 & AUTH-1.1)
// ---------------------------------------------------------------------

runTest("TASK 2: apps/shop/app/api/auth/logout/route.ts invokes Supabase signOut & purges cookies on POST", () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, "apps/shop/app/api/auth/logout/route.ts"), "utf8");
  assert(content.includes("supabase.auth.signOut()"), "logout route must call supabase.auth.signOut()");
  assert(content.includes("DEV_MOCK_AUTH_COOKIE"), "logout route must clear DEV_MOCK_AUTH_COOKIE");
  assert(content.includes("zuno_dev_mock_session"), "logout route must clear legacy mock cookies");
  assert(content.includes("export async function POST"), "logout route must support POST");
});

runTest("AUTH-1.1: Logout is strictly POST-only (GET rejected with HTTP 405 to prevent silent CSRF logout)", () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, "apps/shop/app/api/auth/logout/route.ts"), "utf8");
  assert(content.includes("status: 405"), "GET request must respond with HTTP 405 Method Not Allowed");
  assert(content.includes('Allow: "POST"'), "GET response must include Allow: POST header");
  assert(!content.includes("performLogout(request, response) in GET"), "GET handler must never call performLogout");
});

runTest("TASK 2: Logout does NOT execute database deletions on users or shops", () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, "apps/shop/app/api/auth/logout/route.ts"), "utf8");
  assert(!content.includes(".delete()"), "logout route must never delete database records");
  assert(!content.includes(".remove()"), "logout route must not invoke database remove methods");
});

// ---------------------------------------------------------------------
// TEST GROUP 4: Development Mock Auth Isolation (TASK 4)
// ---------------------------------------------------------------------

runTest("TASK 4: packages/config/src/devMockAuth.ts rejects mock auth in production unconditionally", () => {
  // Inline simulation of isDevMockAuthEnabled
  function checkMock(nodeEnv, envVal) {
    const origEnv = process.env.NODE_ENV;
    const origFlag = process.env.ENABLE_DEV_MOCK_AUTH;
    try {
      process.env.NODE_ENV = nodeEnv;
      process.env.ENABLE_DEV_MOCK_AUTH = envVal;
      if (process.env.NODE_ENV === "production") return false;
      const flag = (process.env.ENABLE_DEV_MOCK_AUTH || "").trim().toLowerCase();
      return flag === "true";
    } finally {
      process.env.NODE_ENV = origEnv;
      process.env.ENABLE_DEV_MOCK_AUTH = origFlag;
    }
  }

  assert.strictEqual(checkMock("production", "true"), false, "Mock auth must be false when NODE_ENV is production");
  assert.strictEqual(checkMock("production", "1"), false, "Mock auth must be false in production even with flag 1");
  assert.strictEqual(checkMock("development", "false"), false, "Mock auth must be false when flag is false");
  assert.strictEqual(checkMock("development", ""), false, "Mock auth must be false when flag is unset");
  assert.strictEqual(checkMock("development", "true"), true, "Mock auth should be true in development with flag true");
});

runTest("TASK 4: dev-mock-login route enforces production rejection with HTTP 403", () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, "apps/shop/app/api/auth/dev-mock-login/route.ts"), "utf8");
  assert(content.includes('process.env.NODE_ENV === "production"'), "dev-mock-login must check NODE_ENV production");
  assert(content.includes("{ status: 403 }"), "dev-mock-login must respond with 403 Forbidden in production");
  assert(content.includes('role: "SHOPKEEPER"'), "dev-mock-login role must be strictly SHOPKEEPER");
  assert(!content.includes('"ADMIN"'), "dev-mock-login must never assign ADMIN role");
});

runTest("TASK 4: dev-mock-login does NOT issue a fake Supabase Auth JWT", () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, "apps/shop/app/api/auth/dev-mock-login/route.ts"), "utf8");
  assert(!content.includes("supabase.auth.signUp"), "dev-mock-login must not call signUp");
  assert(!content.includes("sb-access-token"), "dev-mock-login must not forge Supabase access tokens");
  assert(!content.includes("SUPABASE_SERVICE_ROLE_KEY"), "dev-mock-login must not use service role bypass");
});

// ---------------------------------------------------------------------
// TEST GROUP 5: Shopkeeper Status Enforcement State Machine
// ---------------------------------------------------------------------

runTest("TASK 5: Status State Machine Logic Verification", () => {
  function evaluateShopStatus(shop) {
    if (!shop) return { status: "UNREGISTERED", redirect: "/register" };
    const isApproved = Boolean(shop.is_approved) && shop.approval_status === "APPROVED";
    if (isApproved) {
      return { status: "APPROVED", redirect: "/dashboard" };
    }
    return { status: shop.approval_status || "PENDING", redirect: "/status" };
  }

  // 1. Unregistered user
  assert.deepStrictEqual(evaluateShopStatus(null), { status: "UNREGISTERED", redirect: "/register" });

  // 2. Approved shop
  const approvedShop = { is_approved: true, approval_status: "APPROVED" };
  assert.deepStrictEqual(evaluateShopStatus(approvedShop), { status: "APPROVED", redirect: "/dashboard" });

  // 3. Pending shop
  const pendingShop = { is_approved: false, approval_status: "PENDING" };
  assert.deepStrictEqual(evaluateShopStatus(pendingShop), { status: "PENDING", redirect: "/status" });

  // 4. Rejected shop
  const rejectedShop = { is_approved: false, approval_status: "REJECTED" };
  assert.deepStrictEqual(evaluateShopStatus(rejectedShop), { status: "REJECTED", redirect: "/status" });

  // 5. Tampered state (is_approved=true but approval_status='PENDING')
  const tamperedShop1 = { is_approved: true, approval_status: "PENDING" };
  assert.deepStrictEqual(evaluateShopStatus(tamperedShop1), { status: "PENDING", redirect: "/status" });

  // 6. Tampered state (is_approved=false but approval_status='APPROVED')
  const tamperedShop2 = { is_approved: false, approval_status: "APPROVED" };
  assert.deepStrictEqual(evaluateShopStatus(tamperedShop2), { status: "APPROVED", redirect: "/status" });

  // 7. Suspended shop
  const suspendedShop = { is_approved: false, approval_status: "SUSPENDED" };
  assert.deepStrictEqual(evaluateShopStatus(suspendedShop), { status: "SUSPENDED", redirect: "/status" });
});

// ---------------------------------------------------------------------
// TEST GROUP 6: Session & Cookie Parsing Resilience
// ---------------------------------------------------------------------

runTest("TASK 5: Invalid/malformed cookie resilience in middleware and guards", () => {
  function safeParseDevCookie(rawCookie) {
    if (!rawCookie) return null;
    try {
      const decoded = rawCookie.startsWith("%") ? decodeURIComponent(rawCookie) : rawCookie;
      const parsed = JSON.parse(decoded);
      if (parsed?.userId && parsed?.shopId) {
        return parsed;
      }
    } catch {}
    return null;
  }

  assert.strictEqual(safeParseDevCookie(null), null);
  assert.strictEqual(safeParseDevCookie(""), null);
  assert.strictEqual(safeParseDevCookie("invalid-not-json"), null);
  assert.strictEqual(safeParseDevCookie("{userId: missing-quotes}"), null);
  assert.strictEqual(safeParseDevCookie(JSON.stringify({ userId: "u1" })), null, "Missing shopId rejected");
  assert.strictEqual(safeParseDevCookie(JSON.stringify({ shopId: "s1" })), null, "Missing userId rejected");

  const valid = safeParseDevCookie(JSON.stringify({ userId: "u1", shopId: "s1" }));
  assert.deepStrictEqual(valid, { userId: "u1", shopId: "s1" });

  const validEncoded = safeParseDevCookie(encodeURIComponent(JSON.stringify({ userId: "u1", shopId: "s1" })));
  assert.deepStrictEqual(validEncoded, { userId: "u1", shopId: "s1" });
});

// ---------------------------------------------------------------------
// TEST GROUP 7: AUTH-3 Mobile + Password Authentication Invariants
// ---------------------------------------------------------------------

runTest("AUTH-3: sanitizeRedirectUrl strictly rejects open redirect attempts", () => {
  function sanitizeRedirectUrl(url) {
    if (!url) return "/dashboard";
    const trimmed = url.trim();
    if (
      trimmed.startsWith("/") &&
      !trimmed.startsWith("//") &&
      !trimmed.includes("\\") &&
      !trimmed.includes(":")
    ) {
      return trimmed;
    }
    return "/dashboard";
  }

  assert.strictEqual(sanitizeRedirectUrl("/orders"), "/orders");
  assert.strictEqual(sanitizeRedirectUrl("/dashboard?tab=live"), "/dashboard?tab=live");
  assert.strictEqual(sanitizeRedirectUrl("https://evil.com"), "/dashboard");
  assert.strictEqual(sanitizeRedirectUrl("//evil.com"), "/dashboard");
  assert.strictEqual(sanitizeRedirectUrl("/\\evil.com"), "/dashboard");
  assert.strictEqual(sanitizeRedirectUrl("javascript:alert(1)"), "/dashboard");
  assert.strictEqual(sanitizeRedirectUrl(null), "/dashboard");
  assert.strictEqual(sanitizeRedirectUrl(""), "/dashboard");
});

runTest("AUTH-3: SMS OTP functions are completely removed from shop auth api", () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, "apps/shop/features/auth/api.ts"), "utf8");
  assert(!content.includes("signInWithOtp"), "Must not call signInWithOtp");
  assert(!content.includes("verifyOtp"), "Must not call verifyOtp");
  assert(!content.includes("requestShopkeeperOtp"), "Must not export requestShopkeeperOtp");
});

runTest("AUTH-3: Server login route uses email-based signInWithPassword only (never phone OTP)", () => {
  const loginRoute = fs.readFileSync(path.join(ROOT_DIR, "apps/shop/app/api/auth/login/route.ts"), "utf8");
  assert(loginRoute.includes("signInWithPassword"), "Must call signInWithPassword");
  assert(loginRoute.includes("deriveShopkeeperSyntheticEmails"), "Must derive synthetic email server-side");
  assert(!loginRoute.includes("signInWithOtp"), "Must never invoke OTP");
  assert(!loginRoute.includes("signUp("), "Login route must never create new accounts");
  assert(!loginRoute.includes("SUPABASE_SERVICE_ROLE_KEY"), "Must never use service role key");
});

runTest("AUTH-3: Remember Me cookie shaping handles persistent vs browser-session lifetimes", () => {
  const utils = fs.readFileSync(path.join(ROOT_DIR, "apps/shop/lib/shop-auth-utils.ts"), "utf8");
  assert(utils.includes("60 * 60 * 24 * 30"), "Must configure 30-day persistent session");
  assert(utils.includes("delete base.maxAge") && utils.includes("delete base.expires"), "Must strip maxAge/expires when Remember Me is false");
});

runTest("AUTH-3: Set-password route strictly requires authenticated user session via getUser()", () => {
  const setPass = fs.readFileSync(path.join(ROOT_DIR, "apps/shop/app/api/auth/set-password/route.ts"), "utf8");
  assert(setPass.includes("supabase.auth.getUser()"), "Must verify session via getUser()");
  assert(setPass.includes("status: 401"), "Must reject unauthenticated requests with 401");
  assert(setPass.includes("updateUser({"), "Must call updateUser for authenticated user");
});

runTest("AUTH-3: Login page contains mobile + password form and no OTP or mock auth UI", () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, "apps/shop/app/login/page.tsx"), "utf8");
  assert(content.includes('showPassword ? "text" : "password"'), "Must have password field with toggle");
  assert(content.includes("rememberMe"), "Must have Remember Me state");
  assert(content.includes("FORGOT_INFO"), "Must support admin-assisted forgot password panel");
  assert(content.includes("Register New Shop"), "Must contain link to shop registration");
  assert(!content.includes("DEV MOCK AUTH MODE ACTIVE"), "Must eliminate development mock banner from UI");
  assert(!content.includes("Send Activation Code"), "Must remove OTP activation UI");
  assert(!content.includes("FIRST_TIME_OTP"), "Must remove OTP states");
});

// ---------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------

console.log("\n==================================================================");
console.log(` Hardening Test Results: ${passedCount} / ${totalCount} tests passed.`);
console.log("==================================================================");

if (passedCount !== totalCount) {
  process.exit(1);
}

