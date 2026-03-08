-- AutoKirk Intelligence Layer Schema
-- Purpose: embed governed AI inside AutoKirk as an observation, reasoning,
-- proposal-drafting, simulation, and institutional-memory subsystem.
--
-- Doctrine:
-- - AI may observe, interpret, simulate, and propose.
-- - AI may not directly mutate domain reality.
-- - All actionable outputs become governed proposals.
-- - Kernel truth remains sovereign.
--
-- Assumptions:
-- - Existing tenant model already exists.
-- - Existing kernel proposal / approval / receipt system already exists.
-- - Existing operator / auth model already exists.
-- - Existing domain projections already exist per Face.

begin;

create schema if not exists knowledge;

comment on schema knowledge is
'Governed intelligence layer. Read-heavy cognitive subsystem that produces findings, recommendations, simulations, memory patterns, and proposal drafts without direct mutation authority.';

-- =========================================================
-- ENUMS
-- =========================================================

create type knowledge.finding_severity as enum (
  'info',
  'low',
  'medium',
  'high',
  'critical'
);

create type knowledge.finding_status as enum (
  'open',
  'reviewed',
  'proposal_drafted',
  'accepted',
  'dismissed',
  'resolved'
);

create type knowledge.recommendation_status as enum (
  'draft',
  'ready',
  'emitted',
  'rejected',
  'superseded'
);

create type knowledge.simulation_status as enum (
  'draft',
  'completed',
  'superseded',
  'invalid'
);

create type knowledge.memory_pattern_status as enum (
  'active',
  'superseded',
  'invalidated'
);

create type knowledge.agent_mode as enum (
  'observer',
  'advisor',
  'simulation',
  'proposal_author'
);

create type knowledge.evidence_ref_kind as enum (
  'trusted_event',
  'ledger_event',
  'receipt',
  'proposal',
  'approval',
  'projection_row',
  'finding',
  'simulation_run',
  'memory_pattern'
);

create type knowledge.outcome_comparison_status as enum (
  'pending',
  'matched',
  'underperformed',
  'outperformed',
  'inconclusive'
);

-- =========================================================
-- CONFIG / REGISTRY
-- =========================================================

create table if not exists knowledge.agent_registry (
  id bigserial primary key,
  tenant_id uuid not null,
  face_key text not null,
  agent_key text not null,
  display_name text not null,
  mode knowledge.agent_mode not null default 'observer',
  is_enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, face_key, agent_key)
);

comment on table knowledge.agent_registry is
'One row per intelligence agent per tenant and face. Controls enablement and operating mode.';

create table if not exists knowledge.signal_catalog (
  id bigserial primary key,
  signal_key text not null unique,
  face_key text,
  title text not null,
  description text,
  finding_type text not null,
  default_severity knowledge.finding_severity not null default 'medium',
  detector_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table knowledge.signal_catalog is
'Catalog of machine-detectable conditions, anomalies, leakage rules, and strategic signals.';

create table if not exists knowledge.action_catalog_map (
  id bigserial primary key,
  tenant_id uuid not null,
  face_key text not null,
  finding_type text not null,
  action_key text not null,
  priority integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, face_key, finding_type, action_key)
);

comment on table knowledge.action_catalog_map is
'Maps intelligence finding types to governed action keys that AI is allowed to draft as proposals.';

-- =========================================================
-- FINDINGS
-- =========================================================

create table if not exists knowledge.findings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  face_key text not null,
  agent_key text not null,
  signal_key text,
  finding_type text not null,
  subject_type text,
  subject_ref text,
  severity knowledge.finding_severity not null,
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  status knowledge.finding_status not null default 'open',
  title text not null,
  summary text not null,
  rationale text,
  evidence_summary text,
  impact_estimate jsonb not null default '{}'::jsonb,
  risk_if_ignored jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table knowledge.findings is
'Primary intelligence output. A finding is an evidence-backed claim about current reality or likely consequence.';

create index if not exists idx_ak_intelligence_findings_tenant_face_status
  on knowledge.findings (tenant_id, face_key, status, detected_at desc);

create index if not exists idx_ak_intelligence_findings_subject
  on knowledge.findings (tenant_id, subject_type, subject_ref);

create index if not exists idx_ak_intelligence_findings_signal
  on knowledge.findings (signal_key);

create table if not exists knowledge.finding_evidence_refs (
  id bigserial primary key,
  finding_id uuid not null references knowledge.findings(id) on delete cascade,
  ref_kind knowledge.evidence_ref_kind not null,
  ref_id text not null,
  ref_meta jsonb not null default '{}'::jsonb,
  ord integer not null default 100,
  created_at timestamptz not null default now()
);

comment on table knowledge.finding_evidence_refs is
'Explicit evidence links from a finding back to kernel truth, receipts, projections, or earlier intelligence objects.';

create index if not exists idx_ak_intelligence_finding_evidence_refs_finding
  on knowledge.finding_evidence_refs (finding_id, ord);

-- =========================================================
-- RECOMMENDATIONS / PROPOSAL DRAFTS
-- =========================================================

create table if not exists knowledge.recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  face_key text not null,
  agent_key text not null,
  finding_id uuid references knowledge.findings(id) on delete set null,
  action_key text not null,
  subject_type text,
  subject_ref text,
  status knowledge.recommendation_status not null default 'draft',
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  rationale text not null,
  expected_impact jsonb not null default '{}'::jsonb,
  payload_draft jsonb not null,
  doctrine_notes text,
  requires_approval boolean not null default true,
  emitted_proposal_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table knowledge.recommendations is
'Governed action drafts authored by AI. These are not mutations. They are candidate proposals compatible with the kernel action catalog.';

create index if not exists idx_ak_intelligence_recommendations_tenant_face_status
  on knowledge.recommendations (tenant_id, face_key, status, created_at desc);

create index if not exists idx_ak_intelligence_recommendations_finding
  on knowledge.recommendations (finding_id);

create table if not exists knowledge.recommendation_evidence_refs (
  id bigserial primary key,
  recommendation_id uuid not null references knowledge.recommendations(id) on delete cascade,
  ref_kind knowledge.evidence_ref_kind not null,
  ref_id text not null,
  ref_meta jsonb not null default '{}'::jsonb,
  ord integer not null default 100,
  created_at timestamptz not null default now()
);

comment on table knowledge.recommendation_evidence_refs is
'Evidence refs supporting a specific recommendation or proposal draft.';

create table if not exists knowledge.proposal_emission_log (
  id bigserial primary key,
  tenant_id uuid not null,
  recommendation_id uuid not null references knowledge.recommendations(id) on delete cascade,
  emitted_proposal_id text not null,
  emitted_by text not null default 'ak_intelligence',
  emission_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (recommendation_id, emitted_proposal_id)
);

comment on table knowledge.proposal_emission_log is
'Immutable log linking recommendation drafts to actual proposals emitted into the kernel path.';

-- =========================================================
-- SIMULATIONS
-- =========================================================

create table if not exists knowledge.simulation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  face_key text not null,
  agent_key text not null,
  model_key text not null,
  status knowledge.simulation_status not null default 'completed',
  title text not null,
  summary text,
  subject_type text,
  subject_ref text,
  inputs jsonb not null,
  assumptions jsonb not null default '{}'::jsonb,
  outputs jsonb not null,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_by_actor_type text not null default 'ai',
  created_by_actor_ref text,
  created_at timestamptz not null default now()
);

comment on table knowledge.simulation_runs is
'Counterfactual or forecast outputs generated from kernel truth plus projections. Used to estimate outcomes before approval.';

create index if not exists idx_ak_intelligence_simulation_runs_tenant_face_model
  on knowledge.simulation_runs (tenant_id, face_key, model_key, created_at desc);

create table if not exists knowledge.simulation_evidence_refs (
  id bigserial primary key,
  simulation_run_id uuid not null references knowledge.simulation_runs(id) on delete cascade,
  ref_kind knowledge.evidence_ref_kind not null,
  ref_id text not null,
  ref_meta jsonb not null default '{}'::jsonb,
  ord integer not null default 100,
  created_at timestamptz not null default now()
);

comment on table knowledge.simulation_evidence_refs is
'Evidence refs used as support or input provenance for a simulation run.';

-- =========================================================
-- INSTITUTIONAL MEMORY
-- =========================================================

create table if not exists knowledge.memory_patterns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  face_key text,
  pattern_key text not null,
  status knowledge.memory_pattern_status not null default 'active',
  title text not null,
  summary text not null,
  doctrine_relevance text,
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  support_count integer not null default 0,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, face_key, pattern_key)
);

comment on table knowledge.memory_patterns is
'Longer-lived institutional memory objects distilled from repeated findings, receipts, failures, and outcomes.';

create table if not exists knowledge.memory_pattern_support_refs (
  id bigserial primary key,
  memory_pattern_id uuid not null references knowledge.memory_patterns(id) on delete cascade,
  ref_kind knowledge.evidence_ref_kind not null,
  ref_id text not null,
  ref_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table knowledge.memory_pattern_support_refs is
'Backing refs proving why a memory pattern exists.';

-- =========================================================
-- EXPECTED VS ACTUAL LEARNING LOOP
-- =========================================================

create table if not exists knowledge.outcome_comparisons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  face_key text not null,
  finding_id uuid references knowledge.findings(id) on delete set null,
  recommendation_id uuid references knowledge.recommendations(id) on delete set null,
  simulation_run_id uuid references knowledge.simulation_runs(id) on delete set null,
  proposal_id text,
  receipt_id text,
  status knowledge.outcome_comparison_status not null default 'pending',
  expected jsonb not null default '{}'::jsonb,
  actual jsonb not null default '{}'::jsonb,
  delta jsonb not null default '{}'::jsonb,
  analysis_summary text,
  compared_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table knowledge.outcome_comparisons is
'Compares AI expected impact against actual receipt-backed outcomes. This is the core learning loop.';

create index if not exists idx_ak_intelligence_outcome_comparisons_tenant_face
  on knowledge.outcome_comparisons (tenant_id, face_key, created_at desc);

-- =========================================================
-- OPERATOR INTERACTION / REVIEW TRAIL
-- =========================================================

create table if not exists knowledge.review_actions (
  id bigserial primary key,
  tenant_id uuid not null,
  actor_id uuid,
  actor_role text,
  target_kind text not null,
  target_id text not null,
  action text not null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table knowledge.review_actions is
'Human interaction trail for findings, recommendations, simulations, and memory objects. Records review, dismissal, approval intent, and operational handling.';

create index if not exists idx_ak_intelligence_review_actions_target
  on knowledge.review_actions (tenant_id, target_kind, target_id, created_at desc);

-- =========================================================
-- FOUNDER / CROSS-FACE AGGREGATION
-- =========================================================

create table if not exists knowledge.founder_briefs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  brief_type text not null,
  title text not null,
  summary text not null,
  body_md text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table knowledge.founder_briefs is
'Cross-face strategic summaries for the Founder Control Plane, generated from findings, comparisons, and memory patterns.';

create table if not exists knowledge.founder_brief_refs (
  id bigserial primary key,
  founder_brief_id uuid not null references knowledge.founder_briefs(id) on delete cascade,
  ref_kind knowledge.evidence_ref_kind not null,
  ref_id text not null,
  ref_meta jsonb not null default '{}'::jsonb,
  ord integer not null default 100,
  created_at timestamptz not null default now()
);

comment on table knowledge.founder_brief_refs is
'Evidence links supporting founder-level summaries.';

-- =========================================================
-- VIEWS
-- =========================================================

create or replace view knowledge.v_open_findings as
select
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
from knowledge.findings f
where f.status in ('open', 'reviewed', 'proposal_drafted');

comment on view knowledge.v_open_findings is
'Primary queue of active findings requiring attention.';

create or replace view knowledge.v_ready_recommendations as
select
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
from knowledge.recommendations r
where r.status in ('draft', 'ready');

comment on view knowledge.v_ready_recommendations is
'Recommendations that can be reviewed and emitted into the governed proposal path.';

create or replace view knowledge.v_learning_loop as
select
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
from knowledge.outcome_comparisons oc;

comment on view knowledge.v_learning_loop is
'Expected vs actual outcome loop for improving intelligence quality from receipt-backed reality.';

-- =========================================================
-- TRIGGERS
-- =========================================================

create or replace function knowledge.set_updated_at()
returns trigger
language plpgsql
as $func$
begin
  new.updated_at := now();
  return new;
end;
$func$;

create trigger trg_ak_intelligence_agent_registry_updated_at
before update on knowledge.agent_registry
for each row execute function knowledge.set_updated_at();

create trigger trg_ak_intelligence_findings_updated_at
before update on knowledge.findings
for each row execute function knowledge.set_updated_at();

create trigger trg_ak_intelligence_recommendations_updated_at
before update on knowledge.recommendations
for each row execute function knowledge.set_updated_at();

create trigger trg_ak_intelligence_memory_patterns_updated_at
before update on knowledge.memory_patterns
for each row execute function knowledge.set_updated_at();

-- =========================================================
-- RLS
-- =========================================================

alter table knowledge.agent_registry enable row level security;
alter table knowledge.findings enable row level security;
alter table knowledge.finding_evidence_refs enable row level security;
alter table knowledge.recommendations enable row level security;
alter table knowledge.recommendation_evidence_refs enable row level security;
alter table knowledge.proposal_emission_log enable row level security;
alter table knowledge.simulation_runs enable row level security;
alter table knowledge.simulation_evidence_refs enable row level security;
alter table knowledge.memory_patterns enable row level security;
alter table knowledge.memory_pattern_support_refs enable row level security;
alter table knowledge.outcome_comparisons enable row level security;
alter table knowledge.review_actions enable row level security;
alter table knowledge.founder_briefs enable row level security;
alter table knowledge.founder_brief_refs enable row level security;

-- Replace auth.uid()/JWT logic with your existing tenant-membership helpers.

create policy ak_intelligence_agent_registry_tenant_select
on knowledge.agent_registry for select using (true);

create policy ak_intelligence_findings_tenant_select
on knowledge.findings for select using (true);

create policy ak_intelligence_findings_tenant_write
on knowledge.findings for all using (true) with check (true);

create policy ak_intelligence_recommendations_tenant_select
on knowledge.recommendations for select using (true);

create policy ak_intelligence_recommendations_tenant_write
on knowledge.recommendations for all using (true) with check (true);

create policy ak_intelligence_simulation_runs_tenant_select
on knowledge.simulation_runs for select using (true);

create policy ak_intelligence_simulation_runs_tenant_write
on knowledge.simulation_runs for all using (true) with check (true);

create policy ak_intelligence_memory_patterns_tenant_select
on knowledge.memory_patterns for select using (true);

create policy ak_intelligence_memory_patterns_tenant_write
on knowledge.memory_patterns for all using (true) with check (true);

create policy ak_intelligence_outcome_comparisons_tenant_select
on knowledge.outcome_comparisons for select using (true);

create policy ak_intelligence_outcome_comparisons_tenant_write
on knowledge.outcome_comparisons for all using (true) with check (true);

create policy ak_intelligence_review_actions_tenant_select
on knowledge.review_actions for select using (true);

create policy ak_intelligence_review_actions_tenant_write
on knowledge.review_actions for all using (true) with check (true);

create policy ak_intelligence_founder_briefs_tenant_select
on knowledge.founder_briefs for select using (true);

create policy ak_intelligence_founder_briefs_tenant_write
on knowledge.founder_briefs for all using (true) with check (true);

-- =========================================================
-- COMMENTARY / INTENDED FLOWS
-- =========================================================
-- 1. Detector writes finding + evidence refs.
-- 2. Advisor writes recommendation linked to finding.
-- 3. Recommendation emitted into kernel proposal surface.
-- 4. Proposal executes through normal approval/receipt flow.
-- 5. Outcome comparison links expected vs actual.
-- 6. Repeated patterns consolidate into memory_patterns.
-- 7. Founder briefs aggregate cross-face strategic truth.

commit;
