-- Add plan_adjustment to profiles for adaptive weekly review results
-- Shape: { action: 'maintain'|'increase'|'reduce'|'recovery', reason: string,
--          long_run_km_adjustment: number, multiplier: number, applied_at: timestamptz }
alter table profiles
  add column if not exists plan_adjustment jsonb;
