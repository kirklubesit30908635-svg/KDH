-- =============================================================
-- 0002_schemas.sql
-- Schema declarations and foundational ledger utilities.
-- =============================================================

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS registry;
CREATE SCHEMA IF NOT EXISTS ledger;
CREATE SCHEMA IF NOT EXISTS ingest;
CREATE SCHEMA IF NOT EXISTS api;

-- ---------------------------------------------------------------
-- ledger._deny_mutation
-- Raise on UPDATE/DELETE; attached as BEFORE trigger on all
-- append-only tables (ledger.events, ledger.receipts,
-- ingest.raw_events, ingest.trusted_events).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION ledger._deny_mutation()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table "%" is append-only: % is not permitted',
    TG_TABLE_NAME, TG_OP;
END;
$$;

-- ---------------------------------------------------------------
-- ledger.sha256_hex
-- SHA-256 hex digest of any text input.
-- Called exclusively from ledger trigger functions, which run as
-- postgres (superuser) and therefore bypass EXECUTE ACL.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION ledger.sha256_hex(input text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT
SET search_path = pg_catalog, extensions
AS $$
  SELECT encode(digest(input, 'sha256'), 'hex');
$$;
