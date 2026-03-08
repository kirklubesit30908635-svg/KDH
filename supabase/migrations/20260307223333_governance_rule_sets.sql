-- =============================================================
-- governance_rule_sets.sql
-- Governance schema: rule_sets catalogue + versioned rule definitions.
--
-- Depends on:
--   pg_jsonschema extension (for extensions.jsonschema_is_valid)
-- =============================================================

begin;

-- pg_jsonschema is available in Supabase and lives in the extensions schema.
create extension if not exists pg_jsonschema with schema extensions;

create schema if not exists governance;

-- ---------------------------------------------------------------
-- governance.rule_sets
-- Catalogue of rule set definitions. Each row declares a named
-- rule set with a domain, a human description, and a JSON Schema
-- that all rule_versions.rule_definition payloads must conform to.
-- ---------------------------------------------------------------
create table governance.rule_sets (
  rule_set_id       uuid        primary key default gen_random_uuid(),
  code              text        not null unique,
  name              text        not null,
  description       text        not null,
  domain            text        not null check (domain in ('signals', 'obligations', 'pricing', 'collections')),
  definition_schema json        not null,
  created_at        timestamptz not null default now(),
  check (extensions.jsonschema_is_valid(definition_schema))
);

comment on table governance.rule_sets is
'Catalogue of named rule sets. Each rule set declares a domain and a JSON Schema that governs the shape of its versioned rule definitions.';

-- ---------------------------------------------------------------
-- governance.rule_versions
-- Append-style versioned definitions for each rule set.
-- rule_hash prevents duplicate content from being promoted as a
-- new version without a real change.
-- ---------------------------------------------------------------
create table governance.rule_versions (
  rule_version_id uuid        primary key default gen_random_uuid(),
  rule_set_id     uuid        not null references governance.rule_sets(rule_set_id),
  version_label   text        not null,
  status          text        not null check (status in ('draft', 'approved', 'retired')),
  rule_definition jsonb       not null,
  rule_hash       text        not null,
  created_at      timestamptz not null default now(),
  approved_at     timestamptz,
  retired_at      timestamptz,
  unique (rule_set_id, version_label),
  unique (rule_set_id, rule_hash)
);

comment on table governance.rule_versions is
'Versioned rule definitions. Each version belongs to a rule_set and carries a content hash to prevent silent re-submission of unchanged rules.';

create index idx_rule_versions_rule_set_status
  on governance.rule_versions (rule_set_id, status, created_at desc);

-- RLS (open placeholders — replace with tenant-membership guards when
-- workspace_id is added to governance tables).
alter table governance.rule_sets     enable row level security;
alter table governance.rule_versions enable row level security;

create policy rule_sets_select     on governance.rule_sets     for select using (true);
create policy rule_sets_write      on governance.rule_sets     for all    using (true) with check (true);
create policy rule_versions_select on governance.rule_versions for select using (true);
create policy rule_versions_write  on governance.rule_versions for all    using (true) with check (true);

commit;
