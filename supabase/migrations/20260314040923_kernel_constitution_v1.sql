-- =========================================
-- VOCAB TABLES
-- =========================================

create table if not exists core.object_class_postures (
    kernel_class text not null,
    economic_posture text not null,
    primary key (kernel_class, economic_posture)
);

create table if not exists core.reason_codes (
    code text primary key,
    category text not null,
    is_active boolean not null default true
);

insert into core.reason_codes (code, category) values
('customer_declined','sales'),
('unqualified','sales'),
('duplicate','system'),
('no_response','sales'),
('pricing_rejected','sales'),
('invalid_object','system'),
('external_loss','external'),
('client_routed_elsewhere','external')
on conflict do nothing;

-- =========================================
-- OBJECTS
-- =========================================

create table if not exists core.objects (

    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,

    kernel_class text not null,
    economic_posture text not null,

    status text not null default 'acknowledged',

    acknowledged_at timestamptz not null default now(),

    acknowledged_by_actor_class text not null,
    acknowledged_by_actor_id text not null,

    source_ref text,
    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),

    constraint objects_status_check
        check (status in (
            'acknowledged',
            'under_governance',
            'terminal_resolution_recorded'
        ))
);

-- =========================================
-- OBLIGATIONS
-- =========================================

create table if not exists core.obligations (

    id uuid primary key default gen_random_uuid(),

    workspace_id uuid not null,

    object_id uuid not null
        references core.objects(id),

    obligation_type text not null,

    state text not null default 'open',

    opened_at timestamptz not null default now(),

    opened_by_actor_class text not null,
    opened_by_actor_id text not null,

    resolved_at timestamptz,
    resolved_by_actor_class text,
    resolved_by_actor_id text,

    terminal_action text,
    terminal_reason_code text,

    metadata jsonb not null default '{}'::jsonb,

    constraint obligation_state_check
        check (state in ('open','active','resolved')),

    constraint obligation_terminal_action_check
        check (terminal_action in ('closed','terminated','eliminated') or terminal_action is null)
);

-- =========================================
-- EVENTS LEDGER
-- =========================================

create table if not exists ledger.events (

    id bigserial primary key,

    workspace_id uuid not null,

    object_id uuid references core.objects(id),

    obligation_id uuid references core.obligations(id),

    event_type text not null,

    actor_class text not null,
    actor_id text not null,

    payload jsonb not null,

    occurred_at timestamptz not null default now(),

    prev_event_hash text,
    event_hash text not null unique
);

-- =========================================
-- RECEIPTS LEDGER
-- =========================================

create table if not exists ledger.receipts (

    id uuid primary key default gen_random_uuid(),

    workspace_id uuid not null,

    object_id uuid not null
        references core.objects(id),

    obligation_id uuid
        references core.obligations(id),

    event_id bigint not null
        references ledger.events(id),

    receipt_type text not null,

    actor_class text not null,
    actor_id text not null,

    reason_code text,

    receipt_payload jsonb not null,

    issued_at timestamptz not null default now(),

    prev_receipt_hash text,
    receipt_hash text not null unique
);