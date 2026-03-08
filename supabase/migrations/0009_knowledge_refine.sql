-- =============================================================
-- 0009_knowledge_refine.sql
-- Consolidate five evidence-ref tables into one, add FTS indexes,
-- convert regular views to materialized views, add proposal status
-- history, and add archival functions.
-- =============================================================

BEGIN;

-- =========================================================
-- 1. Consolidated evidence_refs
-- Replaces: finding_evidence_refs, recommendation_evidence_refs,
--           simulation_evidence_refs, memory_pattern_support_refs,
--           founder_brief_refs
-- Exactly one parent FK must be non-null (enforced by CHECK).
-- =========================================================

CREATE TABLE knowledge.evidence_refs (
  id                bigserial   PRIMARY KEY,
  ref_kind          knowledge.evidence_ref_kind NOT NULL,
  ref_id            text        NOT NULL,
  ref_meta          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ord               integer     NOT NULL DEFAULT 100,
  created_at        timestamptz NOT NULL DEFAULT now(),
  finding_id        uuid        REFERENCES knowledge.findings(id)         ON DELETE CASCADE,
  recommendation_id uuid        REFERENCES knowledge.recommendations(id)  ON DELETE CASCADE,
  simulation_run_id uuid        REFERENCES knowledge.simulation_runs(id)  ON DELETE CASCADE,
  memory_pattern_id uuid        REFERENCES knowledge.memory_patterns(id)  ON DELETE CASCADE,
  founder_brief_id  uuid        REFERENCES knowledge.founder_briefs(id)   ON DELETE CASCADE,
  CONSTRAINT evidence_refs_exactly_one_parent CHECK (
    (finding_id        IS NOT NULL)::int +
    (recommendation_id IS NOT NULL)::int +
    (simulation_run_id IS NOT NULL)::int +
    (memory_pattern_id IS NOT NULL)::int +
    (founder_brief_id  IS NOT NULL)::int = 1
  )
);

CREATE INDEX idx_evidence_refs_finding
  ON knowledge.evidence_refs (finding_id, ord)        WHERE finding_id        IS NOT NULL;
CREATE INDEX idx_evidence_refs_recommendation
  ON knowledge.evidence_refs (recommendation_id, ord) WHERE recommendation_id IS NOT NULL;
CREATE INDEX idx_evidence_refs_simulation
  ON knowledge.evidence_refs (simulation_run_id, ord) WHERE simulation_run_id IS NOT NULL;
CREATE INDEX idx_evidence_refs_memory_pattern
  ON knowledge.evidence_refs (memory_pattern_id, ord) WHERE memory_pattern_id IS NOT NULL;
CREATE INDEX idx_evidence_refs_founder_brief
  ON knowledge.evidence_refs (founder_brief_id, ord)  WHERE founder_brief_id  IS NOT NULL;

ALTER TABLE knowledge.evidence_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY evidence_refs_select ON knowledge.evidence_refs
  FOR SELECT USING (true);
CREATE POLICY evidence_refs_write  ON knowledge.evidence_refs
  FOR ALL USING (true) WITH CHECK (true);

-- Migrate existing rows from each old table.
INSERT INTO knowledge.evidence_refs
  (ref_kind, ref_id, ref_meta, ord, created_at, finding_id)
  SELECT ref_kind, ref_id, ref_meta, ord, created_at, finding_id
    FROM knowledge.finding_evidence_refs;

INSERT INTO knowledge.evidence_refs
  (ref_kind, ref_id, ref_meta, ord, created_at, recommendation_id)
  SELECT ref_kind, ref_id, ref_meta, ord, created_at, recommendation_id
    FROM knowledge.recommendation_evidence_refs;

INSERT INTO knowledge.evidence_refs
  (ref_kind, ref_id, ref_meta, ord, created_at, simulation_run_id)
  SELECT ref_kind, ref_id, ref_meta, ord, created_at, simulation_run_id
    FROM knowledge.simulation_evidence_refs;

INSERT INTO knowledge.evidence_refs
  (ref_kind, ref_id, ref_meta, created_at, memory_pattern_id)
  SELECT ref_kind, ref_id, ref_meta, created_at, memory_pattern_id
    FROM knowledge.memory_pattern_support_refs;

INSERT INTO knowledge.evidence_refs
  (ref_kind, ref_id, ref_meta, ord, created_at, founder_brief_id)
  SELECT ref_kind, ref_id, ref_meta, ord, created_at, founder_brief_id
    FROM knowledge.founder_brief_refs;

DROP TABLE knowledge.finding_evidence_refs;
DROP TABLE knowledge.recommendation_evidence_refs;
DROP TABLE knowledge.simulation_evidence_refs;
DROP TABLE knowledge.memory_pattern_support_refs;
DROP TABLE knowledge.founder_brief_refs;

-- =========================================================
-- 2. Full-text search indexes
-- findings: title + summary
-- recommendations: rationale (no title column exists)
-- =========================================================

CREATE INDEX idx_findings_fts
  ON knowledge.findings
  USING gin(to_tsvector('english', title || ' ' || summary));

CREATE INDEX idx_recommendations_fts
  ON knowledge.recommendations
  USING gin(to_tsvector('english', rationale));

-- =========================================================
-- 3. Materialized views
-- Drop existing regular views first, then recreate as
-- materialized with a unique index to support REFRESH CONCURRENTLY.
-- Callers must REFRESH MATERIALIZED VIEW CONCURRENTLY after writes
-- that affect these views, or on a schedule via pg_cron.
-- =========================================================

DROP VIEW knowledge.v_open_findings;
DROP VIEW knowledge.v_ready_recommendations;
DROP VIEW knowledge.v_learning_loop;

CREATE MATERIALIZED VIEW knowledge.v_open_findings AS
SELECT
  f.id,
  f.tenant_id,
  f.face_key,
  f.agent_key,
  f.signal_key,
  f.finding_type,
  f.subject_type,
  f.subject_ref,
  f.severity,
  f.confidence,
  f.status,
  f.title,
  f.summary,
  f.impact_estimate,
  f.risk_if_ignored,
  f.detected_at
FROM knowledge.findings f
WHERE f.status IN ('open', 'reviewed', 'proposal_drafted');

CREATE UNIQUE INDEX ON knowledge.v_open_findings (id);

CREATE MATERIALIZED VIEW knowledge.v_ready_recommendations AS
SELECT
  r.id,
  r.tenant_id,
  r.face_key,
  r.agent_key,
  r.finding_id,
  r.action_key,
  r.subject_type,
  r.subject_ref,
  r.confidence,
  r.rationale,
  r.expected_impact,
  r.payload_draft,
  r.requires_approval,
  r.created_at
FROM knowledge.recommendations r
WHERE r.status IN ('draft', 'ready');

CREATE UNIQUE INDEX ON knowledge.v_ready_recommendations (id);

CREATE MATERIALIZED VIEW knowledge.v_learning_loop AS
SELECT
  oc.id,
  oc.tenant_id,
  oc.face_key,
  oc.finding_id,
  oc.recommendation_id,
  oc.simulation_run_id,
  oc.proposal_id,
  oc.receipt_id,
  oc.status,
  oc.expected,
  oc.actual,
  oc.delta,
  oc.analysis_summary,
  oc.compared_at,
  oc.created_at
FROM knowledge.outcome_comparisons oc;

CREATE UNIQUE INDEX ON knowledge.v_learning_loop (id);

REFRESH MATERIALIZED VIEW knowledge.v_open_findings;
REFRESH MATERIALIZED VIEW knowledge.v_ready_recommendations;
REFRESH MATERIALIZED VIEW knowledge.v_learning_loop;

-- =========================================================
-- 4. Proposal status history
-- Tracks recommendation status transitions for audit and
-- debugging the governed proposal lifecycle.
-- =========================================================

CREATE TABLE knowledge.proposal_status_history (
  id                bigserial   PRIMARY KEY,
  recommendation_id uuid        NOT NULL REFERENCES knowledge.recommendations(id) ON DELETE CASCADE,
  status            text        NOT NULL,
  changed_at        timestamptz NOT NULL DEFAULT now(),
  changed_by        text
);

CREATE INDEX idx_proposal_status_history_recommendation
  ON knowledge.proposal_status_history (recommendation_id, changed_at DESC);

ALTER TABLE knowledge.proposal_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY proposal_status_history_select ON knowledge.proposal_status_history
  FOR SELECT USING (true);
CREATE POLICY proposal_status_history_write  ON knowledge.proposal_status_history
  FOR ALL USING (true) WITH CHECK (true);

-- =========================================================
-- 5. Archival
-- findings_archive holds findings aged out by the function below.
-- FK constraints are not copied by LIKE (PostgreSQL behaviour);
-- all other column defaults and CHECK constraints are preserved.
-- =========================================================

CREATE TABLE knowledge.findings_archive (
  LIKE knowledge.findings INCLUDING ALL
);

ALTER TABLE knowledge.findings_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY findings_archive_select ON knowledge.findings_archive
  FOR SELECT USING (true);

-- Moves findings in terminal statuses older than one year into
-- findings_archive. Intended for scheduled execution (e.g. pg_cron).
CREATE OR REPLACE FUNCTION knowledge.archive_old_findings()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO knowledge.findings_archive
    SELECT * FROM knowledge.findings
     WHERE status IN ('resolved', 'dismissed')
       AND created_at < now() - INTERVAL '1 year';

  DELETE FROM knowledge.findings
   WHERE status IN ('resolved', 'dismissed')
     AND created_at < now() - INTERVAL '1 year';
END;
$$;

-- Removes memory patterns not seen in over a year.
-- Intended for scheduled execution (e.g. pg_cron).
CREATE OR REPLACE FUNCTION knowledge.cleanup_old_memory_patterns()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM knowledge.memory_patterns
   WHERE last_seen_at < now() - INTERVAL '1 year';
END;
$$;

COMMIT;
