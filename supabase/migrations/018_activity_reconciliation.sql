-- Session overrides: when actual activity differs from planned
CREATE TABLE IF NOT EXISTS session_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  session_date    date NOT NULL,
  planned_type    text,           -- what was planned: 'run', 'bike', 'gym', 'rest'
  planned_detail  jsonb,          -- { distance_km, duration_min, description }
  actual_type     text NOT NULL,  -- what actually happened
  actual_detail   jsonb NOT NULL, -- { distance_km, duration_min, avg_hr, source: 'strava'|'manual' }
  strava_id       bigint,         -- FK to strava_activities if from Strava
  feedback_tags   text[],         -- ['felt_tired', 'achilles_pain', ...]
  feedback_notes  text,           -- free text
  created_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, session_date)
);

-- AI feedback on completed activities
CREATE TABLE IF NOT EXISTS activity_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  session_date    date NOT NULL,
  activity_type   text NOT NULL,
  feedback_text   text NOT NULL,  -- Gemini's response
  effort_rating   text,           -- 'too_easy', 'right', 'too_hard'
  achilles_flag   boolean DEFAULT false,
  tip             text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, session_date)
);

ALTER TABLE session_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own overrides"
  ON session_overrides FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users manage own feedback"
  ON activity_feedback FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
