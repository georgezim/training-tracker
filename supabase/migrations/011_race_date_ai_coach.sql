-- Add race_date column to profiles for race-relative plan generation
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS race_date DATE;

-- Add AI coach columns to daily_checkins for persistence (no more localStorage)
ALTER TABLE daily_checkins ADD COLUMN IF NOT EXISTS ai_coach_title TEXT;
ALTER TABLE daily_checkins ADD COLUMN IF NOT EXISTS ai_coach_description TEXT;
