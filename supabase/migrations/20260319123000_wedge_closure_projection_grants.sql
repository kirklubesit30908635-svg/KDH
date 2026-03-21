begin;

revoke select on core.v_next_actions from authenticated;
revoke select on core.v_receipts from authenticated;
revoke select on signals.v_integrity_summary from authenticated;

comment on view core.v_next_actions is
  'Dead legacy action projection closed by stripe_first_wedge_closure.';

comment on view core.v_receipts is
  'Dead legacy receipt projection closed by stripe_first_wedge_closure.';

comment on view signals.v_integrity_summary is
  'Legacy-readonly signal source retained behind core.v_integrity_summary.';

commit;
