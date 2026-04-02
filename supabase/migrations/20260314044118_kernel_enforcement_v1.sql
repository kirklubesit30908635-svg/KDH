-- =====================================================
-- Upgrade RPCs to emit ledger events + receipts
-- =====================================================

-- ---------------------------------------------
-- acknowledge_object
-- ---------------------------------------------

create or replace function api.acknowledge_object(
    p_workspace_id uuid,
    p_kernel_class text,
    p_economic_posture text,
    p_actor_class text,
    p_actor_id text,
    p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
    v_object_id uuid;
    v_event_id bigint;
begin

    if not exists (
        select 1
        from core.object_class_postures
        where kernel_class = p_kernel_class
        and economic_posture = p_economic_posture
    ) then
        raise exception 'invalid kernel_class/economic_posture';
    end if;

    insert into core.objects(
        workspace_id,
        kernel_class,
        economic_posture,
        acknowledged_by_actor_class,
        acknowledged_by_actor_id,
        metadata
    )
    values (
        p_workspace_id,
        p_kernel_class,
        p_economic_posture,
        p_actor_class,
        p_actor_id,
        p_metadata
    )
    returning id into v_object_id;

    insert into ledger.events(
        workspace_id,
        object_id,
        event_type,
        actor_class,
        actor_id,
        payload,
        event_hash
    )
    values (
        p_workspace_id,
        v_object_id,
        'object_acknowledged',
        p_actor_class,
        p_actor_id,
        p_metadata,
        encode(gen_random_bytes(32),'hex')
    )
    returning id into v_event_id;

    return v_object_id;

end;
$$;
-- ---------------------------------------------
-- open_obligation
-- ---------------------------------------------

create or replace function api.open_obligation(
    p_workspace_id uuid,
    p_object_id uuid,
    p_obligation_type text,
    p_actor_class text,
    p_actor_id text,
    p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
    v_obligation_id uuid;
    v_event_id bigint;
begin

    insert into core.obligations(
        workspace_id,
        object_id,
        obligation_type,
        opened_by_actor_class,
        opened_by_actor_id,
        metadata
    )
    values (
        p_workspace_id,
        p_object_id,
        p_obligation_type,
        p_actor_class,
        p_actor_id,
        p_metadata
    )
    returning id into v_obligation_id;

    insert into ledger.events(
        workspace_id,
        object_id,
        obligation_id,
        event_type,
        actor_class,
        actor_id,
        payload,
        event_hash
    )
    values (
        p_workspace_id,
        p_object_id,
        v_obligation_id,
        'obligation_opened',
        p_actor_class,
        p_actor_id,
        p_metadata,
        encode(gen_random_bytes(32),'hex')
    )
    returning id into v_event_id;

    return v_obligation_id;

end;
$$;
-- ---------------------------------------------
-- resolve_obligation
-- ---------------------------------------------

create or replace function api.resolve_obligation(
    p_obligation_id uuid,
    p_terminal_action text,
    p_reason_code text,
    p_actor_class text,
    p_actor_id text,
    p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
as $$
declare
    v_workspace uuid;
    v_object uuid;
    v_event_id bigint;
begin

    select workspace_id, object_id
    into v_workspace, v_object
    from core.obligations
    where id = p_obligation_id;

    update core.obligations
    set
        state = 'resolved',
        terminal_action = p_terminal_action,
        terminal_reason_code = p_reason_code,
        resolved_at = now(),
        resolved_by_actor_class = p_actor_class,
        resolved_by_actor_id = p_actor_id,
        metadata = coalesce(metadata,'{}'::jsonb) || p_metadata
    where id = p_obligation_id;

    insert into ledger.events(
        workspace_id,
        object_id,
        obligation_id,
        event_type,
        actor_class,
        actor_id,
        payload,
        event_hash
    )
    values (
        v_workspace,
        v_object,
        p_obligation_id,
        'obligation_resolved',
        p_actor_class,
        p_actor_id,
        p_metadata,
        encode(gen_random_bytes(32),'hex')
    )
    returning id into v_event_id;

    insert into ledger.receipts(
        workspace_id,
        object_id,
        obligation_id,
        event_id,
        receipt_type,
        actor_class,
        actor_id,
        reason_code,
        receipt_payload,
        receipt_hash
    )
    values (
        v_workspace,
        v_object,
        p_obligation_id,
        v_event_id,
        'obligation_resolution',
        p_actor_class,
        p_actor_id,
        p_reason_code,
        p_metadata,
        encode(gen_random_bytes(32),'hex')
    );

end;
$$;
-- =====================================================
-- Lock core tables from direct mutation
-- =====================================================

revoke insert, update, delete on core.objects from authenticated;
revoke insert, update, delete on core.obligations from authenticated;
