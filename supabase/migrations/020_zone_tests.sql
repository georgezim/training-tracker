-- Zone test results
CREATE TABLE IF NOT EXISTS zone_tests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  test_type       text NOT NULL CHECK (test_type IN ('maf', 'threshold', 'cooper')),
  test_date       date NOT NULL,
  -- Common fields
  distance_m      numeric,
  duration_s      integer,
  avg_heartrate   numeric,
  max_heartrate   numeric,
  avg_pace_ms     numeric,       -- m/s
  -- Threshold-specific
  lthr            numeric,       -- last 20min avg HR (threshold test)
  -- Cooper-specific
  estimated_vo2max numeric,
  -- Computed zones (from threshold test)
  zones           jsonb,         -- { z1_max, z2_max, z3_max, z4_max, z5_min }
  -- Strava link (if pulled from Strava activity)
  strava_id       bigint,
  notes           text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, test_type, test_date)
);

-- Track when next test is due
CREATE TABLE IF NOT EXISTS zone_test_schedule (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  test_type       text NOT NULL,
  last_test_date  date,
  next_test_date  date NOT NULL,
  interval_weeks  integer NOT NULL DEFAULT 6,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, test_type)
);

ALTER TABLE zone_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE zone_test_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own zone tests"
  ON zone_tests FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users manage own test schedule"
  ON zone_test_schedule FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
