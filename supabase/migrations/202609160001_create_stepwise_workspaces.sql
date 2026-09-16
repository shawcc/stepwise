create table if not exists public.stepwise_workspaces (
  id text primary key,
  revision bigint not null check (revision >= 0),
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.stepwise_workspaces enable row level security;

revoke all on table public.stepwise_workspaces from anon, authenticated;
