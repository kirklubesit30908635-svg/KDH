-- =============================================================
-- signals_runtime.sql
-- signals schema: detector catalogue, bindings, runs, and
-- signal instance lifecycle.
--
-- FK corrections vs. input DDL:
--   core.workspaces(workspace_id)       → core.workspaces(id)
--   registry.event_types(event_type_id) → registry.event_types(id)  [serial/int]
--   ledger.events(event_id)             → ledger.events(id)
--   ledger.receipts(receipt_id)         → ledger.receipts(id)
--
-- Requires:
--   btree_gist  — EXCLUDE USING GIST on detector_bindings
--   pg_jsonschema (already added in governance_rule_sets migration)
-- =============================================================

begin;
-- btree_gist is needed for the no-overlap exclusion constraint.
create extension if not exists btree_gist with schema extensions;
-- signals schema was reserved in 0010_schema_reserve.sql.
create schema if not exists signals;
-- ---------------------------------------------------------------
-- signals.detector_candidate
-- Composite type returned by every SQL-function detector.
-- ---------------------------------------------------------------
create type signals.detector_candidate as (
  dedupe_key             text,
  fingerprint            text,
  subject_type           text,
  subject_id             text,
  object_type            text,
  object_id              text,
  title                  text,
  summary                text,
  severity               text,
  priority               integer,
  policy_state           text,
  economic_impact_minor  bigint,
  currency_code          text,
  first_event_at         timestamptz,
  last_event_at          timestamptz,
  payload                jsonb,
  evidence               jsonb
);
-- ---------------------------------------------------------------
-- signals.signal_types
-- Catalogue of machine-detectable condition families.
-- ---------------------------------------------------------------
create table signals.signal_types (
  signal_type_id   uuid        primary key default gen_random_uuid(),
  code             text        not null unique,
  name             text        not null,
  description      text        not null,
  category         text        not null,
  default_severity text        not null check (default_severity in ('low', 'medium', 'high', 'critical')),
  default_priority integer     not null default 50 check (default_priority between 0 and 100),
  subject_type     text        not null,
  object_type      text,
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now()
);
comment on table signals.signal_types is
'Catalogue of signal families. Each type declares what kind of subject/object pair the detector addresses and its default severity.';
-- ---------------------------------------------------------------
-- signals.detectors
-- One row per runnable detector. implementation_ref points to a
-- SQL function that returns SETOF signals.detector_candidate.
-- ---------------------------------------------------------------
create table signals.detectors (
  detector_id         uuid         primary key default gen_random_uuid(),
  code                text         not null unique,
  signal_type_id      uuid         not null references signals.signal_types(signal_type_id),
  rule_set_id         uuid         not null references governance.rule_sets(rule_set_id),
  name                text         not null,
  description         text         not null,
  evaluation_mode     text         not null check (evaluation_mode in ('event_driven', 'scheduled', 'hybrid')),
  detection_grain     text         not null check (detection_grain in ('event', 'job', 'invoice', 'customer', 'asset', 'workspace')),
  implementation_kind text         not null default 'sql_function' check (implementation_kind = 'sql_function'),
  implementation_ref  regprocedure not null,
  override_schema     json         not null default '{"type":"object","additionalProperties":false}',
  is_active           boolean      not null default true,
  created_at          timestamptz  not null default now(),
  retired_at          timestamptz,
  check (extensions.jsonschema_is_valid(override_schema))
);
comment on table signals.detectors is
'Detector catalogue. Each row names a SQL function (implementation_ref) that returns SETOF signals.detector_candidate given a binding context.';
-- ---------------------------------------------------------------
-- signals.detector_event_types
-- Declares which event types trigger an event-driven detector.
-- event_type_id is integer (serial PK on registry.event_types).
-- ---------------------------------------------------------------
create table signals.detector_event_types (
  detector_event_type_id uuid        primary key default gen_random_uuid(),
  detector_id            uuid        not null references signals.detectors(detector_id) on delete cascade,
  event_type_id          integer     not null references registry.event_types(id),
  created_at             timestamptz not null default now(),
  unique (detector_id, event_type_id)
);
comment on table signals.detector_event_types is
'Maps event-driven detectors to the registry.event_types that should trigger them.';
-- ---------------------------------------------------------------
-- signals.detector_bindings
-- Activates a detector for a workspace under a specific approved
-- rule version. The effective_during generated column enables the
-- no-overlap exclusion constraint.
-- ---------------------------------------------------------------
create table signals.detector_bindings (
  detector_binding_id uuid        primary key default gen_random_uuid(),
  workspace_id        uuid        not null references core.workspaces(id),
  detector_id         uuid        not null references signals.detectors(detector_id),
  rule_version_id     uuid        not null references governance.rule_versions(rule_version_id),
  enabled             boolean     not null default true,
  parameter_overrides jsonb       not null default '{}'::jsonb,
  schedule_profile    jsonb,
  effective_from      timestamptz not null default now(),
  effective_to        timestamptz,
  effective_during    tstzrange   generated always as (
    tstzrange(effective_from, coalesce(effective_to, 'infinity'::timestamptz), '[)')
  ) stored,
  created_at          timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);
comment on table signals.detector_bindings is
'Activates a detector for a workspace under a specific approved rule version. No two active bindings for the same (workspace, detector) may overlap in time.';
alter table signals.detector_bindings
  add constraint detector_bindings_no_overlap
  exclude using gist (
    workspace_id     with =,
    detector_id      with =,
    effective_during with &&
  );
-- ---------------------------------------------------------------
-- signals.runs
-- Execution record for each detector invocation.
-- ---------------------------------------------------------------
create table signals.runs (
  run_id              uuid        primary key default gen_random_uuid(),
  workspace_id        uuid        not null references core.workspaces(id),
  detector_binding_id uuid        not null references signals.detector_bindings(detector_binding_id),
  detector_id         uuid        not null references signals.detectors(detector_id),
  rule_version_id     uuid        not null references governance.rule_versions(rule_version_id),
  run_mode            text        not null check (run_mode in ('event_driven', 'scheduled', 'replay', 'backfill')),
  status              text        not null check (status in ('pending', 'running', 'succeeded', 'failed')),
  idempotency_key     text        not null,
  started_at          timestamptz not null default now(),
  completed_at        timestamptz,
  source_event_id     uuid        references ledger.events(id),
  source_receipt_id   uuid        references ledger.receipts(id),
  evaluation_window   tstzrange,
  input_summary       jsonb       not null default '{}'::jsonb,
  output_summary      jsonb       not null default '{}'::jsonb,
  error_detail        jsonb,
  unique (workspace_id, idempotency_key)
);
comment on table signals.runs is
'Execution log for every detector invocation. Idempotency is workspace-scoped.';
create index idx_runs_workspace_binding_status
  on signals.runs (workspace_id, detector_binding_id, status, started_at desc);
create index idx_runs_detector_started
  on signals.runs (detector_id, started_at desc);
-- ---------------------------------------------------------------
-- signals.signal_instances
-- De-duplicated, lifecycle-managed signal surface.
-- The partial unique index on (workspace_id, dedupe_key) prevents
-- duplicate open signals for the same condition.
-- ---------------------------------------------------------------
create table signals.signal_instances (
  signal_instance_id    uuid        primary key default gen_random_uuid(),
  workspace_id          uuid        not null references core.workspaces(id),
  signal_type_id        uuid        not null references signals.signal_types(signal_type_id),
  detector_binding_id   uuid        not null references signals.detector_bindings(detector_binding_id),
  detector_id           uuid        not null references signals.detectors(detector_id),
  rule_version_id       uuid        not null references governance.rule_versions(rule_version_id),
  opened_by_run_id      uuid        not null references signals.runs(run_id),
  last_seen_run_id      uuid        not null references signals.runs(run_id),
  lifecycle_status      text        not null check (lifecycle_status in ('open', 'acknowledged', 'in_review', 'resolved', 'dismissed', 'superseded')),
  severity              text        not null check (severity in ('low', 'medium', 'high', 'critical')),
  priority              integer     not null default 50 check (priority between 0 and 100),
  subject_type          text        not null,
  subject_id            text        not null,
  object_type           text,
  object_id             text,
  opened_at             timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  first_event_at        timestamptz,
  last_event_at         timestamptz,
  resolved_at           timestamptz,
  dismissed_at          timestamptz,
  superseded_at         timestamptz,
  title                 text        not null,
  summary               text        not null,
  economic_impact_minor bigint,
  currency_code         text,
  policy_state          text        check (policy_state in ('within_tolerance', 'outside_tolerance', 'blocked', 'escalated')),
  dedupe_key            text        not null,
  fingerprint           text        not null,
  payload               jsonb       not null default '{}'::jsonb,
  reaffirmed_count      integer     not null default 0 check (reaffirmed_count >= 0)
);
comment on table signals.signal_instances is
'De-duplicated, lifecycle-managed signal surface. At most one open/acknowledged/in_review instance may exist per (workspace, dedupe_key).';
create unique index signals_signal_instances_active_dedupe_idx
  on signals.signal_instances (workspace_id, dedupe_key)
  where lifecycle_status in ('open', 'acknowledged', 'in_review');
create index idx_signal_instances_workspace_status
  on signals.signal_instances (workspace_id, lifecycle_status, opened_at desc);
create index idx_signal_instances_subject
  on signals.signal_instances (workspace_id, subject_type, subject_id);
-- ---------------------------------------------------------------
-- RLS (open placeholders — tighten with workspace-membership
-- guards once the pattern is standardised across the kernel).
-- ---------------------------------------------------------------
alter table signals.signal_types         enable row level security;
alter table signals.detectors            enable row level security;
alter table signals.detector_event_types enable row level security;
alter table signals.detector_bindings    enable row level security;
alter table signals.runs                 enable row level security;
alter table signals.signal_instances     enable row level security;
create policy signal_types_select          on signals.signal_types         for select using (true);
create policy signal_types_write           on signals.signal_types         for all    using (true) with check (true);
create policy detectors_select             on signals.detectors            for select using (true);
create policy detectors_write              on signals.detectors            for all    using (true) with check (true);
create policy detector_event_types_select  on signals.detector_event_types for select using (true);
create policy detector_event_types_write   on signals.detector_event_types for all    using (true) with check (true);
create policy detector_bindings_select     on signals.detector_bindings    for select using (true);
create policy detector_bindings_write      on signals.detector_bindings    for all    using (true) with check (true);
create policy runs_select                  on signals.runs                 for select using (true);
create policy runs_write                   on signals.runs                 for all    using (true) with check (true);
create policy signal_instances_select      on signals.signal_instances     for select using (true);
create policy signal_instances_write       on signals.signal_instances     for all    using (true) with check (true);
commit;
