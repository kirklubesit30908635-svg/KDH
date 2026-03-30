import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260330110000_operator_watchdog_runtime.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");

test("watchdog migration registers obligation.watchdog_signal event type", () => {
  assert.match(migrationSql, /obligation\.watchdog_signal/);
});

test("watchdog migration defines record_obligation_watchdog_signal", () => {
  assert.match(migrationSql, /create or replace function api\.record_obligation_watchdog_signal/i);
  assert.match(migrationSql, /watchdog:%s:%s/);
});

test("watchdog migration defines run_workspace_watchdog", () => {
  assert.match(migrationSql, /create or replace function api\.run_workspace_watchdog/i);
  assert.match(migrationSql, /from core\.v_operator_next_actions/i);
});

test("watchdog migration grants governed execution to authenticated and service_role", () => {
  assert.match(migrationSql, /grant execute on function api\.record_obligation_watchdog_signal/i);
  assert.match(migrationSql, /grant execute on function api\.run_workspace_watchdog/i);
});
