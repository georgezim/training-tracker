-- Add ON DELETE CASCADE to all user_id foreign keys so auth users can be deleted cleanly

-- daily_checkins
ALTER TABLE daily_checkins
  DROP CONSTRAINT IF EXISTS daily_checkins_user_id_fkey;
ALTER TABLE daily_checkins
  ADD CONSTRAINT daily_checkins_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- completed_sessions
ALTER TABLE completed_sessions
  DROP CONSTRAINT IF EXISTS completed_sessions_user_id_fkey;
ALTER TABLE completed_sessions
  ADD CONSTRAINT completed_sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- strava_tokens
ALTER TABLE strava_tokens
  DROP CONSTRAINT IF EXISTS strava_tokens_user_id_fkey;
ALTER TABLE strava_tokens
  ADD CONSTRAINT strava_tokens_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- strava_activities
ALTER TABLE strava_activities
  DROP CONSTRAINT IF EXISTS strava_activities_user_id_fkey;
ALTER TABLE strava_activities
  ADD CONSTRAINT strava_activities_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
