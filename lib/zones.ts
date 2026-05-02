export interface ZoneBoundaries {
  z1_max: number;   // < z1_max = Zone 1 (Recovery)
  z2_max: number;   // z1_max–z2_max = Zone 2 (Aerobic)
  z3_max: number;   // z2_max–z3_max = Zone 3 (Tempo)
  z4_max: number;   // z3_max–z4_max = Zone 4 (Threshold)
  z5_min: number;   // >= z5_min = Zone 5 (VO2max)
}

/** Calculate HR zone boundaries from LTHR (lactate threshold HR) */
export function zonesFromLTHR(lthr: number): ZoneBoundaries {
  return {
    z1_max: Math.round(lthr * 0.85),
    z2_max: Math.round(lthr * 0.89),
    z3_max: Math.round(lthr * 0.94),
    z4_max: Math.round(lthr * 0.99),
    z5_min: Math.round(lthr * 1.00),
  };
}

/** Estimate VO2max from Cooper test (12-min run) distance in meters */
export function cooperVO2max(distanceMeters: number): number {
  return parseFloat(((distanceMeters - 504.9) / 44.73).toFixed(1));
}

/** Calculate MAF HR: 180 minus age, adjusted for fitness */
export function mafHR(ageYears: number, trainingLevel: 'beginner' | 'intermediate' | 'advanced'): number {
  const base = 180 - ageYears;
  if (trainingLevel === 'beginner') return base - 5;
  if (trainingLevel === 'advanced') return base + 5;
  return base;
}

/** Get the zone number (1-5) for a given HR given zone boundaries */
export function getZoneForHR(hr: number, zones: ZoneBoundaries): number {
  if (hr < zones.z1_max) return 1;
  if (hr < zones.z2_max) return 2;
  if (hr < zones.z3_max) return 3;
  if (hr < zones.z4_max) return 4;
  return 5;
}
