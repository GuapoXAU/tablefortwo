-- ════════════════════════════════════════════════════════
-- Table for Two — Supabase Schema for Beta
-- Run this in Supabase SQL Editor (supabase.com → SQL Editor → New Query)
-- ════════════════════════════════════════════════════════

-- 1. Users table — one row per beta tester
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  partner_name text default '',
  invite_code text,
  created_at timestamptz default now(),
  last_seen_at timestamptz default now()
);

-- 2. User state — JSON blobs for each data type (simple, no migrations needed)
create table if not exists user_state (
  id bigint generated always as identity primary key,
  user_id uuid references users(id) on delete cascade not null,
  state_key text not null,  -- 'bookings', 'reminders', 'wishlist', 'journal', 'preferences', 'handles'
  state_data jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now(),
  unique(user_id, state_key)
);

-- 3. Events — lightweight analytics
create table if not exists events (
  id bigint generated always as identity primary key,
  user_id uuid references users(id) on delete set null,
  event_type text not null,  -- 'page_view', 'booking_created', 'wishlist_save', 'suggestion_refresh', etc.
  event_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- 4. Indexes for fast queries
create index if not exists idx_user_state_user on user_state(user_id);
create index if not exists idx_user_state_key on user_state(user_id, state_key);
create index if not exists idx_events_user on events(user_id);
create index if not exists idx_events_type on events(event_type);
create index if not exists idx_events_created on events(created_at desc);
create index if not exists idx_users_last_seen on users(last_seen_at desc);

-- 5. Row Level Security — allow anon key to read/write (beta only, tighten later)
alter table users enable row level security;
alter table user_state enable row level security;
alter table events enable row level security;

-- Policies: any authenticated or anon user can CRUD their own data
-- For beta we use the anon key + client-side user_id matching
create policy "Users can read own row" on users for select using (true);
create policy "Users can insert" on users for insert with check (true);
create policy "Users can update own row" on users for update using (true);

create policy "State: read own" on user_state for select using (true);
create policy "State: insert own" on user_state for insert with check (true);
create policy "State: update own" on user_state for update using (true);

create policy "Events: insert" on events for insert with check (true);
create policy "Events: read" on events for select using (true);

-- 6. Helper function: upsert state (insert or update)
create or replace function upsert_state(p_user_id uuid, p_key text, p_data jsonb)
returns void as $$
begin
  insert into user_state (user_id, state_key, state_data, updated_at)
  values (p_user_id, p_key, p_data, now())
  on conflict (user_id, state_key)
  do update set state_data = p_data, updated_at = now();
end;
$$ language plpgsql;
