-- FIX: Migration 001 created "Allow all" policies that override restrictive ones.
-- RLS is OR-based, so ANY permissive policy grants access. Drop them all and recreate.

-- Drop ALL existing policies on all user-data tables
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename IN ('daily_checkins', 'completed_sessions', 'strava_tokens', 'strava_activities', 'profiles')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- Ensure RLS is enabled on all tables
ALTER TABLE daily_checkins     ENABLE ROW LEVEL SECURITY;
ALTER TABLE completed_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE strava_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE strava_activities  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;

-- Recreate ONLY user-scoped policies
CREATE POLICY "users_own_checkins" ON daily_checkins
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_sessions" ON completed_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_strava_tokens" ON strava_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_strava_activities" ON strava_activities
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_profile" ON profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
