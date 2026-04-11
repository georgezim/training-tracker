-- Training Tracker — Initial Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ─────────────────────────────────────────────
-- Table: daily_checkins
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_checkins (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date           date    UNIQUE NOT NULL,
  whoop_recovery integer CHECK (whoop_recovery >= 0 AND whoop_recovery <= 100),
  sleep_score    integer CHECK (sleep_score >= 0 AND sleep_score <= 100),
  achilles_pain  integer CHECK (achilles_pain >= 0 AND achilles_pain <= 10),
  feeling        text    CHECK (feeling IN ('great', 'good', 'tired', 'bad', 'injured')),
  notes          text,
  created_at     timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────
-- Table: completed_sessions
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS completed_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date         date NOT NULL,
  session_type text NOT NULL CHECK (session_type IN ('run', 'gym', 'bike', 'race')),
  completed    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (date, session_type)
);

-- ─────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────
ALTER TABLE daily_checkins    ENABLE ROW LEVEL SECURITY;
ALTER TABLE completed_sessions ENABLE ROW LEVEL SECURITY;

-- Personal app: allow all operations for anon
CREATE POLICY "Allow all" ON daily_checkins
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all" ON completed_sessions
  FOR ALL USING (true) WITH CHECK (true);
