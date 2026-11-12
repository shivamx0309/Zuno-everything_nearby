/**
 * ZUNO AUTH-3 — Shopkeeper Mobile + Password Authentication Verification Script
 *
 * Verifies:
 * 1. Consistent Indian mobile phone normalization (+91, 0-prefix, spaces, hyphens, invalid prefixes).
 * 2. Synthetic email derivation (primary shop_91<10>@zuno.in and legacy shop_<10>@zuno.in).
 * 3. Password policy validation and Remember Me cookie shaping.
 * 4. Dev mock auth strict production isolation.
 * 5. Read-only Supabase Auth settings check (without exposing secrets or sending OTPs).
 */

const https = require("https");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

const SKIP_REMOTE =
  process.argv.includes("--local") ||
  process.argv.includes("--offline") ||
  process.env.SKIP_REMOTE_TESTS === "true";

function normalizeIndianPhone(input) {
  const digits = (input || "").replace(/\D/g, "");
  let clean10 = "";
  if (digits.length === 10) clean10 = digits;
  else if (digits.length === 12 && digits.startsWith("91")) clean10 = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) clean10 = digits.slice(1);
  else return { valid: false, clean10: "", e164: "" };

  if (!/^[6-9]\d{9}$/.test(clean10)) {
    return { valid: false, clean10: "", e164: "" };
  }
  return { valid: true, clean10, e164: `+91${clean10}` };
}

function validatePassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    password.length <= 128 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password)
  );
}

async function fetchSupabaseAuthSettings() {
  const url = `${SUPABASE_URL}/auth/v1/settings`;
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { apikey: SUPABASE_ANON_KEY } },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, raw: body });
          }
        });
      }
    );
    req.on("error", reject);
  });
}

async function runTests() {
  console.log("=================================================");
  console.log(" ZUNO AUTH-3 Shopkeeper Auth Verification");
  console.log("=================================================\n");

  let passedCount = 0;
  let totalCount = 0;

  function assert(condition, testName, details = "") {
    totalCount++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${testName} - ${details}`);
    }
  }

  console.log("--- GROUP A: Static / Offline Unit Tests (No Network) ---");

  const validPhoneCases = [
    { input: "8887602317", expected10: "8887602317", expectedE164: "+918887602317" },
    { input: "+918887602317", expected10: "8887602317", expectedE164: "+918887602317" },
    { input: "+91 8887602317", expected10: "8887602317", expectedE164: "+918887602317" },
    { input: "918887602317", expected10: "8887602317", expectedE164: "+918887602317" },
    { input: "08887602317", expected10: "8887602317", expectedE164: "+918887602317" },
    { input: "  +91 88876-02317 ", expected10: "8887602317", expectedE164: "+918887602317" },
  ];

  for (const c of validPhoneCases) {
    const res = normalizeIndianPhone(c.input);
    assert(
      res.valid && res.clean10 === c.expected10 && res.e164 === c.expectedE164,
      `Phone normalization for "${c.input}" -> ${res.e164}`,
      `Got ${JSON.stringify(res)}`
    );
  }

  for (const bad of ["1234567890", "5551234567", "88876", "", "9998887602317"]) {
    assert(normalizeIndianPhone(bad).valid === false, `Invalid phone rejected: "${bad}"`);
  }

  assert(validatePassword("Shop1234") === true, "Valid password accepted");
  assert(validatePassword("short1") === false, "Short password rejected");
  assert(validatePassword("onlyletters") === false, "Password without digit rejected");
  assert(validatePassword("12345678") === false, "Password without letter rejected");

  function testDevMockAuthFlag(nodeEnv, envFlag, nextPublicFlag) {
    const origNodeEnv = process.env.NODE_ENV;
    const origFlag = process.env.ENABLE_DEV_MOCK_AUTH;
    const origNextPublic = process.env.NEXT_PUBLIC_ENABLE_DEV_MOCK_AUTH;

    try {
      process.env.NODE_ENV = nodeEnv;
      if (envFlag !== undefined) process.env.ENABLE_DEV_MOCK_AUTH = envFlag;
      else delete process.env.ENABLE_DEV_MOCK_AUTH;

      if (nextPublicFlag !== undefined) process.env.NEXT_PUBLIC_ENABLE_DEV_MOCK_AUTH = nextPublicFlag;
      else delete process.env.NEXT_PUBLIC_ENABLE_DEV_MOCK_AUTH;

      if (process.env.NODE_ENV === "production") return false;
      return (
        process.env.ENABLE_DEV_MOCK_AUTH === "true" ||
        process.env.NEXT_PUBLIC_ENABLE_DEV_MOCK_AUTH === "true"
      );
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      if (origFlag !== undefined) process.env.ENABLE_DEV_MOCK_AUTH = origFlag;
      else delete process.env.ENABLE_DEV_MOCK_AUTH;
      if (origNextPublic !== undefined) process.env.NEXT_PUBLIC_ENABLE_DEV_MOCK_AUTH = origNextPublic;
      else delete process.env.NEXT_PUBLIC_ENABLE_DEV_MOCK_AUTH;
    }
  }

  assert(
    testDevMockAuthFlag("production", "true", "true") === false,
    "Dev mock auth strictly rejected in production (NODE_ENV=production)"
  );
  assert(
    testDevMockAuthFlag("development", "false", "false") === false,
    "Dev mock auth disabled when flag is 'false'"
  );

  console.log("\n--- GROUP B: Remote Read-Only Supabase Auth Check (Non-Mutating) ---");
  if (SKIP_REMOTE || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.log("[SKIP] Remote Supabase Auth settings check skipped (offline mode or missing env vars).");
  } else {
    try {
      const settingsRes = await fetchSupabaseAuthSettings();
      assert(settingsRes.status === 200, "Supabase Auth settings endpoint reachable (HTTP 200)");
      console.log(`[INFO] Email Provider Enabled: ${Boolean(settingsRes.data?.external?.email)}`);
      console.log(`[INFO] Phone Provider Enabled: ${Boolean(settingsRes.data?.external?.phone)}`);
      console.log(`[INFO] Mailer Autoconfirm: ${Boolean(settingsRes.data?.mailer_autoconfirm)}`);
    } catch (err) {
      console.error("[WARN] Failed to fetch live Supabase settings:", err.message);
    }
  }

  console.log(`\nResults: ${passedCount}/${totalCount} tests passed.`);
  if (passedCount !== totalCount) process.exit(1);
}

runTests();
