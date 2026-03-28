import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationSql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260328060000_align_provisioning_to_autokirk_doctrine.sql"),
  "utf-8"
);

const provisionTs = readFileSync(
  join(process.cwd(), "src", "lib", "kernel", "provisionFromStripe.ts"),
  "utf-8"
);

// === Migration: table rename ===

test("renames stripe_customer_map to billing_account_bindings", () => {
  assert.ok(migrationSql.includes("RENAME TO billing_account_bindings"));
});

test("renames indexes to match new table name", () => {
  assert.ok(migrationSql.includes("idx_billing_account_bindings_cust"));
  assert.ok(migrationSql.includes("idx_billing_account_bindings_email"));
});

// === Migration: event/receipt rename ===

test("renames event type to workspace.provisioned", () => {
  assert.ok(migrationSql.includes("workspace.provisioned"));
  assert.ok(!migrationSql.includes("'customer.provisioned'") || migrationSql.includes("WHERE name = 'customer.provisioned'"));
});

test("updates receipt description to reference governed activation", () => {
  assert.ok(migrationSql.includes("Governed account activation receipt"));
});

// === Migration: function rename ===

test("creates provision_account_workspace as primary function", () => {
  assert.ok(migrationSql.includes("CREATE OR REPLACE FUNCTION api.provision_account_workspace"));
});

test("provision_account_workspace is SECURITY DEFINER", () => {
  const fnStart = migrationSql.indexOf("FUNCTION api.provision_account_workspace");
  const block = migrationSql.slice(fnStart, fnStart + 500);
  assert.ok(block.includes("SECURITY DEFINER"));
});

test("keeps provision_customer_workspace as backward-compatible wrapper", () => {
  assert.ok(migrationSql.includes("provision_customer_workspace"));
  assert.ok(migrationSql.includes("Backward-compatible wrapper"));
});

test("wrapper delegates to provision_account_workspace", () => {
  assert.ok(migrationSql.includes("SELECT api.provision_account_workspace("));
});

// === Migration: view rename ===

test("drops old v_customer_provisioning view", () => {
  assert.ok(migrationSql.includes("DROP VIEW IF EXISTS api.v_customer_provisioning"));
});

test("creates v_workspace_provisioning view", () => {
  assert.ok(migrationSql.includes("api.v_workspace_provisioning"));
});

test("view uses activated_at instead of provisioned_at", () => {
  assert.ok(migrationSql.includes("AS activated_at"));
});

test("view uses billing_account_id instead of stripe_customer_id", () => {
  assert.ok(migrationSql.includes("AS billing_account_id"));
});

// === Migration: RLS policies renamed ===

test("creates billing_account_bindings_auth_read policy", () => {
  assert.ok(migrationSql.includes("billing_account_bindings_auth_read"));
});

test("creates billing_account_bindings_service_all policy", () => {
  assert.ok(migrationSql.includes("billing_account_bindings_service_all"));
});

// === Migration: Stripe is boundary, kernel owns nouns ===

test("function uses billing_account_id in metadata instead of stripe_customer_id", () => {
  const fnStart = migrationSql.indexOf("FUNCTION api.provision_account_workspace");
  const fnBody = migrationSql.slice(fnStart, migrationSql.indexOf("END;", fnStart) + 5);
  assert.ok(fnBody.includes("billing_account_id"));
});

test("function uses activation language instead of provisioning language", () => {
  const fnStart = migrationSql.indexOf("FUNCTION api.provision_account_workspace");
  const fnBody = migrationSql.slice(fnStart, migrationSql.indexOf("END;", fnStart) + 5);
  assert.ok(fnBody.includes("activation:"));
  assert.ok(fnBody.includes("activation-pipeline"));
});

test("function comment establishes AutoKirk ownership", () => {
  assert.ok(migrationSql.includes("Stripe is the billing trigger; AutoKirk owns the activation path"));
});

// === TypeScript alignment ===

test("provisionFromStripe.ts calls provision_account_workspace", () => {
  assert.ok(provisionTs.includes('provision_account_workspace'));
});

test("provisionFromStripe.ts header uses AutoKirk doctrine language", () => {
  assert.ok(provisionTs.includes("Billing Source"));
  assert.ok(provisionTs.includes("AutoKirk owns the activation path"));
});

// === Transaction safety ===

test("migration wraps in transaction", () => {
  assert.ok(migrationSql.includes("BEGIN;"));
  assert.ok(migrationSql.includes("COMMIT;"));
});
