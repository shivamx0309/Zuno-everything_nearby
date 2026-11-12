/**
 * ZUNO Phase 1.3.1 — Safe Automated Local Database Verification Runner
 *
 * Safety Invariants:
 * 1. Strictly refuses execution against any remote host (e.g. *.supabase.co).
 * 2. Only permits connections to explicitly isolated local loopback addresses (localhost, 127.0.0.1).
 * 3. Never prints secrets or credentials.
 * 4. Halts cleanly if isolated environment is not yet provisioned.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function verifyLocalEnvironment() {
  console.log("=========================================================");
  console.log(" ZUNO Phase 1.3.1 — Isolated Database Verification Gate ");
  console.log("=========================================================\n");

  const testDbUrl = process.env.TEST_DATABASE_URL || "";
  const harnessPath = path.join(__dirname, "test-phase1-isolated-db-harness.sql");

  if (!fs.existsSync(harnessPath)) {
    console.error("[ERROR] Test harness file not found:", harnessPath);
    process.exit(1);
  }

  // Safety Gate: Ensure no remote database connection can be passed
  if (testDbUrl) {
    try {
      const parsed = new URL(testDbUrl);
      const host = parsed.hostname.toLowerCase();
      const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(host);

      if (!isLoopback) {
        console.error(`\n[CRITICAL SAFETY REFUSAL] Target host "${host}" is NOT a local loopback address!`);
        console.error("The test harness refuses to run against shared, staging, or remote databases.");
        console.error("Aborting immediately without modifying state.\n");
        process.exit(1);
      }
    } catch (err) {
      console.error("[ERROR] Invalid TEST_DATABASE_URL format.");
      process.exit(1);
    }
  }

  // Check if psql is available
  const psqlCheck = spawnSync("where", ["psql"], { encoding: "utf8", shell: false });
  let psqlBin = "psql";

  if (psqlCheck.status !== 0) {
    const defaultWinPgPath = "C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe";
    if (fs.existsSync(defaultWinPgPath)) {
      psqlBin = defaultWinPgPath;
    } else {
      console.log("[STATUS: BLOCKED]");
      console.log("1. psql CLI is not found in PATH or standard installation directories.");
      console.log("2. Target environment requires an isolated local PostgreSQL instance.");
      console.log("\nSafe Provisioning Commands:");
      console.log("  a. Provision isolated database: createdb -h localhost -U postgres zuno_test_isolated");
      console.log("  b. Run migrations: psql -h localhost -U postgres -d zuno_test_isolated -f supabase/migrations/...");
      console.log("  c. Run harness: psql -h localhost -U postgres -d zuno_test_isolated -f scripts/test-phase1-isolated-db-harness.sql\n");
      return;
    }
  }

  if (!testDbUrl) {
    console.log("[STATUS: BLOCKED — PENDING ISOLATED DB URL]");
    console.log("No TEST_DATABASE_URL provided. To execute tests safely against a local database:\n");
    console.log(`  $env:TEST_DATABASE_URL="postgres://postgres:password@localhost:5432/zuno_test_isolated"`);
    console.log(`  node scripts/verify-phase1-isolated-db.js\n`);
    console.log("Or execute the SQL harness directly with psql:");
    console.log(`  & "${psqlBin}" -h localhost -p 5432 -U postgres -d zuno_test_isolated -f scripts/test-phase1-isolated-db-harness.sql\n`);
    return;
  }

  console.log(`[INFO] Executing test harness against isolated local endpoint...`);
  const res = spawnSync(psqlBin, [testDbUrl, "-f", harnessPath, "-v", "ON_ERROR_STOP=1"], {
    encoding: "utf8",
    shell: false,
  });

  if (res.stdout) console.log(res.stdout);
  if (res.stderr) console.error(res.stderr);

  if (res.status === 0) {
    console.log("\n[SUCCESS] All isolated PostgreSQL integration tests PASSED!");
  } else {
    console.error("\n[FAIL] Test harness encountered an error. See output above.");
    process.exit(res.status || 1);
  }
}

verifyLocalEnvironment();
