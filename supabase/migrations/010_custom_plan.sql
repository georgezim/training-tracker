-- Add custom_plan JSONB column to profiles for Gemini-generated training plans
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_plan JSONB DEFAULT NULL;

-- Comment for clarity
COMMENT ON COLUMN profiles.custom_plan IS 'AI-generated weekly training plan as JSON array of 7 day objects';
