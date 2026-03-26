-- 0032a_object_class_postures.sql
-- Minimal prerequisite vocabulary for 0033_subscription_obligation_flow.sql

create table if not exists core.object_class_postures (
    kernel_class text not null,
    economic_posture text not null,
    created_at timestamptz not null default now(),
    primary key (kernel_class, economic_posture)
);

alter table core.object_class_postures enable row level security;

drop policy if exists "service_role_all_postures" on core.object_class_postures;
create policy "service_role_all_postures"
on core.object_class_postures
for all
to service_role
using (true)
with check (true);

grant select, insert, update, delete on core.object_class_postures to service_role;

insert into core.object_class_postures (kernel_class, economic_posture) values
    ('subscription', 'direct_revenue')
on conflict do nothing;