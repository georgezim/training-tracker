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
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Check connection via server route (bypasses RLS)
        const statusRes = await fetch('/api/strava/status');
        const { connected: isConnected } = await statusRes.json();
        setConnected(isConnected);

        if (isConnected) {
          const actRes = await fetch(`/api/strava/activities?date=${date}`);
          const data = await actRes.json();
          if (data.activities?.length > 0) {
            setActivity(data.activities[0]);
          }
        }
      } catch {
        setConnected(false);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [date]);

  return { activity, connected, loading };
}
