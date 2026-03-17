begin;

create or replace view core.v_integrity_summary as
select *
from signals.v_integrity_summary;

grant select on core.v_integrity_summary to authenticated, service_role;

comment on view core.v_integrity_summary is
  'Exposed integrity summary alias for operator-facing reads over the hosted API.';

commit;
