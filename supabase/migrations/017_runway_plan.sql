-- supabase/migrations/017_runway_plan.sql
alter table profiles
  add column if not exists runway_plan jsonb;
