begin;

create unique index if not exists uniq_obligation_terminal_transition
  on core.obligation_transition_events (obligation_id)
  where next_state in ('closed_revenue', 'closed_no_revenue');

comment on index core.uniq_obligation_terminal_transition is
  'Prevents more than one terminal transition row per obligation.';

commit;
