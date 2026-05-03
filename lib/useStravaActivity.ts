'use client';

import { useEffect, useState } from 'react';
import { reconcile, ReconcileResult, PlannedSession, StravaMatch } from './reconcile';

export interface CachedActivity {
  strava_id: number;
  activity_date: string;
  start_time?: string | null;
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

export function useStravaActivity(date: string, plannedSession?: PlannedSession | null) {
  const [activities, setActivities] = useState<CachedActivity[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);

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
            const sorted = [...data.activities].sort((a, b) => b.distance_m - a.distance_m);
            setActivities(sorted);
            const primary = sorted[0];
            const stravaMatch: StravaMatch = {
              strava_id: primary.strava_id,
              sport_type: primary.sport_type,
              distance_km: primary.distance_m / 1000,
              moving_time_min: primary.moving_time_s / 60,
              avg_heartrate: primary.avg_heartrate,
              max_heartrate: primary.max_heartrate,
            };
            setReconcileResult(reconcile(plannedSession ?? null, stravaMatch));
          } else if (plannedSession !== undefined) {
            setReconcileResult(reconcile(plannedSession ?? null, null));
          }
        }
      } catch {
        setConnected(false);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [date, plannedSession]);

  return { activities, activity: activities[0] ?? null, connected, loading, reconcileResult };
}
