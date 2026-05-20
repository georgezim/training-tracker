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

export interface ManualInput {
  type: string;          // 'run' | 'bike' | 'gym' | 'swim' | 'other'
  distance_km?: number;
  duration_min?: number;
}

export function reconcile(
  planned: PlannedSession | null,
  activity: StravaMatch | ManualInput | null
): ReconcileResult {
  // No activity recorded
  if (!activity) return { status: 'no_activity' };

  // Activity on a rest day (or no plan)
  if (!planned || planned.type === 'rest') {
    return { status: 'rest_day_activity' };
  }

  // Determine type and metrics from the activity (Strava vs manual)
  const isStrava = 'strava_id' in activity;
  const activitySportType = isStrava
    ? (activity as StravaMatch).sport_type
    : (activity as ManualInput).type;
  const distanceKm = isStrava
    ? (activity as StravaMatch).distance_km
    : (activity as ManualInput).distance_km;
  const durationMin = isStrava
    ? (activity as StravaMatch).moving_time_min
    : (activity as ManualInput).duration_min;

  // Type match
  const typeMatches = checkTypeMatch(planned.type, activitySportType);
  if (!typeMatches) {
    return { status: 'mismatch', reason: 'type' };
  }

  // Distance check (skip for gym sessions)
  if (planned.distance_km && planned.type !== 'gym' && distanceKm != null) {
    const distanceRatio = distanceKm / planned.distance_km;
    if (distanceRatio < 0.8 || distanceRatio > 1.2) {
      return { status: 'mismatch', reason: 'distance' };
    }
  }

  // Duration check (only when no distance target)
  if (planned.duration_min && !planned.distance_km && durationMin != null) {
    const durationRatio = durationMin / planned.duration_min;
    if (durationRatio < 0.7 || durationRatio > 1.3) {
      return { status: 'mismatch', reason: 'duration' };
    }
  }

  // Confidence
  if (planned.distance_km && distanceKm != null) {
    const ratio = distanceKm / planned.distance_km;
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
