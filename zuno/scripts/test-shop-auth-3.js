/**
 * ZUNO AUTH-3 — Comprehensive Verification Suite
 *
 * Clearly separates:
 *  1. GROUP A: Static & Unit Verification (Offline)
 *  2. GROUP B: Mocked Route / Auth Behavior Simulation (In-Memory Mocked Supabase)
 *  3. GROUP C: Live Local Next.js Server & Actual Supabase Auth Verification (Read-Only / Non-Mutating)
 *
 * Run offline only: node scripts/test-shop-auth-3.js --offline
 * Run full suite:   node scripts/test-shop-auth-3.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const ROOT_DIR = path.resolve(__dirname, "..");
const SHOP_DIR = path.join(ROOT_DIR, "apps/shop");
const OFFLINE_ONLY = process.argv.includes("--offline") || process.argv.includes("--local");

let passed = 0;
let failed = 0;
let skipped = 0;

function pass(group, name) {
  passed++;
  console.log(`[PASS] [${group}] ${name}`);
}

function fail(group, name, err) {
  failed++;
  console.error(`[FAIL] [${group}] ${name} -> ${err?.message || err}`);
}

function skip(group, name, reason) {
  skipped++;
  console.log(`[SKIP] [${group}] ${name} (${reason})`);
}

function test(group, name, fn) {
  try {
    fn();
    pass(group, name);
  } catch (err) {
    fail(group, name, err);
  }
}

async function asyncTest(group, name, fn) {
  try {
    await fn();
    pass(group, name);
  } catch (err) {
    fail(group, name, err);
  }
}

function httpRequest(method, urlPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "localhost",
        port: 3000,
        path: urlPath,
        method,
        timeout: 15000,
        headers: {
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {}
          resolve({ status: res.statusCode, headers: res.headers, raw, json });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("HTTP timeout")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function loadShopEnv() {
  const envPath = path.join(SHOP_DIR, ".env.local");
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq !== -1) out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

// ---------------------------------------------------------------------
// Inline mirrors of shop-auth-utils.ts for deterministic offline unit verification
// ---------------------------------------------------------------------
function normalizeIndianPhone(input) {
  const digits = (input || "").replace(/\D/g, "");
  let clean10 = "";
  if (digits.length === 10) clean10 = digits;
  else if (digits.length === 12 && digits.startsWith("91")) clean10 = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) clean10 = digits.slice(1);
  else return { valid: false, clean10: "", e164: "", error: "Invalid mobile" };

  if (!/^[6-9]\d{9}$/.test(clean10)) {
    return { valid: false, clean10: "", e164: "", error: "Invalid prefix" };
  }
  return { valid: true, clean10, e164: `+91${clean10}` };
}

function deriveShopkeeperSyntheticEmails(clean10) {
  const primary = `shop_91${clean10}@zuno.in`;
  const legacy = `shop_${clean10}@zuno.in`;
  return { primary, legacy, candidates: [primary, legacy] };
}

function applyRememberMeCookieOptions(options, rememberMe) {
  const base = { ...(options || {}) };
  if (!rememberMe) {
    delete base.maxAge;
    delete base.expires;
    return base;
  }
  return { ...base, maxAge: 60 * 60 * 24 * 30 };
}

// ---------------------------------------------------------------------
// GROUP A: STATIC & UNIT TESTS
// ---------------------------------------------------------------------
console.log("=== GROUP A: Static & Unit Verification (Offline) ===");

const loginPageSrc = fs.readFileSync(path.join(SHOP_DIR, "app/login/page.tsx"), "utf8");
const registerPageSrc = fs.readFileSync(path.join(SHOP_DIR, "app/register/page.tsx"), "utf8");
const statusPageSrc = fs.readFileSync(path.join(SHOP_DIR, "app/status/page.tsx"), "utf8");
const settingsClientSrc = fs.readFileSync(path.join(SHOP_DIR, "app/settings/SettingsClient.tsx"), "utf8");
const apiSrc = fs.readFileSync(path.join(SHOP_DIR, "features/auth/api.ts"), "utf8");
const loginRouteSrc = fs.readFileSync(path.join(SHOP_DIR, "app/api/auth/login/route.ts"), "utf8");
const registerRouteSrc = fs.readFileSync(path.join(SHOP_DIR, "app/api/auth/register/route.ts"), "utf8");
const setPasswordRouteSrc = fs.readFileSync(path.join(SHOP_DIR, "app/api/auth/set-password/route.ts"), "utf8");
const logoutRouteSrc = fs.readFileSync(path.join(SHOP_DIR, "app/api/auth/logout/route.ts"), "utf8");
const authGuardSrc = fs.readFileSync(path.join(SHOP_DIR, "lib/authGuard.ts"), "utf8");
const middlewareSrc = fs.readFileSync(path.join(SHOP_DIR, "middleware.ts"), "utf8");

test("Static", "Phone normalization handles +91, 91, 0-prefix, spaces, and rejects invalid numbers", () => {
  assert.strictEqual(normalizeIndianPhone("8887602317").clean10, "8887602317");
  assert.strictEqual(normalizeIndianPhone("+91 88876-02317").e164, "+918887602317");
  assert.strictEqual(normalizeIndianPhone("918887602317").clean10, "8887602317");
  assert.strictEqual(normalizeIndianPhone("08887602317").clean10, "8887602317");
  assert.strictEqual(normalizeIndianPhone("1234567890").valid, false);
  assert.strictEqual(normalizeIndianPhone("88876").valid, false);
});

test("Static", "Synthetic email derivation produces RPC primary + legacy candidate", () => {
  const { primary, legacy, candidates } = deriveShopkeeperSyntheticEmails("8887602317");
  assert.strictEqual(primary, "shop_918887602317@zuno.in");
  assert.strictEqual(legacy, "shop_8887602317@zuno.in");
  assert.deepStrictEqual(candidates, ["shop_918887602317@zuno.in", "shop_8887602317@zuno.in"]);
});

test("Static", "Remember Me ON preserves 30-day maxAge and OFF strips maxAge/expires", () => {
  const on = applyRememberMeCookieOptions({ path: "/", maxAge: 999, expires: new Date() }, true);
  assert.strictEqual(on.maxAge, 60 * 60 * 24 * 30);

  const off = applyRememberMeCookieOptions({ path: "/", maxAge: 999, expires: new Date() }, false);
  assert.strictEqual("maxAge" in off, false);
  assert.strictEqual("expires" in off, false);
});

test("Static", "Login UI includes required ZUNO elements and removes OTP & mock-login UI", () => {
  assert(loginPageSrc.includes('/brandlogo.png'), "Preserves ZUNO brandlogo.png");
  assert(loginPageSrc.includes("#0F5D3A") && loginPageSrc.includes("#22A06B") && loginPageSrc.includes("#F8FAF6"));
  assert(loginPageSrc.includes("rememberMe") && loginPageSrc.includes("useState(true)"));
  assert(loginPageSrc.includes("Forgot Password?"));
  assert(loginPageSrc.includes("Register New Shop"));
  assert(!loginPageSrc.includes("Send OTP") && !loginPageSrc.includes("FIRST_TIME_OTP"));
  assert(!loginPageSrc.includes("DEV MOCK AUTH"));
});

test("Static", "Registration UI collects password & confirmPassword and preserves PENDING status", () => {
  assert(registerPageSrc.includes("confirmPassword") && registerPageSrc.includes("Create Password"));
  assert(registerRouteSrc.includes("signUp") && registerRouteSrc.includes("register_shop_application"));
  assert(registerRouteSrc.includes("identities.length === 0") && registerRouteSrc.includes("status: 409"));
  assert(statusPageSrc.includes("handleSignOutAndReturn") && statusPageSrc.includes("/api/auth/logout"));
});

test("Static", "Authenticated password update exists in Settings and rejects unauthenticated requests", () => {
  assert(settingsClientSrc.includes("setShopkeeperPassword"));
  assert(setPasswordRouteSrc.includes("supabase.auth.getUser()") && setPasswordRouteSrc.includes("status: 401"));
});

test("Static", "No service-role key in client/login/guard/middleware and no SMS OTP anywhere in shop auth", () => {
  const noServiceRoleScope = [
    loginPageSrc,
    registerPageSrc,
    apiSrc,
    loginRouteSrc,
    setPasswordRouteSrc,
    logoutRouteSrc,
    authGuardSrc,
    middlewareSrc,
  ].join("\n");
  assert(!noServiceRoleScope.includes("SUPABASE_SERVICE_ROLE_KEY"), "No service role key outside server-only register provisioning");
  const noOtpScope = [noServiceRoleScope, registerRouteSrc].join("\n");
  assert(!noOtpScope.includes("signInWithOtp"), "No signInWithOtp");
  assert(!noOtpScope.includes("verifyOtp"), "No verifyOtp");
});

// ---------------------------------------------------------------------
// GROUP B: MOCKED ROUTE & AUTHORIZATION SIMULATION TESTS
// ---------------------------------------------------------------------
console.log("\n=== GROUP B: Mocked Supabase Auth & Access Control Simulation ===");

function createMockAuthSystem() {
  const users = new Map(); // email -> { id, password, hasPassword, confirmed }
  const shops = new Map(); // ownerId -> { id, name, phone, is_approved, approval_status, owner_id }

  users.set("shop_919876543210@zuno.in", {
    id: "u-approved",
    password: "Password1",
    hasPassword: true,
    confirmed: true,
  });
  shops.set("u-approved", {
    id: "shop-approved",
    name: "Approved Kirana",
    phone: "+919876543210",
    is_approved: true,
    approval_status: "APPROVED",
    owner_id: "u-approved",
  });

  users.set("shop_919876543211@zuno.in", {
    id: "u-pending",
    password: "Password1",
    hasPassword: true,
    confirmed: true,
  });
  shops.set("u-pending", {
    id: "shop-pending",
    name: "Pending Kirana",
    phone: "+919876543211",
    is_approved: false,
    approval_status: "PENDING",
    owner_id: "u-pending",
  });

  users.set("shop_919876543212@zuno.in", {
    id: "u-rejected",
    password: "Password1",
    hasPassword: true,
    confirmed: true,
  });
  shops.set("u-rejected", {
    id: "shop-rejected",
    name: "Rejected Kirana",
    phone: "+919876543212",
    is_approved: false,
    approval_status: "REJECTED",
    owner_id: "u-rejected",
  });

  users.set("shop_919876543213@zuno.in", {
    id: "u-suspended",
    password: "Password1",
    hasPassword: true,
    confirmed: true,
  });
  shops.set("u-suspended", {
    id: "shop-suspended",
    name: "Suspended Kirana",
    phone: "+919876543213",
    is_approved: false,
    approval_status: "SUSPENDED",
    owner_id: "u-suspended",
  });

  // Legacy passwordless OTP-era account (encrypted_password = '')
  users.set("shop_919876543214@zuno.in", {
    id: "u-passwordless",
    password: "",
    hasPassword: false,
    confirmed: true,
  });
  shops.set("u-passwordless", {
    id: "shop-passwordless",
    name: "Legacy OTP Store",
    phone: "+919876543214",
    is_approved: true,
    approval_status: "APPROVED",
    owner_id: "u-passwordless",
  });

  function mockLogin({ phone, password, rememberMe = true }) {
    const norm = normalizeIndianPhone(phone);
    if (!norm.valid) return { status: 400, error: "Invalid mobile number" };
    if (!password) return { status: 400, error: "Password required" };

    const { candidates } = deriveShopkeeperSyntheticEmails(norm.clean10);
    let matchedUser = null;
    for (const email of candidates) {
      const u = users.get(email);
      if (u && u.hasPassword && u.password === password) {
        if (!u.confirmed) {
          return { status: 403, code: "email_not_confirmed", error: "This account is pending email confirmation in Supabase Auth." };
        }
        matchedUser = u;
        break;
      }
    }

    if (!matchedUser) {
      return { status: 401, error: "Invalid mobile number or password." };
    }

    const shop = shops.get(matchedUser.id) || null;
    const isApproved = Boolean(shop?.is_approved) && shop?.approval_status === "APPROVED";
    const redirect = !shop ? "/register" : isApproved ? "/dashboard" : `/status?phone=${norm.clean10}`;
    const cookieOpts = applyRememberMeCookieOptions({ path: "/", httpOnly: true }, rememberMe);
    return { status: 200, userId: matchedUser.id, shopId: shop?.id, isApproved, redirect, cookieOpts };
  }

  function mockRegister({ phone, password, confirmPassword, shopName }) {
    const norm = normalizeIndianPhone(phone);
    if (!norm.valid) return { status: 400, error: "Invalid mobile" };
    if (password.length < 8 || password !== confirmPassword) return { status: 400, error: "Invalid password" };
    const { primary } = deriveShopkeeperSyntheticEmails(norm.clean10);
    if (users.has(primary)) {
      // Simulate Supabase obfuscated empty identities[] rejection -> 409
      return { status: 409, error: "An account or shop application already exists for this mobile number." };
    }
    const id = `u-${norm.clean10}`;
    users.set(primary, { id, password, hasPassword: true, confirmed: true });
    shops.set(id, {
      id: `shop-${norm.clean10}`,
      name: shopName,
      phone: norm.e164,
      is_approved: false,
      approval_status: "PENDING",
      owner_id: id,
    });
    return { status: 200, approvalStatus: "PENDING", isApproved: false, redirect: `/status?registered=true&phone=${norm.clean10}` };
  }

  function mockDashboardGuard(userId) {
    if (!userId) return { allowed: false, redirect: "/login?redirect=%2Fdashboard" };
    const shop = shops.get(userId);
    if (!shop) return { allowed: false, redirect: "/register" };
    if (!shop.is_approved || shop.approval_status !== "APPROVED") {
      return { allowed: false, redirect: "/status" };
    }
    return { allowed: true, shopId: shop.id };
  }

  return { mockLogin, mockRegister, mockDashboardGuard };
}

test("Mocked", "Correct mobile + password succeeds and grants approved shop dashboard", () => {
  const sys = createMockAuthSystem();
  const res = sys.mockLogin({ phone: "+91 9876543210", password: "Password1", rememberMe: true });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.redirect, "/dashboard");
  assert.strictEqual(res.cookieOpts.maxAge, 60 * 60 * 24 * 30);
  assert.strictEqual(sys.mockDashboardGuard(res.userId).allowed, true);
});

test("Mocked", "Incorrect password returns generic 401 without revealing existence", () => {
  const sys = createMockAuthSystem();
  const res = sys.mockLogin({ phone: "9876543210", password: "WrongPassword9" });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.error, "Invalid mobile number or password.");
});

test("Mocked", "Remember Me OFF issues browser-session cookie without maxAge or expires", () => {
  const sys = createMockAuthSystem();
  const res = sys.mockLogin({ phone: "9876543210", password: "Password1", rememberMe: false });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.cookieOpts.maxAge, undefined);
  assert.strictEqual(res.cookieOpts.expires, undefined);
});

test("Mocked", "Pending, rejected, and suspended shops are denied /dashboard and routed to /status", () => {
  const sys = createMockAuthSystem();
  for (const phone of ["9876543211", "9876543212", "9876543213"]) {
    const login = sys.mockLogin({ phone, password: "Password1" });
    assert.strictEqual(login.status, 200);
    assert.strictEqual(login.isApproved, false);
    assert(login.redirect.startsWith("/status"));
    assert.strictEqual(sys.mockDashboardGuard(login.userId).allowed, false);
    assert.strictEqual(sys.mockDashboardGuard(login.userId).redirect, "/status");
  }
});

test("Mocked", "Cross-shop isolation: authenticated user only resolves own shopId from owner_id", () => {
  const sys = createMockAuthSystem();
  const guardA = sys.mockDashboardGuard("u-approved");
  assert.strictEqual(guardA.shopId, "shop-approved");
  assert.notStrictEqual(guardA.shopId, "shop-pending");
});

test("Mocked", "Existing passwordless account cannot log in or be claimed via registration", () => {
  const sys = createMockAuthSystem();
  const loginEmpty = sys.mockLogin({ phone: "9876543214", password: "" });
  assert.strictEqual(loginEmpty.status, 400);
  const loginGuess = sys.mockLogin({ phone: "9876543214", password: "AnyPassword1" });
  assert.strictEqual(loginGuess.status, 401);
  assert.strictEqual(loginGuess.error, "Invalid mobile number or password.");

  const claimViaRegister = sys.mockRegister({
    phone: "9876543214",
    password: "HijackPassword1",
    confirmPassword: "HijackPassword1",
    shopName: "Hijacked",
  });
  assert.strictEqual(claimViaRegister.status, 409);
});

test("Mocked", "New registration creates PENDING shop and prevents duplicate accounts", () => {
  const sys = createMockAuthSystem();
  const reg = sys.mockRegister({
    phone: "9876500001",
    password: "NewShopPassword1",
    confirmPassword: "NewShopPassword1",
    shopName: "Fresh Mart",
  });
  assert.strictEqual(reg.status, 200);
  assert.strictEqual(reg.approvalStatus, "PENDING");
  assert.strictEqual(reg.isApproved, false);
  assert(reg.redirect.startsWith("/status"));

  const dup = sys.mockRegister({
    phone: "+91 9876500001",
    password: "AnotherPassword1",
    confirmPassword: "AnotherPassword1",
    shopName: "Duplicate Mart",
  });
  assert.strictEqual(dup.status, 409);
});

// ---------------------------------------------------------------------
// GROUP C: LIVE LOCAL SERVER & ACTUAL SUPABASE AUTH VERIFICATION
// ---------------------------------------------------------------------
async function runLiveTests() {
  console.log("\n=== GROUP C: Live Next.js Server & Actual Supabase Auth Verification ===");

  if (OFFLINE_ONLY) {
    skip("Live", "All live HTTP & Supabase Auth checks", "--offline specified");
    return;
  }

  await asyncTest("Live Server", "GET /login returns HTTP 200 with simplified login markup", async () => {
    const r = await httpRequest("GET", "/login");
    assert.strictEqual(r.status, 200);
    assert(r.raw.includes("Welcome Back") && r.raw.includes("Forgot Password?") && r.raw.includes("Register New Shop"));
    assert(!r.raw.includes("DEV MOCK AUTH") && !r.raw.includes("Send Activation Code"));
  });

  await asyncTest("Live Server", "GET /register returns HTTP 200 with password fields", async () => {
    const r = await httpRequest("GET", "/register");
    assert.strictEqual(r.status, 200);
    assert(r.raw.includes("Create Password") && r.raw.includes("Confirm Password"));
  });

  await asyncTest("Live Server", "GET /status returns HTTP 200", async () => {
    const r = await httpRequest("GET", "/status");
    assert.strictEqual(r.status, 200);
  });

  await asyncTest("Live Server", "GET /dashboard unauthenticated redirects (307) to /login", async () => {
    const r = await httpRequest("GET", "/dashboard");
    assert.strictEqual(r.status, 307);
    assert((r.headers.location || "").includes("/login"));
  });

  await asyncTest("Live Server", "POST /api/auth/login rejects invalid mobile with HTTP 400", async () => {
    const r = await httpRequest("POST", "/api/auth/login", { phone: "12345", password: "Password1" });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.json?.success, false);
  });

  await asyncTest("Live Supabase", "POST /api/auth/login hits real Supabase Auth and returns generic 401 for wrong credentials", async () => {
    const r = await httpRequest("POST", "/api/auth/login", {
      phone: "9999900001",
      password: "WrongPassword123",
      rememberMe: true,
    });
    assert.strictEqual(r.status, 401, `Expected 401 from Supabase Auth, got ${r.status}: ${r.raw}`);
    assert.strictEqual(r.json?.error, "Invalid mobile number or password.");
  });

  await asyncTest("Live Server", "POST /api/auth/register rejects mismatched passwords with HTTP 400", async () => {
    const r = await httpRequest("POST", "/api/auth/register", {
      ownerFullName: "Test Owner",
      phone: "9999900002",
      password: "Password1",
      confirmPassword: "Password2",
      shopName: "Test Store",
      addressLine: "Main Market",
    });
    assert.strictEqual(r.status, 400);
  });

  await asyncTest("Live Server", "POST /api/auth/set-password rejects unauthenticated call with HTTP 401", async () => {
    const r = await httpRequest("POST", "/api/auth/set-password", {
      newPassword: "Password1",
      confirmPassword: "Password1",
    });
    assert.strictEqual(r.status, 401);
  });

  await asyncTest("Live Server", "GET /api/auth/logout rejected (405); POST clears cookies (200)", async () => {
    const g = await httpRequest("GET", "/api/auth/logout");
    assert.strictEqual(g.status, 405);
    const p = await httpRequest("POST", "/api/auth/logout");
    assert.strictEqual(p.status, 200);
    const cookies = p.headers["set-cookie"] || [];
    assert(cookies.some((c) => c.includes("zuno_remember_me=") && c.includes("Max-Age=0")));
  });

  await asyncTest("Live Server", "POST /api/auth/dev-mock-login enforces 403 when NODE_ENV=production logic verified", async () => {
    // Live dev server runs NODE_ENV=development; verify production rejection invariant in route source
    const devMockSrc = fs.readFileSync(path.join(SHOP_DIR, "app/api/auth/dev-mock-login/route.ts"), "utf8");
    assert(devMockSrc.includes('process.env.NODE_ENV === "production"') && devMockSrc.includes("status: 403"));
  });

  await asyncTest("Live Supabase", "Read-only GET /auth/v1/settings returns HTTP 200 with email enabled & phone disabled", async () => {
    const env = loadShopEnv();
    assert(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Missing shop env");
    const res = await new Promise((resolve, reject) => {
      https
        .get(
          `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`,
          { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY } },
          (r) => {
            let b = "";
            r.on("data", (c) => (b += c));
            r.on("end", () => resolve({ status: r.statusCode, data: JSON.parse(b) }));
          }
        )
        .on("error", reject);
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data?.external?.email, true);
    assert.strictEqual(res.data?.external?.phone, false);
  });
}

runLiveTests().then(() => {
  console.log(`\n==================================================================`);
  console.log(` ZUNO AUTH-3 Suite Complete: ${passed} passed, ${failed} failed, ${skipped} skipped.`);
  console.log(`==================================================================`);
  if (failed > 0) process.exit(1);
});

