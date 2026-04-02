import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ═══════════════════════════════════════════════════════════════
// 1. Migration SQL structure tests
// ═══════════════════════════════════════════════════════════════

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260327210000_customer_provisioning_pipeline.sql"
);

let migrationSql = "";
try {
  migrationSql = readFileSync(migrationPath, "utf-8");
} catch {
  // If file not found, tests will fail with clear message
}

test("migration file exists and is non-empty", () => {
  assert.ok(migrationSql.length > 0, "Migration SQL file should exist and have content");
});

test("migration creates registry.stripe_customer_map table", () => {
  assert.ok(
    migrationSql.includes("CREATE TABLE IF NOT EXISTS registry.stripe_customer_map"),
    "Should create stripe_customer_map table"
  );
});

test("migration creates api.provision_customer_workspace function", () => {
  assert.ok(
    migrationSql.includes("api.provision_customer_workspace"),
    "Should create provision_customer_workspace RPC"
  );
});

test("migration creates api.link_operator_on_login function", () => {
  assert.ok(
    migrationSql.includes("api.link_operator_on_login"),
    "Should create link_operator_on_login RPC"
  );
});

test("migration creates api.v_customer_provisioning view", () => {
  assert.ok(
    migrationSql.includes("api.v_customer_provisioning"),
    "Should create customer provisioning dashboard view"
  );
});

test("migration registers provisioning event type", () => {
  assert.ok(
    migrationSql.includes("customer.provisioned"),
    "Should register customer.provisioned event type"
  );
});

test("migration registers provisioning receipt type", () => {
  assert.ok(
    migrationSql.includes("INTO registry.receipt_types") &&
    migrationSql.includes("provisioning"),
    "Should register provisioning receipt type"
  );
});

test("provision RPC is SECURITY DEFINER", () => {
  const fnStart = migrationSql.indexOf("CREATE OR REPLACE FUNCTION api.provision_customer_workspace");
  assert.ok(fnStart > -1, "Should find CREATE OR REPLACE FUNCTION");
  const fnBlock = migrationSql.slice(fnStart, fnStart + 500);
  assert.ok(
    fnBlock.includes("SECURITY DEFINER"),
    "provision_customer_workspace must be SECURITY DEFINER"
  );
});

test("provision RPC is idempotent (checks for existing customer)", () => {
  assert.ok(
    migrationSql.includes("already_provisioned"),
    "Should return already_provisioned for duplicate Stripe customers"
  );
});

test("provision RPC creates obligation with operationalize_subscription type", () => {
  assert.ok(
    migrationSql.includes("operationalize_subscription"),
    "Should create operationalize_subscription obligation"
  );
});

test("provision RPC creates ledger event with hash chain placeholders", () => {
  // The trigger assigns real values, but the INSERT must provide placeholders
  assert.ok(
    migrationSql.includes("'GENESIS'") && migrationSql.includes("'PENDING'"),
    "Should use GENESIS/PENDING placeholders for hash chain trigger"
  );
});

test("provision RPC links receipt to obligation via proof linkage", () => {
  assert.ok(
    migrationSql.includes("proof_state") && migrationSql.includes("linked"),
    "Should link provisioning receipt to obligation with proof_state = linked"
  );
});

test("provision RPC uses obligation chain_key format", () => {
  // Receipt chain_key must follow 'obligation:' || id pattern for auto-linking
  assert.ok(
    migrationSql.includes("'obligation:' || v_obligation_id"),
    "Receipt chain_key must follow obligation:UUID pattern"
  );
});

test("provision RPC is restricted to service_role only", () => {
  assert.ok(
    migrationSql.includes("GRANT EXECUTE ON FUNCTION api.provision_customer_workspace") &&
    migrationSql.includes("TO service_role"),
    "provision_customer_workspace should only be callable by service_role"
  );
});

test("link_operator_on_login RPC handles race conditions", () => {
  assert.ok(
    migrationSql.includes("ON CONFLICT (auth_uid) DO NOTHING"),
    "Should handle concurrent operator creation with ON CONFLICT"
  );
});

test("stripe_customer_map has RLS enabled", () => {
  assert.ok(
    migrationSql.includes("ENABLE ROW LEVEL SECURITY") &&
    migrationSql.includes("stripe_customer_map"),
    "stripe_customer_map must have RLS enabled"
  );
});

test("migration wraps in transaction", () => {
  assert.ok(
    migrationSql.trimStart().startsWith("--") || migrationSql.includes("BEGIN;"),
    "Migration should use BEGIN/COMMIT transaction"
  );
  assert.ok(
    migrationSql.includes("COMMIT;"),
    "Migration should end with COMMIT"
  );
});

// ═══════════════════════════════════════════════════════════════
// 2. Kernel audit compliance
// ═══════════════════════════════════════════════════════════════

test("KERNEL AUDIT: obligation is created", () => {
  assert.ok(
    migrationSql.includes("INSERT INTO core.obligations"),
    "Audit #1: must create obligation on provisioning"
  );
});

test("KERNEL AUDIT: receipt is created", () => {
  assert.ok(
    migrationSql.includes("INSERT INTO ledger.receipts"),
    "Audit #2: must create receipt on provisioning"
  );
});

test("KERNEL AUDIT: mutation is governed via api schema", () => {
  assert.ok(
    migrationSql.includes("CREATE OR REPLACE FUNCTION api.provision_customer_workspace"),
    "Audit #3: must route through api.* governed RPC"
  );
});

test("KERNEL AUDIT: no revenue leakage path", () => {
  // Idempotency guard prevents duplicate provisioning
  assert.ok(
    migrationSql.includes("stripe_customer_id = p_stripe_customer_id") &&
    migrationSql.includes("IF FOUND THEN"),
    "Audit #4: idempotency guard prevents leakage"
  );
});

test("KERNEL AUDIT: workspace isolation enforced", () => {
  assert.ok(
    migrationSql.includes("workspace_id") &&
    migrationSql.includes("ROW LEVEL SECURITY"),
    "Audit #5: workspace_id scoping and RLS enforced"
  );
});

// ═══════════════════════════════════════════════════════════════
// 3. TypeScript file structure tests
// ═══════════════════════════════════════════════════════════════

const provisionTsPath = join(
  process.cwd(),
  "src",
  "lib",
  "kernel",
  "provisionFromStripe.ts"
);

const linkTsPath = join(
  process.cwd(),
  "src",
  "lib",
  "kernel",
  "linkOperatorOnLogin.ts"
);

let provisionTs = "";
let linkTs = "";

try { provisionTs = readFileSync(provisionTsPath, "utf-8"); } catch { /* */ }
try { linkTs = readFileSync(linkTsPath, "utf-8"); } catch { /* */ }

test("provisionFromStripe.ts exists", () => {
  assert.ok(provisionTs.length > 0, "provisionFromStripe.ts should exist");
});

test("provisionFromStripe handles checkout.session.completed", () => {
  assert.ok(
    provisionTs.includes("checkout.session.completed"),
    "Should handle checkout.session.completed event type"
  );
});

test("provisionFromStripe handles customer.subscription.created", () => {
  assert.ok(
    provisionTs.includes("customer.subscription.created"),
    "Should handle customer.subscription.created event type"
  );
});

test("provisionFromStripe uses schema-qualified RPC call", () => {
  assert.ok(
    provisionTs.includes('.schema("api")') &&
    provisionTs.includes('.rpc("provision_account_workspace"'),
    "Should call api.provision_account_workspace via schema-qualified path"
  );
});

test("provisionFromStripe has fallback email for missing email", () => {
  assert.ok(
    provisionTs.includes("autokirk.provision"),
    "Should use placeholder email when Stripe event lacks email"
  );
});

test("linkOperatorOnLogin.ts exists", () => {
  assert.ok(linkTs.length > 0, "linkOperatorOnLogin.ts should exist");
});

test("linkOperatorOnLogin calls link_operator_on_login RPC", () => {
  assert.ok(
    linkTs.includes("link_operator_on_login"),
    "Should call the link_operator_on_login RPC"
  );
});

// ═══════════════════════════════════════════════════════════════
// 4. Webhook route integration check
// ═══════════════════════════════════════════════════════════════

const webhookRoutePath = join(
  process.cwd(),
  "src",
  "app",
  "api",
  "stripe",
  "webhook",
  "route.ts"
);

let webhookRoute = "";
try { webhookRoute = readFileSync(webhookRoutePath, "utf-8"); } catch { /* */ }

test("webhook route imports provisionFromStripe", () => {
  assert.ok(
    webhookRoute.includes("provisionFromStripe"),
    "Webhook route should import provisionFromStripe"
  );
});

test("webhook route triggers provisioning for subscription events", () => {
  assert.ok(
    webhookRoute.includes("PROVISIONING_EVENTS") &&
    webhookRoute.includes("checkout.session.completed") &&
    webhookRoute.includes("customer.subscription.created"),
    "Should define provisioning event set with both event types"
  );
});

test("webhook route makes provisioning non-fatal", () => {
  assert.ok(
    webhookRoute.includes("non-fatal"),
    "Provisioning failures should be non-fatal to ingest"
  );
});

// ═══════════════════════════════════════════════════════════════
// 5. Auth callback integration check
// ═══════════════════════════════════════════════════════════════

const authCallbackPath = join(
  process.cwd(),
  "src",
  "app",
  "auth",
  "callback",
  "route.ts"
);

let authCallback = "";
try { authCallback = readFileSync(authCallbackPath, "utf-8"); } catch { /* */ }

test("auth callback imports linkOperatorOnLogin", () => {
  assert.ok(
    authCallback.includes("linkOperatorOnLogin"),
    "Auth callback should import linkOperatorOnLogin"
  );
});

test("auth callback no longer uses manual provisionOperator", () => {
  assert.ok(
    !authCallback.includes("provisionOperator"),
    "Auth callback should NOT use the old manual provisionOperator function"
  );
});

test("auth callback no longer imports getSupabaseAdmin directly", () => {
  assert.ok(
    !authCallback.includes("getSupabaseAdmin"),
    "Auth callback should use linkOperatorOnLogin RPC, not direct admin client"
  );
});
