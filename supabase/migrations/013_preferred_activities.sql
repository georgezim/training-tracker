-- Add preferred_activities column to profiles
-- Stores which activity types the user wants in their training plan (e.g. ["run","gym","bike"])

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_activities JSONB DEFAULT '[]'::jsonb;
