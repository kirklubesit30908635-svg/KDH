-- ============================================================
-- CLOSE THE STRIPE EVENT CYCLE (CURRENT KERNEL SCHEMA)
-- Run in Supabase SQL Editor against the live project.
--
-- This snippet is for the current AutoKirk kernel shape:
--   - core.obligations.state / proof_state / receipt_id
--   - append-only ledger.events and ledger.receipts
--   - /api/integrity/stats reads core.v_stripe_first_wedge_integrity_summary
--
-- What this does:
--   1. Audits current proof lag
--   2. Repairs link drift where a receipt already exists
--   3. Backfills ledger event + receipt for true resolved orphans
--   4. Verifies proof lag after repair
--   5. Recreates the route-aligned integrity view
-- ============================================================

begin;

-- ------------------------------------------------------------
-- STEP 0: Ensure the registry entries used by the backfill exist
-- ------------------------------------------------------------

insert into registry.event_types (family, name, description)
values ('obligation', 'obligation.resolved', 'Obligation resolved - terminal action recorded')
on conflict (name) do nothing;

insert into registry.receipt_types (name, description)
values ('obligation_proof', 'Proof of obligation resolution committed to the ledger')
on conflict (name) do nothing;

-- ------------------------------------------------------------
-- STEP 1: Audit current proof lag
-- ------------------------------------------------------------

do $$
declare
  v_total_resolved integer;
  v_total_lag integer;
  v_wedge_resolved integer;
  v_wedge_lag integer;
begin
  select count(*)
    into v_total_resolved
    from core.obligations
   where state = 'resolved';

  select count(*)
    into v_total_lag
    from core.obligations
   where state = 'resolved'
     and (
       receipt_id is null
       or coalesce(proof_state, 'pending') <> 'linked'
     );

  with wedge_obligations as (
    select
      o.id,
      o.state,
      o.proof_state,
      o.receipt_id
    from core.obligations o
    join core.objects obj
      on obj.id = o.object_id
    where o.obligation_type in (
      'operationalize_subscription',
      'record_revenue',
      'recover_payment',
      'respond_to_dispute',
      'process_refund'
    )
      and coalesce(
        nullif(o.metadata ->> 'face', ''),
        nullif(obj.metadata ->> 'face', ''),
        case
          when coalesce(
            nullif(o.metadata ->> 'surface', ''),
            nullif(obj.metadata ->> 'surface', '')
          ) = 'stripe_webhook'
            or coalesce(
              nullif(o.metadata ->> 'stripe_type', ''),
              nullif(obj.metadata ->> 'stripe_type', '')
            ) is not null
          then 'billing'
          else null
        end,
        'unknown'
      ) = 'billing'
  )
  select
    count(*) filter (where state = 'resolved'),
    count(*) filter (
      where state = 'resolved'
        and (
          receipt_id is null
          or coalesce(proof_state, 'pending') <> 'linked'
        )
    )
    into v_wedge_resolved, v_wedge_lag
    from wedge_obligations;

  raise notice 'AUDIT: total resolved obligations = %', v_total_resolved;
  raise notice 'AUDIT: total resolved obligations missing proof = %', v_total_lag;
  raise notice 'AUDIT: billing wedge resolved obligations = %', coalesce(v_wedge_resolved, 0);
  raise notice 'AUDIT: billing wedge proof lag = %', coalesce(v_wedge_lag, 0);
end $$;

-- ------------------------------------------------------------
-- STEP 2: Repair proof linkage drift
-- ------------------------------------------------------------

update core.obligations
   set proof_state = 'linked',
       proof_strength = coalesce(proof_strength, 'kernel_receipt'),
       linked_at = coalesce(linked_at, resolved_at, now()),
       proof_note = null
 where state = 'resolved'
   and receipt_id is not null
   and coalesce(proof_state, 'pending') <> 'linked';

with chain_matches as (
  select
    o.id as obligation_id,
    r.id as receipt_id
  from core.obligations o
  join lateral (
    select lr.id
      from ledger.receipts lr
     where lr.workspace_id = o.workspace_id
       and lr.chain_key = 'obligation:' || o.id::text
     order by lr.seq desc, lr.created_at desc
     limit 1
  ) r on true
  where o.state = 'resolved'
    and o.receipt_id is null
)
update core.obligations o
   set receipt_id = m.receipt_id,
       proof_state = 'linked',
       proof_strength = 'kernel_receipt',
       linked_at = coalesce(o.linked_at, o.resolved_at, now()),
       proof_note = null
  from chain_matches m
 where o.id = m.obligation_id
   and o.receipt_id is null;

-- ------------------------------------------------------------
-- STEP 3: Backfill true orphans
-- Inserts into the canonical obligation chain used by the kernel.
-- ------------------------------------------------------------

do $$
declare
  v_obl record;
  v_event_type_id int;
  v_receipt_type_id int;
  v_event_id uuid;
  v_receipt_id uuid;
  v_idempotency_evt text;
  v_idempotency_rct text;
begin
  select id
    into v_event_type_id
    from registry.event_types
   where name = 'obligation.resolved';

  select id
    into v_receipt_type_id
    from registry.receipt_types
   where name = 'obligation_proof';

  if v_event_type_id is null or v_receipt_type_id is null then
    raise exception 'registry entries for obligation.resolved / obligation_proof are missing';
  end if;

  for v_obl in
    select
      o.id,
      o.workspace_id,
      o.obligation_type,
      o.terminal_action,
      o.resolved_by_actor_class,
      o.resolved_by_actor_id,
      o.resolved_at
    from core.obligations o
    where o.state = 'resolved'
      and o.receipt_id is null
    order by o.resolved_at asc nulls last, o.id
  loop
    v_idempotency_evt := 'obligation.resolved:' || v_obl.id::text;
    v_idempotency_rct := 'obligation.proof:' || v_obl.id::text;

    insert into ledger.events (
      workspace_id,
      chain_key,
      event_type_id,
      payload,
      idempotency_key,
      seq,
      prev_hash,
      hash
    ) values (
      v_obl.workspace_id,
      'obligation:' || v_obl.id::text,
      v_event_type_id,
      jsonb_build_object(
        'obligation_id', v_obl.id,
        'obligation_type', v_obl.obligation_type,
        'terminal_action', v_obl.terminal_action,
        'actor_class', v_obl.resolved_by_actor_class,
        'actor_id', v_obl.resolved_by_actor_id,
        'backfilled', true,
        'backfill_reason', 'close_stripe_event_cycle_current_kernel'
      ),
      v_idempotency_evt,
      0,
      'GENESIS',
      'PENDING'
    )
    returning id into v_event_id;

    if v_event_id is null then
      select id
        into v_event_id
        from ledger.events
       where workspace_id = v_obl.workspace_id
         and idempotency_key = v_idempotency_evt;
    end if;

    continue when v_event_id is null;

    insert into ledger.receipts (
      workspace_id,
      event_id,
      receipt_type_id,
      chain_key,
      payload,
      idempotency_key,
      seq,
      prev_hash,
      hash
    ) values (
      v_obl.workspace_id,
      v_event_id,
      v_receipt_type_id,
      'obligation:' || v_obl.id::text,
      jsonb_build_object(
        'obligation_id', v_obl.id,
        'terminal_action', v_obl.terminal_action,
        'actor_class', v_obl.resolved_by_actor_class,
        'actor_id', v_obl.resolved_by_actor_id,
        'resolved_at', v_obl.resolved_at,
        'backfilled', true,
        'backfill_reason', 'close_stripe_event_cycle_current_kernel'
      ),
      v_idempotency_rct,
      0,
      'GENESIS',
      'PENDING'
    )
    returning id into v_receipt_id;

    if v_receipt_id is null then
      select id
        into v_receipt_id
        from ledger.receipts
       where workspace_id = v_obl.workspace_id
         and idempotency_key = v_idempotency_rct;
    end if;

    continue when v_receipt_id is null;

    update core.obligations
       set receipt_id = v_receipt_id,
           proof_state = 'linked',
           proof_strength = 'kernel_receipt',
           linked_at = coalesce(linked_at, v_obl.resolved_at, now()),
           proof_note = 'Backfilled by close_stripe_event_cycle_current_kernel'
     where id = v_obl.id
       and receipt_id is null;
  end loop;
end $$;

-- One more deterministic link pass in case a receipt already existed
-- on-chain before this snippet ran.
with chain_matches as (
  select
    o.id as obligation_id,
    r.id as receipt_id
  from core.obligations o
  join lateral (
    select lr.id
      from ledger.receipts lr
     where lr.workspace_id = o.workspace_id
       and lr.chain_key = 'obligation:' || o.id::text
     order by lr.seq desc, lr.created_at desc
     limit 1
  ) r on true
  where o.state = 'resolved'
    and (
      o.receipt_id is null
      or coalesce(o.proof_state, 'pending') <> 'linked'
    )
)
update core.obligations o
   set receipt_id = coalesce(o.receipt_id, m.receipt_id),
       proof_state = 'linked',
       proof_strength = coalesce(o.proof_strength, 'kernel_receipt'),
       linked_at = coalesce(o.linked_at, o.resolved_at, now()),
       proof_note = null
  from chain_matches m
 where o.id = m.obligation_id;

-- ------------------------------------------------------------
-- STEP 4: Verify proof lag after repair
-- ------------------------------------------------------------

do $$
declare
  v_total_resolved integer;
  v_total_lag integer;
  v_wedge_resolved integer;
  v_wedge_lag integer;
begin
  select count(*)
    into v_total_resolved
    from core.obligations
   where state = 'resolved';

  select count(*)
    into v_total_lag
    from core.obligations
   where state = 'resolved'
     and (
       receipt_id is null
       or coalesce(proof_state, 'pending') <> 'linked'
     );

  with wedge_obligations as (
    select
      o.id,
      o.state,
      o.proof_state,
      o.receipt_id
    from core.obligations o
    join core.objects obj
      on obj.id = o.object_id
    where o.obligation_type in (
      'operationalize_subscription',
      'record_revenue',
      'recover_payment',
      'respond_to_dispute',
      'process_refund'
    )
      and coalesce(
        nullif(o.metadata ->> 'face', ''),
        nullif(obj.metadata ->> 'face', ''),
        case
          when coalesce(
            nullif(o.metadata ->> 'surface', ''),
            nullif(obj.metadata ->> 'surface', '')
          ) = 'stripe_webhook'
            or coalesce(
              nullif(o.metadata ->> 'stripe_type', ''),
              nullif(obj.metadata ->> 'stripe_type', '')
            ) is not null
          then 'billing'
          else null
        end,
        'unknown'
      ) = 'billing'
  )
  select
    count(*) filter (where state = 'resolved'),
    count(*) filter (
      where state = 'resolved'
        and (
          receipt_id is null
          or coalesce(proof_state, 'pending') <> 'linked'
        )
    )
    into v_wedge_resolved, v_wedge_lag
    from wedge_obligations;

  raise notice 'VERIFY: total resolved obligations = %', v_total_resolved;
  raise notice 'VERIFY: total resolved obligations missing proof = %', v_total_lag;
  raise notice 'VERIFY: billing wedge resolved obligations = %', coalesce(v_wedge_resolved, 0);
  raise notice 'VERIFY: billing wedge proof lag = %', coalesce(v_wedge_lag, 0);

  if coalesce(v_wedge_lag, 0) = 0 then
    raise notice 'OK: billing wedge proof lag is zero';
  else
    raise warning 'WARNING: billing wedge proof lag is still %', v_wedge_lag;
  end if;
end $$;

-- ------------------------------------------------------------
-- STEP 5: Recreate the route-aligned integrity view
-- /api/integrity/stats reads core.v_stripe_first_wedge_integrity_summary
-- ------------------------------------------------------------

create or replace view core.v_stripe_first_wedge_integrity_summary as
with wedge_obligations as (
  select
    o.workspace_id,
    o.id,
    o.state,
    o.opened_at,
    o.resolved_at,
    o.proof_state,
    o.receipt_id
  from core.obligations o
  join core.objects obj
    on obj.id = o.object_id
  where o.obligation_type in (
    'operationalize_subscription',
    'record_revenue',
    'recover_payment',
    'respond_to_dispute',
    'process_refund'
  )
    and coalesce(
      nullif(o.metadata ->> 'face', ''),
      nullif(obj.metadata ->> 'face', ''),
      case
        when coalesce(
          nullif(o.metadata ->> 'surface', ''),
          nullif(obj.metadata ->> 'surface', '')
        ) = 'stripe_webhook'
          or coalesce(
            nullif(o.metadata ->> 'stripe_type', ''),
            nullif(obj.metadata ->> 'stripe_type', '')
          ) is not null
        then 'billing'
        else null
      end,
      'unknown'
    ) = 'billing'
),
wedge_actions as (
  select
    workspace_id,
    obligation_id,
    is_overdue
  from core.v_operator_next_actions
  where face = 'billing'
    and kind in (
      'operationalize_subscription',
      'record_revenue',
      'recover_payment',
      'respond_to_dispute',
      'process_refund'
    )
),
wedge_receipts as (
  select
    r.workspace_id,
    r.obligation_id,
    r.created_at
  from core.v_recent_receipts r
  join wedge_obligations o
    on o.id::text = r.obligation_id
  where r.face = 'billing'
),
wedge_events as (
  select
    workspace_id,
    stripe_event_id
  from ingest.stripe_events
  where stripe_type in (
    'stripe.checkout.session.completed',
    'stripe.invoice.paid',
    'stripe.invoice.payment_failed',
    'stripe.charge.dispute.created',
    'stripe.charge.refunded'
  )
),
workspace_set as (
  select distinct workspace_id from wedge_obligations
  union
  select distinct workspace_id from wedge_receipts
  union
  select distinct workspace_id from wedge_events
),
obligation_totals as (
  select
    workspace_id,
    count(*) as total_obligations,
    count(*) filter (where state = 'resolved') as sealed_obligations,
    count(*) filter (where state != 'resolved') as open_obligations,
    avg(extract(epoch from (resolved_at - opened_at)) / 3600)
      filter (where state = 'resolved' and resolved_at is not null) as avg_closure_hours,
    count(*) filter (
      where state = 'resolved'
        and (
          receipt_id is null
          or coalesce(proof_state, 'pending') != 'linked'
        )
    ) as proof_lag
  from wedge_obligations
  group by workspace_id
),
overdue_totals as (
  select
    workspace_id,
    count(*) filter (where is_overdue) as overdue_obligations
  from wedge_actions
  group by workspace_id
),
receipt_totals as (
  select
    workspace_id,
    count(distinct obligation_id) as receipted_obligations,
    count(*) filter (where created_at >= now() - interval '7 days') as resolved_7d,
    count(*) filter (where created_at >= now() - interval '30 days') as resolved_30d
  from wedge_receipts
  group by workspace_id
),
stripe_totals as (
  select
    workspace_id,
    count(*) as stripe_events
  from wedge_events
  group by workspace_id
),
joined as (
  select
    w.workspace_id,
    coalesce(o.total_obligations, 0) as total_obligations,
    coalesce(o.sealed_obligations, 0) as sealed_obligations,
    coalesce(o.open_obligations, 0) as open_obligations,
    coalesce(d.overdue_obligations, 0) as overdue_obligations,
    coalesce(r.receipted_obligations, 0) as receipted_obligations,
    coalesce(r.resolved_7d, 0) as resolved_7d,
    coalesce(r.resolved_30d, 0) as resolved_30d,
    coalesce(s.stripe_events, 0) as stripe_events,
    coalesce(o.proof_lag, 0) as proof_lag,
    o.avg_closure_hours
  from workspace_set w
  left join obligation_totals o
    on o.workspace_id = w.workspace_id
  left join overdue_totals d
    on d.workspace_id = w.workspace_id
  left join receipt_totals r
    on r.workspace_id = w.workspace_id
  left join stripe_totals s
    on s.workspace_id = w.workspace_id
)
select
  workspace_id,
  total_obligations,
  sealed_obligations,
  open_obligations,
  overdue_obligations,
  resolved_7d,
  resolved_30d,
  stripe_events,
  least(stripe_events, total_obligations) as covered_events,
  case
    when total_obligations > 0 then round((sealed_obligations::numeric / total_obligations::numeric) * 100)
    else 100
  end::int as closure_rate,
  case
    when open_obligations > 0 then round((overdue_obligations::numeric / open_obligations::numeric) * 100)
    else 0
  end::int as breach_rate,
  case
    when stripe_events > 0 then round((least(stripe_events, total_obligations)::numeric / stripe_events::numeric) * 100)
    else 100
  end::int as event_coverage,
  greatest(stripe_events - total_obligations, 0) as events_awaiting,
  avg_closure_hours,
  case
    when avg_closure_hours is null then 80
    when avg_closure_hours <= 0.25 then 100
    when avg_closure_hours <= 1 then 95
    when avg_closure_hours <= 4 then 88
    when avg_closure_hours <= 12 then 72
    when avg_closure_hours <= 24 then 52
    when avg_closure_hours <= 48 then 32
    else 15
  end::int as latency_score,
  proof_lag,
  case
    when sealed_obligations > 0 then round((1 - proof_lag::numeric / sealed_obligations::numeric) * 100)
    else 100
  end::int as proof_score,
  case
    when total_obligations >= 20 then 'High'
    when total_obligations >= 5 then 'Medium'
    else 'Low'
  end::text as confidence,
  now() as computed_at
from joined;

grant select on core.v_stripe_first_wedge_integrity_summary to authenticated, service_role;

comment on view core.v_stripe_first_wedge_integrity_summary is
  'Stripe first-wedge integrity summary. Counts supported billing-wedge obligations, receipts, and ingress movements including subscription operationalization.';

commit;

-- ------------------------------------------------------------
-- FINAL CHECK
-- ------------------------------------------------------------

select
  workspace_id,
  sealed_obligations,
  proof_lag,
  proof_score,
  event_coverage,
  computed_at
from core.v_stripe_first_wedge_integrity_summary
order by proof_lag desc, workspace_id;
