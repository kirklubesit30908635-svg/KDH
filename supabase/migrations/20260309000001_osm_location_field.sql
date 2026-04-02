-- =============================================================
-- 20260309000001_osm_location_field.sql
--
-- Add location tag to obligations and washbay_jobs.
-- Old Salt Marine has 3 locations; location is a free-text field
-- (no enum constraint) so values can be set without migration.
-- =============================================================

BEGIN;
-- Add location to obligations
ALTER TABLE core.obligations
  ADD COLUMN IF NOT EXISTS location text;
-- Add location to washbay_jobs
ALTER TABLE core.washbay_jobs
  ADD COLUMN IF NOT EXISTS location text;
-- Rebuild v_next_actions to include location
CREATE OR REPLACE VIEW core.v_next_actions AS
SELECT
  o.id                                                    AS obligation_id,
  o.title,
  o.why,
  o.face,
  o.severity,
  o.due_at,
  o.created_at,
  EXTRACT(EPOCH FROM (now() - o.created_at)) / 3600      AS age_hours,
  (o.due_at IS NOT NULL AND o.due_at < now())             AS is_breach,
  o.economic_ref_type,
  o.economic_ref_id,
  o.location
FROM core.obligations o
WHERE o.status = 'open';
GRANT SELECT ON core.v_next_actions TO authenticated, service_role;
COMMIT;
