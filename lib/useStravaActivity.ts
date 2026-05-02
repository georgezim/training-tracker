'use client';

import { useEffect, useState } from 'react';
import { reconcile, ReconcileResult, PlannedSession, StravaMatch } from './reconcile';

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

export function useStravaActivity(date: string, plannedSession?: PlannedSession | null) {
  const [activity, setActivity] = useState<CachedActivity | null>(null);
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
            const act: CachedActivity = data.activities[0];
            setActivity(act);
            if (plannedSession !== undefined) {
              const stravaMatch: StravaMatch = {
                strava_id: act.strava_id,
                sport_type: act.sport_type,
                distance_km: act.distance_m / 1000,
                moving_time_min: act.moving_time_s / 60,
                avg_heartrate: act.avg_heartrate,
                max_heartrate: act.max_heartrate,
              };
              setReconcileResult(reconcile(plannedSession ?? null, stravaMatch));
            }
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

  return { activity, connected, loading, reconcileResult };
}
