// ─────────────────────────────────────────────────────────────────────────────
// Training Plan — 31 weeks to Athens Marathon
// Plan starts: Monday April 14, 2026
// ─────────────────────────────────────────────────────────────────────────────

// Avoid timezone bugs: always use local year/month/day components
export function dateToString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Plan anchor = Monday April 14, 2026 (as local midnight)
function planStart(): Date {
  return new Date(2026, 3, 14); // month is 0-indexed
}

// ─── Phase & Week helpers ─────────────────────────────────────────────────────

export const PHASE_NAMES: Record<number, string> = {
  0: 'Pre-Plan',
  1: 'Phase 1 — Base Building',
  2: 'Phase 2 — 10K Sharpening',
  3: 'Phase 3 — Volume Build',
  4: 'Phase 4 — 30K Prep',
  5: 'Phase 5 — Marathon Specific',
  6: 'Phase 6 — Taper',
};

export function getWeekNumber(date: Date): number {
  const start = planStart();
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffMs = d.getTime() - start.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
}

export function getPhase(week: number): number {
  if (week <= 0) return 0;
  if (week <= 6) return 1;
  if (week <= 10) return 2;
  if (week <= 18) return 3;
  if (week <= 22) return 4;
  if (week <= 28) return 5;
  return 6;
}

// Returns 0 = Mon … 6 = Sun (relative to plan start day)
export function getPlanDayIndex(date: Date): number {
  const start = planStart();
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((d.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return ((diffDays % 7) + 7) % 7;
}

// Returns the Monday that begins the plan-week containing `date`
export function getWeekStart(date: Date): Date {
  const idx = getPlanDayIndex(date);
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - idx);
  return result;
}

// All 7 days (Mon–Sun) of the plan-week that contains `date`
export function getDaysInCurrentWeek(date: Date): Date[] {
  const start = getWeekStart(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

// ─── Race schedule ────────────────────────────────────────────────────────────

export interface Race {
  name: string;
  distance: string;
  emoji: string;
}

export const RACES: Record<string, Race> = {
  '2026-06-23': { name: '10K Race',         distance: '10K',   emoji: '🏅' },
  '2026-09-11': { name: 'Ioannina 30K',     distance: '30K',   emoji: '🏔️' },
  '2026-11-15': { name: 'Athens Marathon',  distance: '42.2K', emoji: '🏆' },
};

export function getNextRace(today: Date): { date: string; race: Race; daysUntil: number } | null {
  const todayStr = dateToString(today);
  for (const [dateStr, race] of Object.entries(RACES).sort()) {
    const d = parseLocalDate(dateStr);
    const t = parseLocalDate(todayStr);
    const diff = Math.floor((d.getTime() - t.getTime()) / (24 * 60 * 60 * 1000));
    if (diff >= 0) return { date: dateStr, race, daysUntil: diff };
  }
  return null;
}

// ─── Workout definitions ──────────────────────────────────────────────────────

export type WorkoutType = 'run' | 'gym' | 'bike' | 'rest' | 'race';

export interface WorkoutInfo {
  type: WorkoutType;
  label: string;
  description: string;
  color: 'blue' | 'purple' | 'orange' | 'gray' | 'red';
}

// Long run distances by week (Saturday)
const LONG_RUN_KM: Record<number, number> = {
  1: 5,   2: 6,   3: 8,   4: 10,  5: 11,  6: 13,   // Phase 1
  7: 14,  8: 16,  9: 18,                             // Phase 2 (W10 = race)
  11: 18, 12: 20, 13: 22, 14: 24, 15: 26,
  16: 28, 17: 26, 18: 28,                            // Phase 3 (W10 race)
  19: 28, 20: 30, 21: 32,                            // Phase 4 (W22 = race)
  23: 30, 24: 32, 25: 34, 26: 35, 27: 32, 28: 30,   // Phase 5
  29: 25, 30: 18,                                    // Phase 6 (W31 = race)
};

// Monday run descriptions by week
const MONDAY_RUN: Record<number, string> = {
  1:  '5km easy — keep it conversational',
  2:  '5km easy',
  3:  '6km easy',
  4:  '6km easy + strides (4×80m)',
  5:  '7km easy + strides',
  6:  '8km easy + strides',
  7:  '6km easy with 4×1 min pickups',
  8:  '7km — 3km warm-up, 2km tempo, 2km cool-down',
  9:  '8km — 2km WU, 4km tempo, 2km CD',
  10: '5km easy (pre-race week)',
  11: '8km — 2km WU, 4km tempo, 2km CD',
  12: '9km — 2km WU, 5km tempo, 2km CD',
  13: '10km — 2km WU, 5km tempo, 3km CD',
  14: '10km — 2km WU, 6km @ MP, 2km CD',
  15: '11km — 2km WU, 7km @ MP, 2km CD',
  16: '12km — 2km WU, 8km @ MP, 2km CD',
  17: '10km — 2km WU, 6km @ MP, 2km CD',
  18: '12km — 2km WU, 8km @ MP, 2km CD',
  19: '12km — 2km WU, 8km @ MP, 2km CD',
  20: '13km — 2km WU, 9km @ MP, 2km CD',
  21: '14km — 2km WU, 10km @ MP, 2km CD',
  22: '8km easy (pre-race week)',
  23: '14km — 2km WU, 10km @ MP, 2km CD',
  24: '15km — 2km WU, 11km @ MP, 2km CD',
  25: '16km — 2km WU, 12km @ MP, 2km CD',
  26: '16km — 2km WU, 12km @ MP, 2km CD',
  27: '14km — 2km WU, 10km @ MP, 2km CD',
  28: '12km — 2km WU, 8km @ MP, 2km CD',
  29: '10km easy — legs should feel fresh',
  30: '8km easy',
  31: '5km easy with 4 race-pace strides (race week!)',
};

const BIKE_DURATION: Record<number, string> = {
  1: '45 min', 2: '45 min', 3: '50 min', 4: '50 min', 5: '55 min', 6: '55 min',
};

function getBikeDuration(week: number): string {
  if (week <= 6) return BIKE_DURATION[week] || '45 min';
  if (week <= 10) return '55 min';
  if (week <= 18) return '60 min';
  if (week <= 22) return '65 min';
  if (week <= 28) return '60 min';
  return '45 min'; // taper
}

export function getWorkoutForDate(date: Date): WorkoutInfo {
  const dateStr = dateToString(date);

  // Race day override
  if (RACES[dateStr]) {
    const race = RACES[dateStr];
    return {
      type: 'race',
      label: `${race.emoji} ${race.name}`,
      description: `RACE DAY — ${race.distance}! You've trained for this. Trust the process, run your race.`,
      color: 'red',
    };
  }

  const week = getWeekNumber(date);
  const phase = getPhase(week);
  const day = getPlanDayIndex(date); // 0=Mon … 6=Sun

  if (week <= 0) {
    return { type: 'rest', label: 'Pre-Plan', description: 'Plan starts Monday April 14, 2026', color: 'gray' };
  }
  if (week > 31) {
    return { type: 'rest', label: 'Post-Marathon', description: '🎉 You did it! Marathon complete. Rest and recover.', color: 'gray' };
  }

  switch (day) {
    case 0: // Monday — Run
      return {
        type: 'run',
        label: 'Run',
        description: MONDAY_RUN[week] || 'Easy run',
        color: 'blue',
      };

    case 1: // Tuesday — Gym
      return {
        type: 'gym',
        label: 'Gym Class',
        description: 'Strength session + eccentric heel drops: 3 × 15 reps each leg (slow down, explode up)',
        color: 'purple',
      };

    case 2: // Wednesday — Bike
      return {
        type: 'bike',
        label: 'Bike',
        description: `${getBikeDuration(week)} easy cycling — Zone 2, fully aerobic`,
        color: 'orange',
      };

    case 3: // Thursday — Gym (+ run from Phase 3+)
      if (phase >= 3) {
        return {
          type: 'gym',
          label: 'Gym + Easy Run',
          description: 'Strength class, then 20-30 min easy run straight after — practice running on tired legs',
          color: 'purple',
        };
      }
      return {
        type: 'gym',
        label: 'Gym Class',
        description: 'Strength session + eccentric heel drops: 3 × 15 reps each leg',
        color: 'purple',
      };

    case 4: // Friday — REST
      return {
        type: 'rest',
        label: 'REST',
        description: 'Complete rest. Legs up, stay hydrated, sleep well — big Saturday ahead.',
        color: 'gray',
      };

    case 5: { // Saturday — Long Run (or race)
      const km = LONG_RUN_KM[week];
      if (!km) {
        return { type: 'rest', label: 'Easy Day', description: 'Light movement or rest', color: 'gray' };
      }
      let desc = `${km}km long run`;
      if (phase === 1) desc += ' — easy conversational pace, HR Zone 2';
      else if (phase === 2) desc += ' — mostly easy, final 2km at marathon pace';
      else if (phase >= 3) desc += ' — includes MP segments. Practice nutrition every 40 min.';
      return {
        type: 'run',
        label: `Long Run — ${km}km`,
        description: desc,
        color: 'blue',
      };
    }

    case 6: // Sunday — REST
      return {
        type: 'rest',
        label: 'REST',
        description: 'Active recovery: easy walk, stretch, foam roll. Eat well.',
        color: 'gray',
      };

    default:
      return { type: 'rest', label: 'REST', description: '', color: 'gray' };
  }
}

// ─── Colour helpers (exported for reuse across pages) ────────────────────────

export const COLOR_BG: Record<string, string> = {
  blue:   'bg-blue-600',
  purple: 'bg-purple-600',
  orange: 'bg-orange-500',
  gray:   'bg-gray-700',
  red:    'bg-red-600',
};

export const COLOR_TEXT: Record<string, string> = {
  blue:   'text-blue-400',
  purple: 'text-purple-400',
  orange: 'text-orange-400',
  gray:   'text-gray-500',
  red:    'text-red-400',
};

export const COLOR_BORDER: Record<string, string> = {
  blue:   'border-blue-500',
  purple: 'border-purple-500',
  orange: 'border-orange-400',
  gray:   'border-gray-600',
  red:    'border-red-500',
};
