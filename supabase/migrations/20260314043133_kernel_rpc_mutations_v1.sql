-- =========================================
-- api.acknowledge_object
-- =========================================

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

    return v_object_id;

end;
$$;


-- =========================================
-- api.open_obligation
-- =========================================

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
begin

    if not exists (
        select 1 from core.objects where id = p_object_id
    ) then
        raise exception 'object not found';
    end if;

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

    return v_obligation_id;

end;
$$;


-- =========================================
-- api.resolve_obligation
-- =========================================

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
begin

    update core.obligations
    set
        state = 'resolved',
        terminal_action = p_terminal_action,
        terminal_reason_code = p_reason_code,
        resolved_at = now(),
        resolved_by_actor_class = p_actor_class,
        resolved_by_actor_id = p_actor_id,
        metadata = coalesce(metadata,'{}'::jsonb) || p_metadata
    where id = p_obligation_id
    and state != 'resolved';

end;
$$;