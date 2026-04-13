alter table profiles
  add column if not exists goal_other        text,
  add column if not exists days_per_week     integer,
  add column if not exists age               integer,
  add column if not exists current_activity  text,
  add column if not exists equipment         jsonb default '[]'::jsonb,
  add column if not exists injury_notes      text,
  add column if not exists preferred_long_day text;
