import { isRunActivity, isRideActivity, isGymActivity } from './strava';

export type ReconcileResult =
  | { status: 'match'; confidence: 'exact' | 'close' }
  | { status: 'mismatch'; reason: 'distance' | 'type' | 'duration' }
  | { status: 'rest_day_activity' }
  | { status: 'no_activity' };

export interface PlannedSession {
  type: 'run' | 'bike' | 'gym' | 'rest';
  distance_km?: number;
  duration_min?: number;
  description: string;
}

export interface StravaMatch {
  strava_id: number;
  sport_type: string;
  distance_km: number;
  moving_time_min: number;
  avg_heartrate?: number;
  max_heartrate?: number;
  avg_pace?: string;
}

export function reconcile(
  planned: PlannedSession | null,
  strava: StravaMatch | null
): ReconcileResult {
  // No Strava activity found
  if (!strava) return { status: 'no_activity' };

  // Activity on a rest day
  if (!planned || planned.type === 'rest') {
    return { status: 'rest_day_activity' };
  }

  // Check type match
  const typeMatches = checkTypeMatch(planned.type, strava.sport_type);
  if (!typeMatches) {
    return { status: 'mismatch', reason: 'type' };
  }

  // Check distance (if applicable — gym sessions don't have meaningful distance)
  if (planned.distance_km && planned.type !== 'gym') {
    const distanceRatio = strava.distance_km / planned.distance_km;
    if (distanceRatio < 0.8 || distanceRatio > 1.2) {
      return { status: 'mismatch', reason: 'distance' };
    }
  }

  // Check duration if no distance target
  if (planned.duration_min && !planned.distance_km) {
    const durationRatio = strava.moving_time_min / planned.duration_min;
    if (durationRatio < 0.7 || durationRatio > 1.3) {
      return { status: 'mismatch', reason: 'duration' };
    }
  }

  // Exact match if distance within 5%, close if within 20%
  if (planned.distance_km) {
    const ratio = strava.distance_km / planned.distance_km;
    return {
      status: 'match',
      confidence: (ratio >= 0.95 && ratio <= 1.05) ? 'exact' : 'close',
    };
  }

  return { status: 'match', confidence: 'close' };
}

function checkTypeMatch(plannedType: string, stravaSport: string): boolean {
  switch (plannedType) {
    case 'run': return isRunActivity(stravaSport);
    case 'bike': return isRideActivity(stravaSport);
    case 'gym': return isGymActivity(stravaSport);
    default: return false;
  }
}
