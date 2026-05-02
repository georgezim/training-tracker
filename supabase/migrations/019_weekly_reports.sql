CREATE TABLE IF NOT EXISTS weekly_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  week_start      date NOT NULL,    -- Monday of the week
  week_end        date NOT NULL,    -- Sunday
  report_data     jsonb NOT NULL,   -- full Gemini response
  generated_at    timestamptz DEFAULT now(),
  dismissed       boolean DEFAULT false,
  UNIQUE (user_id, week_start)
);

ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own reports"
  ON weekly_reports FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
