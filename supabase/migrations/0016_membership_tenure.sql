-- =============================================================
-- 0016_membership_tenure.sql
-- Add tenure/lifecycle fields to core.memberships.
--
-- Preserves one canonical membership authority while adding:
--   - temporal access windows  (active_from, active_to)
--   - explicit lifecycle state (status)
--   - mutation timestamp       (updated_at)
--
-- core.is_member() is updated to enforce tenure. All downstream
-- RLS (ledger.events, ledger.receipts, signals.*, governance.*)
-- inherits tenure-aware membership checks automatically.
--
-- Boundary semantics (explicit):
--   valid when active_from <= now()          inclusive lower bound
--   valid when active_to IS NULL             open-ended membership
--   valid when active_to > now()             exclusive upper bound
--   expired at the instant active_to = now() no ambiguity at expiry
--
-- Status vocabulary:
--   active     — full access, within window
--   suspended  — temporary block; window preserved; reversible
--   revoked    — explicit termination by operator action
--   expired    — set by scheduled job when active_to passes;
--                status = 'expired' makes expiry queryable without
--                re-evaluating the window on every read
--
-- Backfill assumption:
--   active_from = created_at for all legacy rows. This asserts
--   that membership authority began at row creation time. That is
--   a reconstruction assumption — correct for this codebase since
--   no prior tenure data exists, but noted here for the record.
-- =============================================================

BEGIN;
-- ---------------------------------------------------------------
-- 1. Add tenure columns
-- ---------------------------------------------------------------
ALTER TABLE core.memberships
  ADD COLUMN status      text        NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'suspended', 'revoked', 'expired')),
  ADD COLUMN active_from timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN active_to   timestamptz,
  ADD COLUMN updated_at  timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT memberships_active_window_check
    CHECK (active_to IS NULL OR active_to > active_from);
-- ---------------------------------------------------------------
-- 2. Backfill: existing rows are active from their creation date.
--    See backfill assumption in header comment above.
-- ---------------------------------------------------------------
UPDATE core.memberships
   SET active_from = created_at,
       status      = 'active';
-- ---------------------------------------------------------------
-- 3. Index: matches the exact access path of core.is_member().
--    Predicate: status = 'active' eliminates suspended/revoked/
--    expired rows at index scan time. Columns: (workspace_id,
--    operator_id) align with the WHERE clause order in is_member().
--    active_to window validity cannot be a static partial predicate
--    (it is time-dependent); status = 'active' is the selective
--    static filter that makes the index useful.
-- ---------------------------------------------------------------
CREATE INDEX idx_memberships_workspace_operator_active
  ON core.memberships (workspace_id, operator_id)
  WHERE status = 'active';
-- ---------------------------------------------------------------
-- 4. updated_at trigger (core.set_updated_at added in 0012)
-- ---------------------------------------------------------------
CREATE TRIGGER memberships_set_updated_at
  BEFORE UPDATE ON core.memberships
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
-- ---------------------------------------------------------------
-- 5. Update core.is_member() to enforce tenure.
--    Boundary semantics match header: inclusive lower, exclusive
--    upper. is_member() returning false for status != 'active'
--    means suspended/revoked/expired operators are locked out of
--    all RLS-protected tables without any policy changes.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.is_member(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
      FROM core.memberships
     WHERE operator_id  = core.current_operator_id()
       AND workspace_id = p_workspace_id
       AND status       = 'active'
       AND active_from  <= now()
       AND (active_to IS NULL OR active_to > now())
  );
$$;
COMMIT;
