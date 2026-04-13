-- Strava OAuth tokens (single row for personal app)
create table if not exists strava_tokens (
  id           integer primary key default 1,
  athlete_id   bigint not null,
  access_token  text not null,
  refresh_token text not null,
  expires_at   bigint not null,  -- unix timestamp
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- Cached Strava activities (so we don't hit API on every page load)
create table if not exists strava_activities (
  strava_id        bigint primary key,
  activity_date    date not null,
  name             text,
  sport_type       text,
  distance_m       numeric,
  moving_time_s    integer,
  elevation_m      numeric,
  avg_heartrate    numeric,
  max_heartrate    numeric,
  avg_speed_ms     numeric,
  strava_url       text,
  raw              jsonb,
  synced_at        timestamptz default now()
);

create index if not exists strava_activities_date_idx on strava_activities(activity_date desc);
