-- Sleep tracker preference on profile
alter table profiles
  add column if not exists has_sleep_tracker boolean default false,
  add column if not exists sleep_device      text;   -- 'whoop','garmin','apple_watch','other','none'

-- Sleep hours for users without a tracker
alter table daily_checkins
  add column if not exists sleep_hours numeric;      -- e.g. 7.5
