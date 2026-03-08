-- =============================================================
-- 0021_grant_authenticated_schema_usage.sql
--
-- Fix: migration 0019 granted USAGE ON SCHEMA core to
-- service_role and anon, but missed authenticated.
-- Authenticated users could SELECT on tables but couldn't
-- access the schema at all → "permission denied for schema core"
-- =============================================================

GRANT USAGE ON SCHEMA core TO authenticated;
