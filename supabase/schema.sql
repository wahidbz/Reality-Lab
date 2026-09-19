-- ===========================================================================
-- REALITY LAB — Supabase schema (MVP 0.1)
-- ===========================================================================
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- It is idempotent-ish: it drops nothing, but uses IF NOT EXISTS where possible
-- so it can be re-run safely during development.
--
-- Design notes
--  * All primary keys are UUIDs (gen_random_uuid from pgcrypto).
--  * Row Level Security is ENABLED on every table; users can only ever touch
--    their own rows. Public (demo/community) simulations are readable by all,
--    but only their owner can write them.
--  * Simulation numbers live in JSON columns produced by the deterministic
--    engine (input_json / result_json / metrics_json). The normalised tables
--    (rounds, events, agents, results) are kept for querying and auditing.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null default 'Explorer',
  email        text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists profiles_user_id_idx on public.profiles (user_id);

-- Automatically create a profile when a new auth user appears.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, 'explorer'), '@', 1)),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. simulations
-- ---------------------------------------------------------------------------
create table if not exists public.simulations (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  name                 text not null,
  description          text not null default '',
  type                 text not null default 'business' check (type in ('business', 'marketing', 'product', 'career', 'city')),
  country              text not null default '',
  city                 text not null default '',
  target_audience      text not null default 'General public',
  currency             text not null default 'EUR',
  budget               numeric not null default 0 check (budget >= 0),
  price                numeric not null default 1 check (price > 0),
  duration_months      integer not null default 12 check (duration_months in (3, 6, 12)),
  status               text not null default 'draft' check (status in ('draft', 'running', 'completed', 'failed')),
  seed                 bigint not null default 1,
  is_public            boolean not null default false,
  parent_simulation_id uuid references public.simulations (id) on delete set null,
  input_json           jsonb not null default '{}'::jsonb,
  result_json          jsonb,
  score                integer check (score is null or (score >= 0 and score <= 100)),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists simulations_user_id_idx on public.simulations (user_id);
create index if not exists simulations_status_idx on public.simulations (status);
create index if not exists simulations_public_idx on public.simulations (is_public) where is_public = true;
create index if not exists simulations_parent_idx on public.simulations (parent_simulation_id);
create index if not exists simulations_updated_idx on public.simulations (updated_at desc);

-- ---------------------------------------------------------------------------
-- 3. simulation_agents
-- ---------------------------------------------------------------------------
create table if not exists public.simulation_agents (
  id              uuid primary key default gen_random_uuid(),
  simulation_id   uuid not null references public.simulations (id) on delete cascade,
  agent_type      text not null check (agent_type in ('customer', 'competitor')),
  attributes_json jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists simulation_agents_sim_idx on public.simulation_agents (simulation_id);
create index if not exists simulation_agents_type_idx on public.simulation_agents (simulation_id, agent_type);

-- ---------------------------------------------------------------------------
-- 4. simulation_rounds
-- ---------------------------------------------------------------------------
create table if not exists public.simulation_rounds (
  id            uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.simulations (id) on delete cascade,
  round_number  integer not null check (round_number > 0),
  metrics_json  jsonb not null default '{}'::jsonb,
  activity_json jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (simulation_id, round_number)
);

create index if not exists simulation_rounds_sim_idx on public.simulation_rounds (simulation_id, round_number);

-- ---------------------------------------------------------------------------
-- 5. simulation_events
-- ---------------------------------------------------------------------------
create table if not exists public.simulation_events (
  id            uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.simulations (id) on delete cascade,
  round_number  integer not null check (round_number > 0),
  event_type    text not null,
  description   text not null default '',
  severity      text not null default 'low' check (severity in ('low', 'medium', 'high')),
  impact_json   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists simulation_events_sim_idx on public.simulation_events (simulation_id, round_number);
create index if not exists simulation_events_type_idx on public.simulation_events (event_type);

-- ---------------------------------------------------------------------------
-- 6. simulation_results
-- ---------------------------------------------------------------------------
create table if not exists public.simulation_results (
  id            uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.simulations (id) on delete cascade,
  score         integer check (score is null or (score >= 0 and score <= 100)),
  metrics_json  jsonb not null default '{}'::jsonb,
  findings_json jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists simulation_results_sim_idx on public.simulation_results (simulation_id);

-- ---------------------------------------------------------------------------
-- 7. scenario_variants  (What-If links)
-- ---------------------------------------------------------------------------
create table if not exists public.scenario_variants (
  id                    uuid primary key default gen_random_uuid(),
  parent_simulation_id  uuid not null references public.simulations (id) on delete cascade,
  variant_simulation_id uuid not null references public.simulations (id) on delete cascade,
  changes_json          jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  unique (parent_simulation_id, variant_simulation_id)
);

create index if not exists scenario_variants_parent_idx on public.scenario_variants (parent_simulation_id);
create index if not exists scenario_variants_variant_idx on public.scenario_variants (variant_simulation_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists simulations_touch on public.simulations;
create trigger simulations_touch
  before update on public.simulations
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ===========================================================================
-- ROW LEVEL SECURITY
-- ===========================================================================
alter table public.profiles           enable row level security;
alter table public.simulations        enable row level security;
alter table public.simulation_agents  enable row level security;
alter table public.simulation_rounds  enable row level security;
alter table public.simulation_events  enable row level security;
alter table public.simulation_results enable row level security;
alter table public.scenario_variants  enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: a user sees and edits only their own profile.
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- simulations: owner CRUD + public read of explicitly public rows.
-- ---------------------------------------------------------------------------
drop policy if exists "simulations_select_own_or_public" on public.simulations;
create policy "simulations_select_own_or_public" on public.simulations
  for select using (auth.uid() = user_id or is_public = true);

drop policy if exists "simulations_insert_own" on public.simulations;
create policy "simulations_insert_own" on public.simulations
  for insert with check (auth.uid() = user_id);

drop policy if exists "simulations_update_own" on public.simulations;
create policy "simulations_update_own" on public.simulations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "simulations_delete_own" on public.simulations;
create policy "simulations_delete_own" on public.simulations
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Child tables: visible if the parent simulation is visible; writable only by
-- the parent's owner. Implemented with an EXISTS check against simulations.
-- ---------------------------------------------------------------------------

-- simulation_agents
drop policy if exists "simulation_agents_select" on public.simulation_agents;
create policy "simulation_agents_select" on public.simulation_agents
  for select using (
    exists (
      select 1 from public.simulations s
      where s.id = simulation_agents.simulation_id
        and (s.user_id = auth.uid() or s.is_public = true)
    )
  );

drop policy if exists "simulation_agents_insert_own" on public.simulation_agents;
create policy "simulation_agents_insert_own" on public.simulation_agents
  for insert with check (
    exists (select 1 from public.simulations s where s.id = simulation_id and s.user_id = auth.uid())
  );

drop policy if exists "simulation_agents_delete_own" on public.simulation_agents;
create policy "simulation_agents_delete_own" on public.simulation_agents
  for delete using (
    exists (select 1 from public.simulations s where s.id = simulation_id and s.user_id = auth.uid())
  );

-- simulation_rounds
drop policy if exists "simulation_rounds_select" on public.simulation_rounds;
create policy "simulation_rounds_select" on public.simulation_rounds
  for select using (
    exists (
      select 1 from public.simulations s
      where s.id = simulation_rounds.simulation_id
        and (s.user_id = auth.uid() or s.is_public = true)
    )
  );

drop policy if exists "simulation_rounds_insert_own" on public.simulation_rounds;
create policy "simulation_rounds_insert_own" on public.simulation_rounds
  for insert with check (
    exists (select 1 from public.simulations s where s.id = simulation_id and s.user_id = auth.uid())
  );

drop policy if exists "simulation_rounds_delete_own" on public.simulation_rounds;
create policy "simulation_rounds_delete_own" on public.simulation_rounds
  for delete using (
    exists (select 1 from public.simulations s where s.id = simulation_id and s.user_id = auth.uid())
  );

-- simulation_events
drop policy if exists "simulation_events_select" on public.simulation_events;
create policy "simulation_events_select" on public.simulation_events
  for select using (
    exists (
      select 1 from public.simulations s
      where s.id = simulation_events.simulation_id
        and (s.user_id = auth.uid() or s.is_public = true)
    )
  );

drop policy if exists "simulation_events_insert_own" on public.simulation_events;
create policy "simulation_events_insert_own" on public.simulation_events
  for insert with check (
    exists (select 1 from public.simulations s where s.id = simulation_id and s.user_id = auth.uid())
  );

drop policy if exists "simulation_events_delete_own" on public.simulation_events;
create policy "simulation_events_delete_own" on public.simulation_events
  for delete using (
    exists (select 1 from public.simulations s where s.id = simulation_id and s.user_id = auth.uid())
  );

-- simulation_results
drop policy if exists "simulation_results_select" on public.simulation_results;
create policy "simulation_results_select" on public.simulation_results
  for select using (
    exists (
      select 1 from public.simulations s
      where s.id = simulation_results.simulation_id
        and (s.user_id = auth.uid() or s.is_public = true)
    )
  );

drop policy if exists "simulation_results_insert_own" on public.simulation_results;
create policy "simulation_results_insert_own" on public.simulation_results
  for insert with check (
    exists (select 1 from public.simulations s where s.id = simulation_id and s.user_id = auth.uid())
  );

-- scenario_variants
drop policy if exists "scenario_variants_select" on public.scenario_variants;
create policy "scenario_variants_select" on public.scenario_variants
  for select using (
    exists (
      select 1 from public.simulations s
      where s.id = scenario_variants.parent_simulation_id
        and (s.user_id = auth.uid() or s.is_public = true)
    )
  );

drop policy if exists "scenario_variants_insert_own" on public.scenario_variants;
create policy "scenario_variants_insert_own" on public.scenario_variants
  for insert with check (
    exists (
      select 1 from public.simulations s
      where s.id = parent_simulation_id and s.user_id = auth.uid()
    )
    and exists (
      select 1 from public.simulations v
      where v.id = variant_simulation_id and v.user_id = auth.uid()
    )
  );

drop policy if exists "scenario_variants_delete_own" on public.scenario_variants;
create policy "scenario_variants_delete_own" on public.scenario_variants
  for delete using (
    exists (
      select 1 from public.simulations s
      where s.id = scenario_variants.parent_simulation_id and s.user_id = auth.uid()
    )
  );

-- ===========================================================================
-- PUBLIC DEMO SEED
-- ===========================================================================
-- The built-in demos are generated client-side by the engine, so no seed rows
-- are required for the demo to work. If you want a *public* record that lives in
-- the database (so it appears on /explore for every visitor), replace
-- <OWNER_UUID> with a real auth.users.id and run:
--
--   insert into public.simulations
--     (user_id, name, description, type, country, city, target_audience, currency,
--      budget, price, duration_months, status, seed, is_public, input_json, score)
--   values
--     ('<OWNER_UUID>', 'Student Coffee Shop — Berlin',
--      'A low-cost coffee shop targeting university students in Berlin.',
--      'business', 'Germany', 'Berlin', 'Students', 'EUR',
--      22000, 2.9, 12, 'completed', 20240501, true, '{}'::jsonb, 58);
--
-- Then load the simulation in the app once to populate result_json.
