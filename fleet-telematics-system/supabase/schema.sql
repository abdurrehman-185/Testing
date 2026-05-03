create extension if not exists pgcrypto;

create table if not exists public.location_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id text not null,
  latitude double precision not null,
  longitude double precision not null,
  "timestamp" timestamptz not null default now(),
  speed double precision
);

create index if not exists location_logs_vehicle_timestamp_idx
  on public.location_logs (vehicle_id, "timestamp" desc);

-- Development-only public client policies for the hardcoded car_01 demo.
-- For production, replace these with authenticated per-vehicle policies.
alter table public.location_logs enable row level security;

drop policy if exists "demo_insert_car_01_logs" on public.location_logs;
drop policy if exists "demo_insert_shared_tracker_logs" on public.location_logs;
create policy "demo_insert_car_01_logs"
  on public.location_logs
  for insert
  to anon, authenticated
  with check (vehicle_id = 'car_01');

drop policy if exists "demo_select_car_01_logs" on public.location_logs;
drop policy if exists "demo_select_shared_tracker_logs" on public.location_logs;
create policy "demo_select_car_01_logs"
  on public.location_logs
  for select
  to anon, authenticated
  using (vehicle_id = 'car_01');

-- Required for Supabase Realtime Postgres Changes subscriptions.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'location_logs'
  ) then
    alter publication supabase_realtime add table public.location_logs;
  end if;
end $$;
