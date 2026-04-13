-- Fix strava_tokens: remove single-row id=1 primary key, use user_id as PK
-- Run AFTER replacing YOUR-UUID-HERE with your actual user UUID from Supabase Auth

-- Step 1: Move existing data (user_id = NULL) to your account
-- REPLACE THE VALUE BELOW with your UUID from Supabase > Authentication > Users
UPDATE strava_tokens   SET user_id = 'YOUR-UUID-HERE' WHERE user_id IS NULL;
UPDATE strava_activities SET user_id = 'YOUR-UUID-HERE' WHERE user_id IS NULL;
UPDATE daily_checkins    SET user_id = 'YOUR-UUID-HERE' WHERE user_id IS NULL;
UPDATE completed_sessions SET user_id = 'YOUR-UUID-HERE' WHERE user_id IS NULL;

-- Step 2: Fix strava_tokens primary key (drop old id column, promote user_id to PK)
ALTER TABLE strava_tokens DROP CONSTRAINT strava_tokens_pkey;
ALTER TABLE strava_tokens DROP COLUMN id;
-- Drop the unique index added by migration 003 (replacing it with PK)
DROP INDEX IF EXISTS strava_tokens_user_idx;
ALTER TABLE strava_tokens ADD PRIMARY KEY (user_id);
