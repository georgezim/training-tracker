// ─── Strava API helpers ───────────────────────────────────────────────────────

export interface StravaActivity {
  id: number;
  name: string;
  sport_type: string;        // 'Run', 'Ride', 'WeightTraining', etc.
  start_date_local: string;  // ISO 8601 local time
  distance: number;          // metres
  moving_time: number;       // seconds
  elapsed_time: number;      // seconds
  total_elevation_gain: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_speed: number;     // m/s
}

export interface StravaToken {
  athlete_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix timestamp seconds
}

export function metersToKm(m: number): string {
  return (m / 1000).toFixed(2);
}

export function secondsToDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function mpsToMinPerKm(mps: number): string {
  if (!mps || mps === 0) return '—';
  const secPerKm = 1000 / mps;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')} /km`;
}

export function stravaActivityDate(activity: StravaActivity): string {
  // start_date_local is like "2026-04-14T07:30:00Z" — just take the date part
  return activity.start_date_local.slice(0, 10);
}

export function isRunActivity(sport_type: string): boolean {
  return ['Run', 'TrailRun', 'VirtualRun', 'Treadmill'].includes(sport_type);
}

export function isRideActivity(sport_type: string): boolean {
  return ['Ride', 'VirtualRide', 'EBikeRide', 'Velomobile'].includes(sport_type);
}

export function isGymActivity(sport_type: string): boolean {
  return ['WeightTraining', 'Workout', 'CrossFit', 'Crossfit'].includes(sport_type);
}
