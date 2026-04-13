'use client';

import { useEffect, useState } from 'react';

export interface CachedActivity {
  strava_id: number;
  activity_date: string;
  name: string;
  sport_type: string;
  distance_m: number;
  moving_time_s: number;
  elevation_m: number;
  avg_heartrate?: number;
  max_heartrate?: number;
  avg_speed_ms: number;
  strava_url: string;
}

export function useStravaActivity(date: string) {
  const [activity, setActivity] = useState<CachedActivity | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null); // null = loading
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/strava/activities?date=${date}`)
      .then((r) => r.json())
      .then((data) => {
        setConnected(data.connected);
        if (data.activities?.length > 0) {
          // Pick the first run/ride/gym activity for this date
          setActivity(data.activities[0]);
        }
      })
      .catch(() => setConnected(false))
      .finally(() => setLoading(false));
  }, [date]);

  return { activity, connected, loading };
}
