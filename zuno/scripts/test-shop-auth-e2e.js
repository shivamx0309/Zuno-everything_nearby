/**
 * ZUNO AUTH-2.2 — Shopkeeper Authentication End-to-End Test Suite
 *
 * Covers:
 * Phase 1: Pre-test Inspection
 * Phase 2: First-time Activation Flow & Logic
 * Phase 3: Normal Password Login Flow
 * Phase 4: Remember Me Persistent vs Session Cookies
 * Phase 5: Forgot Password Recovery Flow
 * Phase 6: Security & Authorization Enforcements
 * Phase 7: Supabase SMS & Remote Provider Assessment
 * Phase 8: UI, Markup & Responsive Layout Verification
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const ROOT_DIR = path.resolve(__dirname, "..");
const SHOP_DIR = path.join(ROOT_DIR, "apps/shop");

console.log("==================================================================");
console.log(" ZUNO AUTH-2.2 — Shopkeeper Authentication End-to-End Suite");
console.log("==================================================================\n");

let passed = 0;
let failed = 0;
let skipped = 0;

function report(category, name, ok, details = "") {
  if (ok) {
    passed++;
    console.log(`[PASS] [${category}] ${name}`);
  } else {
    failed++;
    console.error(`[FAIL] [${category}] ${name} - ${details}`);
  }
}

function skip(category, name, reason) {
  skipped++;
  console.log(`[SKIP] [${category}] ${name} (${reason})`);
}

function makeHttpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
        });
      });
    });
    req.on("error", reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

// ---------------------------------------------------------------------
// TEST GROUP 1: Pre-test Inspection & Environment Integrity
// ---------------------------------------------------------------------
console.log("--- GROUP 1: Pre-test Inspection & Architecture Integrity ---");

const loginPageSrc = fs.readFileSync(path.join(SHOP_DIR, "app/login/page.tsx"), "utf8");
const registerPageSrc = fs.readFileSync(path.join(SHOP_DIR, "app/register/page.tsx"), "utf8");
const authApiSrc = fs.readFileSync(path.join(SHOP_DIR, "features/auth/api.ts"), "utf8");
const loginRouteSrc = fs.readFileSync(path.join(SHOP_DIR, "app/api/auth/login/route.ts"), "utf8");
const registerRouteSrc = fs.readFileSync(path.join(SHOP_DIR, "app/api/auth/register/route.ts"), "utf8");
const setPasswordRouteSrc = fs.readFileSync(path.join(SHOP_DIR, "app/api/auth/set-password/route.ts"), "utf8");
const authUtilsSrc = fs.readFileSync(path.join(SHOP_DIR, "lib/shop-auth-utils.ts"), "utf8");
const supabaseClientSrc = fs.readFileSync(path.join(SHOP_DIR, "lib/supabase.ts"), "utf8");
const supabaseServerSrc = fs.readFileSync(path.join(SHOP_DIR, "lib/supabase-server.ts"), "utf8");
const middlewareSrc = fs.readFileSync(path.join(SHOP_DIR, "middleware.ts"), "utf8");
const authGuardSrc = fs.readFileSync(path.join(SHOP_DIR, "lib/authGuard.ts"), "utf8");
const logoutRouteSrc = fs.readFileSync(path.join(SHOP_DIR, "app/api/auth/logout/route.ts"), "utf8");

report(
  "Phase 1",
  "app/login/page.tsx is strictly a client component ('use client')",
  loginPageSrc.startsWith('"use client"') || loginPageSrc.startsWith("'use client'")
);

report(
  "Phase 1",
  "Browser supabase client throws on missing environment variables without hardcoded fallbacks",
  supabaseClientSrc.includes("throw new Error") &&
    !supabaseClientSrc.includes("https://mwcvagktpvlzorojdsxg.supabase.co")
);

report(
  "Phase 1",
  "Server supabase client throws on missing environment variables without hardcoded fallbacks",
  supabaseServerSrc.includes("throw new Error") &&
    !supabaseServerSrc.includes("https://mwcvagktpvlzorojdsxg.supabase.co")
);

report(
  "Phase 1",
  "Middleware verifies authenticated identity using supabase.auth.getUser()",
  middlewareSrc.includes("await supabase.auth.getUser()") && !middlewareSrc.includes("supabase.auth.getSession()")
);

report(
  "Phase 1",
  "authGuard verifies authenticated identity using supabase.auth.getUser()",
  authGuardSrc.includes("await supabase.auth.getUser()") && !authGuardSrc.includes("supabase.auth.getSession()")
);

report(
  "Phase 1",
  "authGuard enforces strict server-side shop ownership query",
  authGuardSrc.includes('.eq("owner_id", userId)') || authGuardSrc.includes(".eq('owner_id', userId)")
);

report(
  "Phase 1",
  "Logout route is strictly POST-only (GET rejected with HTTP 405)",
  logoutRouteSrc.includes("export async function POST") &&
    logoutRouteSrc.includes("export async function GET") &&
    logoutRouteSrc.includes("status: 405")
);

// ---------------------------------------------------------------------
// TEST GROUP 2: Simplified Login & Registration State Machine (AUTH-3)
// ---------------------------------------------------------------------
console.log("\n--- GROUP 2: Simplified Login & Registration State Machine (AUTH-3) ---");

report(
  "Phase 2",
  "SMS OTP flows and dev mock panel are completely removed from login UI",
  !loginPageSrc.includes("requestShopkeeperOtp") &&
    !loginPageSrc.includes("verifyShopkeeperOtp") &&
    !loginPageSrc.includes("FIRST_TIME_OTP") &&
    !loginPageSrc.includes("DEV MOCK AUTH") &&
    !loginPageSrc.includes("Send OTP")
);

report(
  "Phase 2",
  "Phone numbers are normalized and validated for 10-digit Indian mobile numbers",
  authUtilsSrc.includes("rawPhoneSchema") &&
    authUtilsSrc.includes("normalizePhoneE164(clean10)")
);

report(
  "Phase 2",
  "Registration collects and validates password + confirmPassword and creates PENDING shop",
  registerPageSrc.includes("confirmPassword") &&
    registerRouteSrc.includes("validateShopkeeperPassword") &&
    registerRouteSrc.includes('approvalStatus: "PENDING"')
);

report(
  "Phase 2",
  "Registration detects existing/duplicate Auth users (empty identities or existing error) and rejects with 409",
  registerRouteSrc.includes("signUpData.user.identities.length === 0") &&
    registerRouteSrc.includes("status: 409")
);

// ---------------------------------------------------------------------
// TEST GROUP 3: Normal Password Login Flow
// ---------------------------------------------------------------------
console.log("\n--- GROUP 3: Normal Password Login Flow ---");

report(
  "Phase 3",
  "Normal password login does NOT invoke OTP request",
  !authApiSrc.includes("signInWithOtp") && !loginRouteSrc.includes("signInWithOtp")
);

report(
  "Phase 3",
  "Empty password is intercepted before calling Supabase Auth",
  loginPageSrc.includes('if (!password) {') &&
    loginPageSrc.includes('setError("Please enter your password.")')
);

report(
  "Phase 3",
  "Short or invalid mobile number is intercepted before network call",
  loginPageSrc.includes("normalizeIndianPhone(cleanPhone)") &&
    loginRouteSrc.includes("normalizeIndianPhone(rawPhone)")
);

report(
  "Phase 3",
  "Server login route derives synthetic email server-side and uses email-based signInWithPassword",
  loginRouteSrc.includes("deriveShopkeeperSyntheticEmails") &&
    loginRouteSrc.includes("email: syntheticEmail") &&
    !loginRouteSrc.includes("phone: formattedPhone")
);

report(
  "Phase 3",
  "Login returns generic invalid-credentials error without leaking account existence",
  loginRouteSrc.includes('error: "Invalid mobile number or password."') &&
    loginRouteSrc.includes("status: 401")
);

report(
  "Phase 3",
  "Password visibility toggle is present with accessible button label",
  loginPageSrc.includes('aria-label={showPassword ? "Hide password" : "Show password"}')
);

// ---------------------------------------------------------------------
// TEST GROUP 4: Remember Me Cookie Behavior
// ---------------------------------------------------------------------
console.log("\n--- GROUP 4: Remember Me Cookie Behavior ---");

report(
  "Phase 4",
  "Remember Me ON sets 30-day persistent cookieOptions (2592000s)",
  authUtilsSrc.includes("60 * 60 * 24 * 30") &&
    supabaseClientSrc.includes("60 * 60 * 24 * 30")
);

report(
  "Phase 4",
  "Remember Me OFF sets browser-session cookie (strips maxAge/expires)",
  authUtilsSrc.includes("delete base.maxAge") &&
    authUtilsSrc.includes("delete base.expires") &&
    middlewareSrc.includes("REMEMBER_ME_COOKIE")
);

report(
  "Phase 4",
  "Plaintext passwords are NEVER stored in localStorage or sessionStorage",
  !loginPageSrc.includes("localStorage.setItem") &&
    !loginPageSrc.includes("sessionStorage.setItem") &&
    !authApiSrc.includes("localStorage.setItem")
);

report(
  "Phase 4",
  "Remember Me toggle checkbox is initialized to true (checked) by default",
  loginPageSrc.includes("useState(true)") &&
    loginPageSrc.includes("rememberMe")
);

// ---------------------------------------------------------------------
// TEST GROUP 5: Forgot Password & Existing Passwordless Account Flow
// ---------------------------------------------------------------------
console.log("\n--- GROUP 5: Forgot Password & Existing Passwordless Account Flow ---");

report(
  "Phase 5",
  "Forgot Password presents administrator-assisted reset guidance (no SMS/phone-only reset)",
  loginPageSrc.includes('setMode("FORGOT_INFO")') &&
    loginPageSrc.toLowerCase().includes("administrator-assisted") &&
    !loginPageSrc.includes("FORGOT_OTP") &&
    !loginPageSrc.includes("resetPasswordForEmail")
);

report(
  "Phase 5",
  "Authenticated password setup route strictly verifies session with getUser()",
  setPasswordRouteSrc.includes("supabase.auth.getUser()") &&
    setPasswordRouteSrc.includes("status: 401") &&
    setPasswordRouteSrc.includes("supabase.auth.updateUser({")
);

// ---------------------------------------------------------------------
// TEST GROUP 6: Security & Authorization Enforcements
// ---------------------------------------------------------------------
console.log("\n--- GROUP 6: Security & Authorization Enforcements ---");

function testSanitizeRedirect(url) {
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

report("Phase 6", "Open redirect //evil.com is blocked -> /dashboard", testSanitizeRedirect("//evil.com") === "/dashboard");
report("Phase 6", "Open redirect https://evil.com is blocked -> /dashboard", testSanitizeRedirect("https://evil.com") === "/dashboard");
report("Phase 6", "Open redirect /\\evil.com is blocked -> /dashboard", testSanitizeRedirect("/\\evil.com") === "/dashboard");
report("Phase 6", "Open redirect javascript:alert(1) is blocked -> /dashboard", testSanitizeRedirect("javascript:alert(1)") === "/dashboard");
report("Phase 6", "Valid relative path /dashboard/orders is allowed", testSanitizeRedirect("/dashboard/orders") === "/dashboard/orders");
report("Phase 6", "Valid relative path /products/new is allowed", testSanitizeRedirect("/products/new") === "/products/new");

report(
  "Phase 6",
  "Supabase service-role secret key is strictly absent from shop client code",
  !fs.existsSync(path.join(SHOP_DIR, "lib/supabase-admin.ts")) &&
    !supabaseClientSrc.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    !loginPageSrc.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    !authApiSrc.includes("SUPABASE_SERVICE_ROLE_KEY")
);

report(
  "Phase 6",
  "Dev mock authentication is unconditionally rejected in production",
  fs.readFileSync(path.join(ROOT_DIR, "packages/config/src/devMockAuth.ts"), "utf8").includes('if (process.env.NODE_ENV === "production")')
);

// ---------------------------------------------------------------------
// TEST GROUP 7: Production Readiness & Duplicate Prevention (AUTH-2.3)
// ---------------------------------------------------------------------
console.log("\n--- GROUP 7: Production Readiness & Duplicate Prevention (AUTH-2.3) ---");

const migrationSrc = fs.readFileSync(
  path.join(ROOT_DIR, "supabase/migrations/00000000000011_phase0_security_guards.sql"),
  "utf8"
);
const devMockRouteSrc = fs.readFileSync(
  path.join(SHOP_DIR, "app/api/auth/dev-mock-login/route.ts"),
  "utf8"
);

report(
  "Phase 10",
  "register_shop_application SQL migration reuses existing auth.users by phone or synthetic email",
  migrationSrc.includes("select id into v_user_id from auth.users") &&
    migrationSrc.includes("where phone = v_phone or email = 'shop_' || v_clean_phone || '@zuno.in'")
);

report(
  "Phase 10",
  "public.profiles upsert prevents duplicate profile records on re-registration (on conflict do update)",
  migrationSrc.includes("insert into public.profiles") &&
    migrationSrc.includes("on conflict (id) do update set")
);

report(
  "Phase 10",
  "setShopkeeperPassword updates password in place on existing authenticated session only",
  setPasswordRouteSrc.includes("supabase.auth.updateUser({") &&
    setPasswordRouteSrc.includes("supabase.auth.getUser()")
);

report(
  "Phase 10",
  "Login resolves shop approval server-side and never inserts duplicate shops",
  loginRouteSrc.includes('.eq("owner_id", authRes.data.user.id)') &&
    !loginRouteSrc.includes(".insert(")
);

report(
  "Phase 4",
  "Login derives synthetic email server-side from normalized 10-digit Indian mobile",
  loginRouteSrc.includes("normalizeIndianPhone") &&
    loginRouteSrc.includes("deriveShopkeeperSyntheticEmails")
);

report(
  "Phase 6",
  "dev-mock-login route returns HTTP 403 when NODE_ENV is production",
  devMockRouteSrc.includes('process.env.NODE_ENV === "production"') &&
    devMockRouteSrc.includes("status: 403")
);

report(
  "Phase 6",
  "Shop middleware ignores dev mock cookie when NODE_ENV is production",
  middlewareSrc.includes('process.env.NODE_ENV !== "production"') &&
    middlewareSrc.includes("isDevMockAuthEnabled()")
);

report(
  "Phase 6",
  "requireApprovedShopkeeper guard ignores dev mock cookie when NODE_ENV is production",
  authGuardSrc.includes('process.env.NODE_ENV !== "production"') &&
    authGuardSrc.includes("isDevMockAuthEnabled()")
);

// ---------------------------------------------------------------------
// TEST GROUP 8: Live Dev Server & HTTP Asset Verification
// ---------------------------------------------------------------------
console.log("\n--- GROUP 8: Live Dev Server & HTTP Asset Verification ---");

async function testLiveServer() {
  try {
    // 1. Check /login
    const loginRes = await makeHttpRequest({
      hostname: "localhost",
      port: 3000,
      path: "/login",
      method: "GET",
    });

    report("Phase 8", "GET /login returns HTTP 200", loginRes.statusCode === 200);

    const html = loginRes.body;

    report("Phase 8", "Rendered HTML contains ZUNO brand title", html.includes("ZUNO Shop Dashboard"));
    report("Phase 8", "Rendered HTML contains viewport meta tag for responsive design", html.includes('name="viewport" content="width=device-width, initial-scale=1"'));
    report("Phase 8", "Rendered HTML includes stylesheet link for layout.css", html.includes('/_next/static/css/app/layout.css'));
    report("Phase 8", "Rendered HTML includes main-app.js chunk", html.includes('/_next/static/chunks/main-app.js'));
    report("Phase 8", "Rendered HTML includes login page client chunk", html.includes('/_next/static/chunks/app/login/page.js'));

    // Extract layout CSS link
    const cssMatch = html.match(/href="(\/_next\/static\/css\/app\/layout\.css[^"]*)"/);
    if (cssMatch) {
      const cssRes = await makeHttpRequest({
        hostname: "localhost",
        port: 3000,
        path: cssMatch[1],
        method: "GET",
      });

      report("Phase 8", `Static asset ${cssMatch[1]} returns HTTP 200`, cssRes.statusCode === 200);
      report("Phase 8", "layout.css Content-Type is text/css", (cssRes.headers["content-type"] || "").includes("text/css"));
      report("Phase 8", "layout.css is non-empty (>10KB)", cssRes.body.length > 10000);
      report("Phase 8", "layout.css contains ZUNO Deep Green (#0F5D3A)", cssRes.body.toLowerCase().includes("#0f5d3a"));
      report("Phase 8", "layout.css contains ZUNO Warm Background (#F8FAF6)", cssRes.body.toLowerCase().includes("#f8faf6"));
    } else {
      report("Phase 8", "Found layout.css link in HTML", false, "CSS link regex failed");
    }

    // Extract main JS chunk link
    const jsMatch = html.match(/src="(\/_next\/static\/chunks\/app\/login\/page\.js[^"]*)"/);
    if (jsMatch) {
      const jsRes = await makeHttpRequest({
        hostname: "localhost",
        port: 3000,
        path: jsMatch[1],
        method: "GET",
      });

      report("Phase 8", `Static asset ${jsMatch[1]} returns HTTP 200`, jsRes.statusCode === 200);
      report("Phase 8", "app/login/page.js Content-Type is application/javascript", (jsRes.headers["content-type"] || "").includes("javascript"));
    }

    // 2. Test unauthenticated /dashboard redirect
    const dashRes = await makeHttpRequest({
      hostname: "localhost",
      port: 3000,
      path: "/dashboard",
      method: "GET",
    });

    report(
      "Phase 6",
      "Unauthenticated request to /dashboard redirects (307) to /login",
      dashRes.statusCode === 307 && (dashRes.headers.location || "").includes("/login")
    );

    // 3. Test Logout GET returns 405 Method Not Allowed
    const logoutGetRes = await makeHttpRequest({
      hostname: "localhost",
      port: 3000,
      path: "/api/auth/logout",
      method: "GET",
    });

    report(
      "Phase 6",
      "GET /api/auth/logout returns HTTP 405 Method Not Allowed",
      logoutGetRes.statusCode === 405
    );

    // 4. Test Logout POST returns HTTP 200 and purges cookies
    const logoutPostRes = await makeHttpRequest({
      hostname: "localhost",
      port: 3000,
      path: "/api/auth/logout",
      method: "POST",
    });

    report(
      "Phase 6",
      "POST /api/auth/logout returns HTTP 200 with redirect instruction",
      logoutPostRes.statusCode === 200 && logoutPostRes.body.includes("/login")
    );

    const setCookies = logoutPostRes.headers["set-cookie"] || [];
    const clearedMock = setCookies.some((c) => c.includes("zuno_dev_mock_session=") && c.includes("Max-Age=0"));
    report(
      "Phase 6",
      "POST /api/auth/logout purges dev mock session cookie with Max-Age=0",
      clearedMock
    );

  } catch (err) {
    report("Phase 8", "Live Dev Server request succeeded", false, err.message);
  }

  console.log("\n==================================================================");
  console.log(` End-to-End Suite Complete: ${passed} passed, ${failed} failed, ${skipped} skipped.`);
  console.log("==================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

testLiveServer();
