create table if not exists core.object\_class\_postures (
kernel\_class text not null,
economic\_posture text not null,
created\_at timestamptz not null default now(),
primary key (kernel\_class, economic\_posture)
);

alter table core.object\_class\_postures enable row level security;

grant select, insert, update, delete on core.object\_class\_postures to service\_role;create table if not exists core.object\_class\_postures (
kernel\_class text not null,
economic\_posture text not null,
created\_at timestamptz not null default now(),
primary key (kernel\_class, economic\_posture)
);

alter table core.object\_class\_postures enable row level security;

grant select, insert, update, delete on core.object\_class\_postures to service\_role;

