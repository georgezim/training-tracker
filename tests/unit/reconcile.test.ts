import { describe, it, expect } from 'vitest';
import { reconcile, type PlannedSession, type StravaMatch } from '../../lib/reconcile';

describe('reconcile', () => {
  // Test 1: reconcile(null, null) → { status: 'no_activity' }
  it('should return no_activity when both planned and strava are null', () => {
    const result = reconcile(null, null);
    expect(result).toEqual({ status: 'no_activity' });
  });

  // Test 2: reconcile(planned, null) → { status: 'no_activity' }
  it('should return no_activity when strava is null', () => {
    const planned: PlannedSession = {
      type: 'run',
      distance_km: 10,
      description: 'Easy run',
    };
    const result = reconcile(planned, null);
    expect(result).toEqual({ status: 'no_activity' });
  });

  // Test 3: reconcile(null, strava) → { status: 'rest_day_activity' }
  it('should return rest_day_activity when planned is null but strava activity exists', () => {
    const strava: StravaMatch = {
      strava_id: 12345,
      sport_type: 'Run',
      distance_km: 10,
      moving_time_min: 60,
    };
    const result = reconcile(null, strava);
    expect(result).toEqual({ status: 'rest_day_activity' });
  });

  // Test 4: reconcile({ type: 'rest', ... }, strava) → { status: 'rest_day_activity' }
  it('should return rest_day_activity when planned type is rest', () => {
    const planned: PlannedSession = {
      type: 'rest',
      description: 'Rest day',
    };
    const strava: StravaMatch = {
      strava_id: 12345,
      sport_type: 'Run',
      distance_km: 10,
      moving_time_min: 60,
    };
    const result = reconcile(planned, strava);
    expect(result).toEqual({ status: 'rest_day_activity' });
  });

  // Test 5: Type mismatch: planned=run, strava sport=Ride
  it('should return type mismatch when planned type does not match strava sport', () => {
    const planned: PlannedSession = {
      type: 'run',
      distance_km: 10,
      description: 'Planned run',
    };
    const strava: StravaMatch = {
      strava_id: 12345,
      sport_type: 'Ride',
      distance_km: 15,
      moving_time_min: 45,
    };
    const result = reconcile(planned, strava);
    expect(result).toEqual({ status: 'mismatch', reason: 'type' });
  });

  // Test 6: Distance within 5%: planned 10km, actual 10.2km
  it('should return exact match when distance is within 5%', () => {
    const planned: PlannedSession = {
      type: 'run',
      distance_km: 10,
      description: 'Planned run',
    };
    const strava: StravaMatch = {
      strava_id: 12345,
      sport_type: 'Run',
      distance_km: 10.2,
      moving_time_min: 60,
    };
    const result = reconcile(planned, strava);
    expect(result).toEqual({ status: 'match', confidence: 'exact' });
  });

  // Test 7: Distance within 20%: planned 10km, actual 11.5km
  it('should return close match when distance is within 20% but outside 5%', () => {
    const planned: PlannedSession = {
      type: 'run',
      distance_km: 10,
      description: 'Planned run',
    };
    const strava: StravaMatch = {
      strava_id: 12345,
      sport_type: 'Run',
      distance_km: 11.5,
      moving_time_min: 70,
    };
    const result = reconcile(planned, strava);
    expect(result).toEqual({ status: 'match', confidence: 'close' });
  });

  // Test 8: Distance >20% off: planned 10km, actual 7km
  it('should return distance mismatch when distance is more than 20% off', () => {
    const planned: PlannedSession = {
      type: 'run',
      distance_km: 10,
      description: 'Planned run',
    };
    const strava: StravaMatch = {
      strava_id: 12345,
      sport_type: 'Run',
      distance_km: 7,
      moving_time_min: 42,
    };
    const result = reconcile(planned, strava);
    expect(result).toEqual({ status: 'mismatch', reason: 'distance' });
  });

  // Test 9: Duration check: no distance, planned 45min, actual 28min
  it('should return duration mismatch when duration is outside acceptable range', () => {
    const planned: PlannedSession = {
      type: 'run',
      duration_min: 45,
      description: 'Planned run by duration',
    };
    const strava: StravaMatch = {
      strava_id: 12345,
      sport_type: 'Run',
      distance_km: 5,
      moving_time_min: 28,
    };
    const result = reconcile(planned, strava);
    expect(result).toEqual({ status: 'mismatch', reason: 'duration' });
  });

  // Test 10: Gym session (no distance): planned=gym, strava=WeightTraining
  it('should return close match for gym session regardless of distance', () => {
    const planned: PlannedSession = {
      type: 'gym',
      duration_min: 60,
      description: 'Strength training',
    };
    const strava: StravaMatch = {
      strava_id: 12345,
      sport_type: 'WeightTraining',
      distance_km: 0,
      moving_time_min: 58,
    };
    const result = reconcile(planned, strava);
    expect(result).toEqual({ status: 'match', confidence: 'close' });
  });

  // Additional edge cases for robustness

  it('should accept bike activities with various sport types', () => {
    const planned: PlannedSession = {
      type: 'bike',
      distance_km: 20,
      description: 'Bike ride',
    };
    const strava: StravaMatch = {
      strava_id: 12345,
      sport_type: 'VirtualRide',
      distance_km: 20.5,
      moving_time_min: 60,
    };
    const result = reconcile(planned, strava);
    expect(result).toEqual({ status: 'match', confidence: 'exact' });
  });

  it('should handle duration-only validation when no distance is set', () => {
    const planned: PlannedSession = {
      type: 'gym',
      duration_min: 50,
      description: 'Workout',
    };
    const strava: StravaMatch = {
      strava_id: 12345,
      sport_type: 'Workout',
      distance_km: 0,
      moving_time_min: 55,
    };
    const result = reconcile(planned, strava);
    expect(result).toEqual({ status: 'match', confidence: 'close' });
  });

  it('should return distance mismatch when actual distance is too high', () => {
    const planned: PlannedSession = {
      type: 'run',
      distance_km: 10,
      description: 'Planned run',
    };
    const strava: StravaMatch = {
      strava_id: 12345,
      sport_type: 'Run',
      distance_km: 12.5,
      moving_time_min: 75,
    };
    const result = reconcile(planned, strava);
    expect(result).toEqual({ status: 'mismatch', reason: 'distance' });
  });

  it('should validate boundary condition: exactly 0.95 ratio', () => {
    const planned: PlannedSession = {
      type: 'run',
      distance_km: 10,
      description: 'Planned run',
    };
    const strava: StravaMatch = {
      strava_id: 12345,
      sport_type: 'Run',
      distance_km: 9.5,
      moving_time_min: 57,
    };
    const result = reconcile(planned, strava);
    expect(result).toEqual({ status: 'match', confidence: 'exact' });
  });

  it('should validate boundary condition: exactly 1.05 ratio', () => {
    const planned: PlannedSession = {
      type: 'run',
      distance_km: 10,
      description: 'Planned run',
    };
    const strava: StravaMatch = {
      strava_id: 12345,
      sport_type: 'Run',
      distance_km: 10.5,
      moving_time_min: 63,
    };
    const result = reconcile(planned, strava);
    expect(result).toEqual({ status: 'match', confidence: 'exact' });
  });

  it('should recognize all run activity types', () => {
    const planned: PlannedSession = {
      type: 'run',
      distance_km: 8,
      description: 'Trail run',
    };
    const strava: StravaMatch = {
      strava_id: 12345,
      sport_type: 'TrailRun',
      distance_km: 8.2,
      moving_time_min: 50,
    };
    const result = reconcile(planned, strava);
    expect(result).toEqual({ status: 'match', confidence: 'exact' });
  });

  it('should recognize all bike activity types', () => {
    const planned: PlannedSession = {
      type: 'bike',
      distance_km: 25,
      description: 'E-bike ride',
    };
    const strava: StravaMatch = {
      strava_id: 12345,
      sport_type: 'EBikeRide',
      distance_km: 25.5,
      moving_time_min: 75,
    };
    const result = reconcile(planned, strava);
    expect(result).toEqual({ status: 'match', confidence: 'exact' });
  });

  it('should recognize all gym activity types', () => {
    const planned: PlannedSession = {
      type: 'gym',
      duration_min: 45,
      description: 'CrossFit',
    };
    const strava: StravaMatch = {
      strava_id: 12345,
      sport_type: 'CrossFit',
      distance_km: 0,
      moving_time_min: 46,
    };
    const result = reconcile(planned, strava);
    expect(result).toEqual({ status: 'match', confidence: 'close' });
  });
});
