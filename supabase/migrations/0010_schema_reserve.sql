-- =============================================================
-- 0010_schema_reserve.sql
-- Reserve foundational schema names not yet built.
-- Locks governance, receipts, and signals into the kernel
-- namespace to prevent accidental use or naming drift.
-- No tables, functions, or ACL changes in this migration.
-- =============================================================

CREATE SCHEMA IF NOT EXISTS governance;
COMMENT ON SCHEMA governance IS
  'Policy controls, versioning, freeze enforcement, and mutation authority rules.';

CREATE SCHEMA IF NOT EXISTS receipts;
COMMENT ON SCHEMA receipts IS
  'Proof artifacts, append receipts, and verification outputs.';

CREATE SCHEMA IF NOT EXISTS signals;
COMMENT ON SCHEMA signals IS
  'Derived detections, warnings, and enforcement indicators.';
