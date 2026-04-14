-- Fix daily_checkins unique constraint to be per-user (not just per date)
-- This allows multiple users to check in on the same date

ALTER TABLE daily_checkins DROP CONSTRAINT IF EXISTS daily_checkins_date_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_checkins_user_date_key'
  ) THEN
    ALTER TABLE daily_checkins ADD CONSTRAINT daily_checkins_user_date_key UNIQUE (user_id, date);
  END IF;
END $$;
