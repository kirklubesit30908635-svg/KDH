-- =============================================================
-- api_run_signal_detector.sql
-- SECURITY DEFINER RPC that invokes a bound detector, persists
-- the run record, and upserts signal instances.
--
-- Detector function convention
-- ----------------------------
-- Every row in signals.detectors.implementation_ref must point to
-- a function with this exact signature:
--
--   signals.detect_<code>(
--     p_detector_binding_id uuid,
--     p_source_event_id     uuid        default null,
--     p_window              tstzrange   default null
--   ) returns setof signals.detector_candidate
--
-- The function is invoked dynamically via the regprocedure stored
-- in detectors.implementation_ref. It must be stable or volatile
-- (not immutable) and must be accessible to the postgres role.
-- =============================================================

begin;

-- ---------------------------------------------------------------
-- api.run_signal_detector
--
-- Flow:
--   1. Load binding; assert workspace membership.
--   2. Guard: binding must be enabled, detector must be active.
--   3. Build workspace-scoped idempotency_key; suppress duplicate
--      runs silently and return the prior run's output.
--   4. Insert signals.runs with status 'running'.
--   5. Dispatch dynamically to implementation_ref($1, $2, $3).
--   6. For each detector_candidate returned:
--        - No existing open signal → INSERT new signal_instance.
--        - Existing open signal     → UPDATE reaffirm fields.
--   7. Mark run 'succeeded' with output_summary.
--   8. On any exception: mark run 'failed' with error_detail, re-raise.
-- ---------------------------------------------------------------
create or replace function api.run_signal_detector(
  p_detector_binding_id uuid,
  p_source_event_id     uuid        default null,
  p_window_start        timestamptz default null,
  p_window_end          timestamptz default null,
  p_run_mode            text        default 'scheduled'
)
returns table (
  run_id           uuid,
  candidates_total integer,
  new_signals      integer,
  reaffirmed       integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_binding          signals.detector_bindings%rowtype;
  v_detector         signals.detectors%rowtype;
  v_window           tstzrange;
  v_idempotency_key  text;
  v_run_id           uuid;
  v_candidate        signals.detector_candidate;
  v_candidates_total integer := 0;
  v_new_signals      integer := 0;
  v_reaffirmed       integer := 0;
  v_existing_id      uuid;
begin
  -- Validate run_mode up front.
  if p_run_mode not in ('event_driven', 'scheduled', 'replay', 'backfill') then
    raise exception 'invalid run_mode: %', p_run_mode
      using errcode = 'invalid_parameter_value';
  end if;

  -- Load binding.
  select * into v_binding
    from signals.detector_bindings
   where detector_binding_id = p_detector_binding_id;

  if not found then
    raise exception 'detector_binding % not found', p_detector_binding_id
      using errcode = 'invalid_parameter_value';
  end if;

  -- Membership guard (raises insufficient_privilege if not a member).
  perform core.assert_member(v_binding.workspace_id);

  if not v_binding.enabled then
    raise exception 'detector_binding % is disabled', p_detector_binding_id
      using errcode = 'invalid_parameter_value';
  end if;

  -- Load detector.
  select * into v_detector
    from signals.detectors
   where detector_id = v_binding.detector_id;

  if not v_detector.is_active then
    raise exception 'detector % (%) is not active', v_detector.code, v_detector.detector_id
      using errcode = 'invalid_parameter_value';
  end if;

  -- Build evaluation window.
  if p_window_start is not null or p_window_end is not null then
    v_window := tstzrange(
      p_window_start,
      coalesce(p_window_end, 'infinity'::timestamptz),
      '[)'
    );
  end if;

  -- Workspace-scoped idempotency key.
  v_idempotency_key :=
    p_detector_binding_id::text || '|' ||
    p_run_mode                  || '|' ||
    coalesce(p_source_event_id::text, '') || '|' ||
    coalesce(v_window::text, '');

  -- Insert run record; suppress duplicate silently.
  insert into signals.runs (
    workspace_id, detector_binding_id, detector_id, rule_version_id,
    run_mode, status, idempotency_key, source_event_id, evaluation_window
  ) values (
    v_binding.workspace_id, p_detector_binding_id, v_binding.detector_id,
    v_binding.rule_version_id, p_run_mode, 'running', v_idempotency_key,
    p_source_event_id, v_window
  )
  on conflict (workspace_id, idempotency_key) do nothing
  returning signals.runs.run_id into v_run_id;

  -- Already ran — return prior output.
  if v_run_id is null then
    return query
      select r.run_id,
             (r.output_summary->>'candidates_total')::integer,
             (r.output_summary->>'new_signals')::integer,
             (r.output_summary->>'reaffirmed')::integer
        from signals.runs r
       where r.workspace_id     = v_binding.workspace_id
         and r.idempotency_key  = v_idempotency_key;
    return;
  end if;

  -- Dispatch to detector function and process candidates.
  begin
    for v_candidate in
      execute format('select * from %s($1, $2, $3)', v_detector.implementation_ref::text)
      using p_detector_binding_id, p_source_event_id, v_window
    loop
      v_candidates_total := v_candidates_total + 1;

      -- Check for an existing live signal with the same dedupe_key.
      select signal_instance_id into v_existing_id
        from signals.signal_instances
       where workspace_id    = v_binding.workspace_id
         and dedupe_key      = v_candidate.dedupe_key
         and lifecycle_status in ('open', 'acknowledged', 'in_review');

      if v_existing_id is null then
        -- New signal instance.
        insert into signals.signal_instances (
          workspace_id, signal_type_id, detector_binding_id, detector_id,
          rule_version_id, opened_by_run_id, last_seen_run_id,
          lifecycle_status, severity, priority,
          subject_type, subject_id, object_type, object_id,
          first_event_at, last_event_at,
          title, summary,
          economic_impact_minor, currency_code, policy_state,
          dedupe_key, fingerprint, payload
        ) values (
          v_binding.workspace_id,
          v_detector.signal_type_id,
          p_detector_binding_id,
          v_binding.detector_id,
          v_binding.rule_version_id,
          v_run_id,
          v_run_id,
          'open',
          coalesce(v_candidate.severity, 'medium'),
          coalesce(v_candidate.priority, 50),
          v_candidate.subject_type,
          v_candidate.subject_id,
          v_candidate.object_type,
          v_candidate.object_id,
          v_candidate.first_event_at,
          v_candidate.last_event_at,
          v_candidate.title,
          v_candidate.summary,
          v_candidate.economic_impact_minor,
          v_candidate.currency_code,
          v_candidate.policy_state,
          v_candidate.dedupe_key,
          v_candidate.fingerprint,
          coalesce(v_candidate.payload, '{}')
        );

        v_new_signals := v_new_signals + 1;

      else
        -- Reaffirm existing signal.
        update signals.signal_instances
           set last_seen_run_id      = v_run_id,
               last_seen_at          = now(),
               last_event_at         = coalesce(v_candidate.last_event_at, last_event_at),
               fingerprint           = v_candidate.fingerprint,
               summary               = v_candidate.summary,
               economic_impact_minor = coalesce(v_candidate.economic_impact_minor, economic_impact_minor),
               policy_state          = coalesce(v_candidate.policy_state, policy_state),
               reaffirmed_count      = reaffirmed_count + 1
         where signal_instance_id = v_existing_id;

        v_reaffirmed := v_reaffirmed + 1;
      end if;
    end loop;

    -- Mark run succeeded.
    update signals.runs
       set status         = 'succeeded',
           completed_at   = now(),
           output_summary = jsonb_build_object(
             'candidates_total', v_candidates_total,
             'new_signals',      v_new_signals,
             'reaffirmed',       v_reaffirmed
           )
     where signals.runs.run_id = v_run_id;

  exception when others then
    -- Mark run failed; preserve error context; re-raise.
    update signals.runs
       set status       = 'failed',
           completed_at = now(),
           error_detail = jsonb_build_object(
             'sqlstate', sqlstate,
             'message',  sqlerrm
           )
     where signals.runs.run_id = v_run_id;
    raise;
  end;

  return query select v_run_id, v_candidates_total, v_new_signals, v_reaffirmed;
end;
$$;

-- Accessible to authenticated operators; membership guard is
-- enforced inside the function via core.assert_member().
grant execute on function api.run_signal_detector(uuid, uuid, timestamptz, timestamptz, text)
  to authenticated;

commit;
