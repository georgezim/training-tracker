-- ── Profiles (extends auth.users) ────────────────────────────────────────────
create table if not exists profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  name           text,
  goal           text,          -- 'marathon','half_marathon','get_fit','lose_weight'
  training_level text,          -- 'beginner','intermediate','advanced'
  plan_start     date,
  target_race    date,
  created_at     timestamptz default now()
);

alter table profiles enable row level security;
create policy "users manage own profile"
  on profiles for all using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create profile row on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, name)
  values (new.id, new.raw_user_meta_data->>'name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Add user_id to existing tables ───────────────────────────────────────────
alter table daily_checkins     add column if not exists user_id uuid references auth.users(id);
alter table completed_sessions add column if not exists user_id uuid references auth.users(id);
alter table strava_tokens      add column if not exists user_id uuid references auth.users(id);
alter table strava_activities  add column if not exists user_id uuid references auth.users(id);

-- ── Unique indexes scoped to user ─────────────────────────────────────────────
create unique index if not exists daily_checkins_user_date_idx
  on daily_checkins(user_id, date);
create unique index if not exists completed_sessions_user_date_type_idx
  on completed_sessions(user_id, date, session_type);
create unique index if not exists strava_tokens_user_idx
  on strava_tokens(user_id);

-- ── RLS on all tables ─────────────────────────────────────────────────────────
alter table daily_checkins     enable row level security;
alter table completed_sessions enable row level security;
alter table strava_tokens      enable row level security;
alter table strava_activities  enable row level security;

-- daily_checkins
drop policy if exists "users manage own checkins" on daily_checkins;
create policy "users manage own checkins"
  on daily_checkins for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- completed_sessions
drop policy if exists "users manage own sessions" on completed_sessions;
create policy "users manage own sessions"
  on completed_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- strava_tokens
drop policy if exists "users manage own strava tokens" on strava_tokens;
create policy "users manage own strava tokens"
  on strava_tokens for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- strava_activities
drop policy if exists "users manage own strava activities" on strava_activities;
create policy "users manage own strava activities"
  on strava_activities for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
