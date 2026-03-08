-- =============================================================
-- signals_indexes.sql
-- Additional indexes on signals.runs and signals.signal_instances.
--
-- idx_signal_instances_subject (from signals_runtime) is dropped
-- and recreated under the canonical name used here.
-- =============================================================

begin;

-- signals.runs: workspace + started_at for time-range queries.
create index signals_runs_workspace_started_idx
  on signals.runs (workspace_id, started_at desc);

-- signals.signal_instances: priority-aware queue scan.
create index signals_signal_instances_workspace_status_priority_idx
  on signals.signal_instances (workspace_id, lifecycle_status, priority desc, opened_at desc);

-- Rename the subject index created in signals_runtime to the
-- canonical name. Drop + recreate to keep naming consistent.
drop index if exists idx_signal_instances_subject;

create index signals_signal_instances_subject_idx
  on signals.signal_instances (workspace_id, subject_type, subject_id);

commit;
