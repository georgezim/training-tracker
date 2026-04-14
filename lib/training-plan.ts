// ─────────────────────────────────────────────────────────────────────────────
// Training Plan — Race-date-relative, per-user plan generation
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

// ─── Types ───────────────────────────────────────────────────────────────────

export type WorkoutType = 'run' | 'gym' | 'bike' | 'rest' | 'race';

export interface WorkoutInfo {
  type: WorkoutType;
  label: string;
  description: string;
  color: 'blue' | 'purple' | 'orange' | 'gray' | 'red';
}

export interface WorkoutStep {
  icon: string;
  title: string;
  detail: string;
}

export interface WorkoutDetail {
  duration: string;
  intensity: string;
  steps: WorkoutStep[];
  keyPoints: string[];
}

export interface CustomPlanDay {
  day: string;
  type: string;
  label: string;
  description: string;
  color: string;
}

export interface PlanProfile {
  goal: string | null;
  daysPerWeek: number;
  preferredLongDay: string; // 'Mon'...'Sun'
  trainingLevel: string;
  customPlan?: CustomPlanDay[] | null;
  raceDate?: string | null;       // YYYY-MM-DD
  createdAt?: string | null;      // profile created_at for default anchor
}

// ─── Race schedule (from user's profile races, used for display only) ────────

export interface Race {
  name: string;
  distance: string;
  emoji: string;
}

// Kept for backward compat — but real race dates come from profile now
export const RACES: Record<string, Race> = {};

export function getNextRace(): null { return null; }

// ─── Phase system — race-date relative ───────────────────────────────────────

export const PHASE_NAMES: Record<number, string> = {
  0: 'Pre-Plan',
  1: 'Base Building',
  2: 'Build / Volume',
  3: 'Race Specific',
  4: 'Taper',
  5: 'Post-Race',
};

/**
 * Compute the plan start date (Monday) from a race date.
 * Plan starts on the Monday `totalWeeks` weeks before race week.
 */
function computePlanStart(raceDateStr: string, totalWeeks: number): Date {
  const race = parseLocalDate(raceDateStr);
  // Go back totalWeeks * 7 days from race date, then find the Monday of that week
  const planStartMs = race.getTime() - totalWeeks * 7 * 24 * 60 * 60 * 1000;
  const d = new Date(planStartMs);
  // Align to Monday: getDay()=0 is Sun, we want Mon=0
  const jsDay = d.getDay(); // 0=Sun
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  d.setDate(d.getDate() + mondayOffset);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Get default total weeks for a goal type.
 */
function defaultWeeksForGoal(goal: string): number {
  switch (goal) {
    case 'marathon': return 20;
    case 'half_marathon': return 16;
    case '10k': return 10;
    default: return 16;
  }
}

/**
 * Calculate the default race date when user hasn't set one.
 * Uses profile created_at + default weeks for goal.
 */
function getDefaultRaceDate(goal: string, createdAt?: string | null): string {
  const baseDate = createdAt ? new Date(createdAt) : new Date();
  const weeks = defaultWeeksForGoal(goal);
  const raceDate = new Date(baseDate.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
  return dateToString(raceDate);
}

/**
 * Determine phase boundaries from total weeks.
 * Base: 30%, Build/Volume: 40%, Race-specific: 20%, Taper: 10% (min 2, max 4)
 */
function computePhases(totalWeeks: number): { base: number; build: number; specific: number; taper: number } {
  const taperRaw = Math.round(totalWeeks * 0.10);
  const taper = Math.max(2, Math.min(4, taperRaw));
  const remaining = totalWeeks - taper;
  const base = Math.round(remaining * 0.30 / 0.90); // 30% of non-taper
  const specific = Math.round(remaining * 0.20 / 0.90); // 20% of non-taper
  const build = remaining - base - specific;
  return { base, build, specific, taper };
}

export interface RacePlanInfo {
  totalWeeks: number;
  currentWeek: number;
  phase: number;
  phaseName: string;
  planStart: Date;
  raceDate: string;
  hasUserRaceDate: boolean;
}

/**
 * Get race plan info for a user profile and a given date.
 * Returns null if goal is not race-based (get_fit, lose_weight, other).
 */
export function getRacePlanInfo(date: Date, profile?: PlanProfile | null): RacePlanInfo | null {
  if (!profile?.goal) return null;
  const raceGoals = ['marathon', 'half_marathon', '10k'];
  if (!raceGoals.includes(profile.goal)) return null;

  const hasUserRaceDate = !!profile.raceDate;
  const raceDateStr = profile.raceDate || getDefaultRaceDate(profile.goal, profile.createdAt);
  const raceDate = parseLocalDate(raceDateStr);
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  // Total weeks from now to race, minimum 4
  const msToRace = raceDate.getTime() - today.getTime();
  const weeksToRace = Math.max(0, Math.floor(msToRace / (7 * 24 * 60 * 60 * 1000)));

  // Total plan weeks: either computed from creation date or default
  let totalWeeks: number;
  if (hasUserRaceDate && profile.createdAt) {
    const created = new Date(profile.createdAt);
    totalWeeks = Math.max(4, Math.ceil((raceDate.getTime() - created.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  } else {
    totalWeeks = defaultWeeksForGoal(profile.goal);
  }

  const planStart = computePlanStart(raceDateStr, totalWeeks);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffMs = d.getTime() - planStart.getTime();
  const currentWeek = diffMs < 0 ? 0 : Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;

  // Determine phase
  const phases = computePhases(totalWeeks);
  let phase: number;
  if (currentWeek <= 0) phase = 0;
  else if (currentWeek > totalWeeks) phase = 5;
  else if (currentWeek <= phases.base) phase = 1;
  else if (currentWeek <= phases.base + phases.build) phase = 2;
  else if (currentWeek <= phases.base + phases.build + phases.specific) phase = 3;
  else phase = 4;

  return {
    totalWeeks,
    currentWeek,
    phase,
    phaseName: PHASE_NAMES[phase] ?? '',
    planStart,
    raceDate: raceDateStr,
    hasUserRaceDate,
  };
}

// Legacy helpers that now delegate to profile-aware versions
export function getWeekNumber(date: Date, profile?: PlanProfile | null): number {
  const info = getRacePlanInfo(date, profile);
  return info?.currentWeek ?? 0;
}

export function getPhase(week: number, totalWeeks?: number): number {
  if (!totalWeeks || totalWeeks <= 0) return 0;
  if (week <= 0) return 0;
  if (week > totalWeeks) return 5;
  const phases = computePhases(totalWeeks);
  if (week <= phases.base) return 1;
  if (week <= phases.base + phases.build) return 2;
  if (week <= phases.base + phases.build + phases.specific) return 3;
  return 4;
}

// Returns 0 = Mon … 6 = Sun
export function getDayOfWeek(date: Date): number {
  return (date.getDay() + 6) % 7; // 0=Mon
}

// Returns the Monday of the week containing `date`
export function getWeekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayIdx = getDayOfWeek(d);
  d.setDate(d.getDate() - dayIdx);
  return d;
}

// All 7 days (Mon–Sun) of the week containing `date`
export function getDaysInCurrentWeek(date: Date): Date[] {
  const start = getWeekStart(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

// ─── Colour helpers ──────────────────────────────────────────────────────────

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

// Workout type helpers for Strava auto-matching
export function isRunWorkout(type: string) { return type === 'run' || type === 'race'; }
export function isBikeWorkout(type: string) { return type === 'bike'; }
export function isGymWorkout(type: string) { return type === 'gym' || type === 'strength'; }

// ─── Race-relative workout generation ────────────────────────────────────────

/**
 * Generate a phase-appropriate run workout.
 * isLongRun: true → long run logic; false → quality/easy run logic
 */
function getRaceRunWorkout(
  isLongRun: boolean,
  phase: number,
  progress: number,
  goalMultiplier: number,
  goal: string,
): WorkoutInfo {
  if (isLongRun) {
    if (phase === 4) {
      const km = Math.round(12 * goalMultiplier);
      return { type: 'run', label: `Easy Long Run — ${km}km`, description: `${km}km at easy pace. Trust the taper.`, color: 'blue' };
    }
    const baseKm = Math.round(8 * goalMultiplier);
    const maxKm = goal === 'marathon' ? 35 : goal === 'half_marathon' ? 22 : 14;
    const km = Math.round(baseKm + (maxKm - baseKm) * Math.min(1, progress * 1.1));
    let desc = `${km}km long run`;
    if (phase === 1) desc += ' — easy conversational pace, HR Zone 2';
    else if (phase === 2) desc += ' — mostly easy, final 2km at goal pace';
    else desc += ' — includes goal-pace segments. Practice nutrition every 40min.';
    return { type: 'run', label: `Long Run — ${km}km`, description: desc, color: 'blue' };
  } else {
    if (phase === 4) {
      const km = Math.round(5 + 3 * goalMultiplier);
      return { type: 'run', label: `Easy Run — ${km}km`, description: `${km}km easy pace — legs should feel fresh. HR Zone 2.`, color: 'blue' };
    }
    const baseKm = 5;
    const maxKm = Math.round(16 * goalMultiplier);
    const km = Math.round(baseKm + (maxKm - baseKm) * progress);
    if (phase === 1) {
      return { type: 'run', label: `Easy Run — ${km}km`, description: `${km}km easy — conversational pace, HR Zone 2`, color: 'blue' };
    }
    if (phase === 2) {
      const tempoKm = Math.round(km * 0.4);
      const wuKm = Math.round((km - tempoKm) * 0.6);
      const cdKm = km - wuKm - tempoKm;
      return { type: 'run', label: `Tempo Run — ${km}km`, description: `${wuKm}km warm-up, ${tempoKm}km tempo, ${cdKm}km cool-down`, color: 'blue' };
    }
    const mpKm = Math.round(km * 0.5);
    const wuKm = Math.round((km - mpKm) * 0.5);
    const cdKm = km - wuKm - mpKm;
    return { type: 'run', label: `Race Pace Run — ${km}km`, description: `${wuKm}km WU, ${mpKm}km @ goal pace, ${cdKm}km CD`, color: 'blue' };
  }
}

/**
 * Generate a race workout by activity TYPE rather than by day position.
 * Used when a custom plan defines which days have which activity type.
 */
function getRaceWorkoutByType(
  activityType: string,
  isLongSession: boolean,
  phase: number,
  weekInPlan: number,
  totalWeeks: number,
  goal: string,
): WorkoutInfo {
  const progress = Math.min(1, weekInPlan / Math.max(1, totalWeeks));
  const goalMultiplier = goal === 'marathon' ? 1.0 : goal === 'half_marathon' ? 0.65 : 0.45;

  switch (activityType) {
    case 'run':
      return getRaceRunWorkout(isLongSession, phase, progress, goalMultiplier, goal);

    case 'gym':
      if (phase === 4) {
        return isLongSession
          ? { type: 'gym', label: 'Mobility & Core', description: 'Easy mobility work + core. No heavy lifting. 30min.', color: 'purple' }
          : { type: 'gym', label: 'Light Strength', description: 'Light maintenance session — reduced volume. Keep the body moving.', color: 'purple' };
      }
      if (phase >= 3) {
        return { type: 'gym', label: 'Gym — Strength', description: 'Strength session + eccentric heel drops: 3 x 15 each leg. Focus on single-leg stability.', color: 'purple' };
      }
      if (phase >= 2) {
        return { type: 'gym', label: 'Gym + Easy Run', description: 'Strength class, then 20-30min easy run straight after — practice running on tired legs', color: 'purple' };
      }
      return { type: 'gym', label: 'Gym — Strength', description: 'Full body strength — squats, deadlifts, core, upper body. 45-60min', color: 'purple' };

    case 'bike': {
      const baseDur = 40;
      const maxDur = 65;
      const dur = phase === 4 ? 40 : Math.round(baseDur + (maxDur - baseDur) * progress);
      return { type: 'bike', label: 'Bike', description: `${dur}min easy cycling — Zone 2, fully aerobic`, color: 'orange' };
    }

    default:
      return { type: 'rest', label: 'REST', description: 'Complete rest. Legs up, stay hydrated, sleep well.', color: 'gray' };
  }
}

/**
 * Generate a race-training workout for a given day using default day assignments.
 * Day: 0=Mon(run), 1=Tue(gym), 2=Wed(bike), 3=Thu(gym), 4=Fri(rest), 5=Sat(long run), 6=Sun(rest)
 */
function getRaceWorkoutForDay(
  day: number,
  phase: number,
  weekInPlan: number,
  totalWeeks: number,
  goal: string,
  isRaceDay: boolean,
): WorkoutInfo {
  if (isRaceDay) {
    const goalLabel = goal === 'marathon' ? 'Marathon' : goal === 'half_marathon' ? 'Half Marathon' : '10K';
    return {
      type: 'race',
      label: `Race Day — ${goalLabel}`,
      description: `RACE DAY! You've trained for this. Trust the process, run your race.`,
      color: 'red',
    };
  }

  if (phase === 0) {
    return { type: 'rest', label: 'Pre-Plan', description: 'Your training plan hasn\'t started yet. Rest and prepare.', color: 'gray' };
  }
  if (phase === 5) {
    return { type: 'rest', label: 'Post-Race', description: 'You did it! Rest and recover. You\'ve earned it.', color: 'gray' };
  }

  const progress = Math.min(1, weekInPlan / Math.max(1, totalWeeks));
  const goalMultiplier = goal === 'marathon' ? 1.0 : goal === 'half_marathon' ? 0.65 : 0.45;

  switch (day) {
    case 0: // Monday — Quality run
      return getRaceRunWorkout(false, phase, progress, goalMultiplier, goal);

    case 1: // Tuesday — Gym
      return getRaceWorkoutByType('gym', false, phase, weekInPlan, totalWeeks, goal);

    case 2: { // Wednesday — Bike
      return getRaceWorkoutByType('bike', false, phase, weekInPlan, totalWeeks, goal);
    }

    case 3: // Thursday — Gym (with run in later phases)
      if (phase === 4) {
        return { type: 'gym', label: 'Mobility & Core', description: 'Easy mobility work + core. No heavy lifting. 30min.', color: 'purple' };
      }
      if (phase >= 2) {
        return {
          type: 'gym',
          label: 'Gym + Easy Run',
          description: 'Strength class, then 20-30min easy run straight after — practice running on tired legs',
          color: 'purple',
        };
      }
      return { type: 'gym', label: 'Gym — Strength', description: 'Strength session + eccentric heel drops: 3 x 15 each leg', color: 'purple' };

    case 4: // Friday — REST
      return { type: 'rest', label: 'REST', description: 'Complete rest. Legs up, stay hydrated, sleep well.', color: 'gray' };

    case 5: // Saturday — Long Run
      return getRaceRunWorkout(true, phase, progress, goalMultiplier, goal);

    case 6: // Sunday — REST
      return { type: 'rest', label: 'REST', description: 'Active recovery: easy walk, stretch, foam roll. Eat well.', color: 'gray' };

    default:
      return { type: 'rest', label: 'REST', description: '', color: 'gray' };
  }
}

// ─── Perpetual plans (get_fit / lose_weight / other) ─────────────────────────

const REST_DAY: WorkoutInfo = { type: 'rest', label: 'Rest Day', description: 'Recovery — light walk, stretching, or complete rest', color: 'gray' };

const FITNESS_WORKOUTS: WorkoutInfo[] = [
  { type: 'run', label: 'Easy Run', description: '30-40min easy pace, conversational effort', color: 'blue' },
  { type: 'gym', label: 'Strength Training', description: 'Full body circuit — squats, push-ups, rows, lunges. 40-45min', color: 'purple' },
  { type: 'run', label: 'Interval Run', description: '5x3min at moderate pace with 2min walk recoveries', color: 'blue' },
  { type: 'bike', label: 'Cross Training', description: 'Bike, swim, or elliptical. 40min steady effort', color: 'orange' },
  { type: 'gym', label: 'Core & Mobility', description: 'Core circuit + flexibility work. 30min', color: 'purple' },
];

const WEIGHT_LOSS_WORKOUTS: WorkoutInfo[] = [
  { type: 'run', label: 'Cardio Run', description: '30min with 1min fast bursts every 5min', color: 'blue' },
  { type: 'gym', label: 'HIIT Circuit', description: '30min — burpees, jump squats, mountain climbers, rest/repeat', color: 'purple' },
  { type: 'bike', label: 'Steady Cardio', description: '40min bike or swim at moderate effort', color: 'orange' },
  { type: 'gym', label: 'Strength + Core', description: 'Compound lifts + core finisher. 40min', color: 'purple' },
  { type: 'run', label: 'Tempo Walk/Jog', description: '40min alternating brisk walk and easy jog', color: 'blue' },
];

const LONG_SESSIONS: Record<string, WorkoutInfo> = {
  get_fit:     { type: 'run', label: 'Long Run or Hike', description: '50-70min at easy pace — enjoy the outdoors', color: 'blue' },
  lose_weight: { type: 'run', label: 'Long Walk / Easy Jog', description: '60min sustained easy effort — burn calories, build base', color: 'blue' },
  other:       { type: 'run', label: 'Long Session', description: '50-60min easy activity of your choice', color: 'blue' },
};

const DAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function buildWeeklySchedule(profile: PlanProfile): (WorkoutInfo | null)[] {
  const schedule: (WorkoutInfo | null)[] = [null, null, null, null, null, null, null];
  const goal = profile.goal ?? 'get_fit';
  const workouts = goal === 'lose_weight' ? WEIGHT_LOSS_WORKOUTS : FITNESS_WORKOUTS;
  const longSession = LONG_SESSIONS[goal] ?? LONG_SESSIONS['other'];
  const longDayIdx = DAY_INDEX[profile.preferredLongDay] ?? 5;
  const daysPerWeek = Math.min(Math.max(profile.daysPerWeek, 2), 7);

  schedule[longDayIdx] = longSession;
  let placed = 1;

  const available = Array.from({ length: 7 }, (_, i) => i).filter(i => i !== longDayIdx);
  const spacing = Math.max(1, Math.floor(7 / daysPerWeek));
  let workoutIdx = 0;
  for (let i = 0; i < available.length && placed < daysPerWeek; i++) {
    const dayIdx = available[i];
    const prevPlaced = schedule.findIndex((s, j) => j < dayIdx && s !== null);
    const nextPlaced = schedule.findIndex((s, j) => j > dayIdx && s !== null);
    const okSpacing =
      (prevPlaced === -1 || dayIdx - prevPlaced >= spacing - 1) &&
      (nextPlaced === -1 || nextPlaced - dayIdx >= spacing - 1);
    if (okSpacing || placed === daysPerWeek - 1) {
      schedule[dayIdx] = workouts[workoutIdx % workouts.length];
      workoutIdx++;
      placed++;
    }
  }
  for (let i = 0; i < available.length && placed < daysPerWeek; i++) {
    const dayIdx = available[i];
    if (schedule[dayIdx] === null) {
      schedule[dayIdx] = workouts[workoutIdx % workouts.length];
      workoutIdx++;
      placed++;
    }
  }
  return schedule;
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Profile-aware workout: returns the workout for `date` based on user's goal & race date.
 * - Race goals (marathon, half_marathon, 10k): race-date-relative phased plan
 * - Other goals: perpetual rotating weekly template or Gemini custom plan
 * - No profile: returns a generic rest day
 */
export function getWorkoutForDateWithProfile(date: Date, profile?: PlanProfile | null): WorkoutInfo {
  if (!profile || !profile.goal) {
    return REST_DAY;
  }

  const raceGoals = ['marathon', 'half_marathon', '10k'];

  // Race-based goals → race-date-relative phased plan
  if (raceGoals.includes(profile.goal)) {
    const info = getRacePlanInfo(date, profile);
    if (!info) return REST_DAY;

    const day = getDayOfWeek(date);
    const todayStr = dateToString(date);
    const isRaceDay = todayStr === info.raceDate;

    if (isRaceDay) {
      const goalLabel = profile.goal === 'marathon' ? 'Marathon' : profile.goal === 'half_marathon' ? 'Half Marathon' : '10K';
      return { type: 'race', label: `Race Day — ${goalLabel}`, description: `RACE DAY! You've trained for this. Trust the process, run your race.`, color: 'red' };
    }

    if (info.phase === 0) {
      return { type: 'rest', label: 'Pre-Plan', description: "Your training plan hasn't started yet. Rest and prepare.", color: 'gray' };
    }
    if (info.phase === 5) {
      return { type: 'rest', label: 'Post-Race', description: "You did it! Rest and recover. You've earned it.", color: 'gray' };
    }

    // If user has a Gemini-generated custom plan, use its activity structure
    // but apply phase-appropriate descriptions/distances on top
    if (profile.customPlan && Array.isArray(profile.customPlan) && profile.customPlan.length === 7) {
      const customDay = profile.customPlan[day];
      const activityType = customDay?.type ?? 'rest';

      // Identify the long run day from the custom plan (preferred long day)
      const preferredLongDayIdx = DAY_INDEX[profile.preferredLongDay] ?? 5;
      const isLongRunDay = day === preferredLongDayIdx && activityType === 'run';

      return getRaceWorkoutByType(activityType, isLongRunDay, info.phase, info.currentWeek, info.totalWeeks, profile.goal);
    }

    // Fallback: use default day assignments (Mon=run, Tue=gym, Wed=bike, etc.)
    return getRaceWorkoutForDay(day, info.phase, info.currentWeek, info.totalWeeks, profile.goal, isRaceDay);
  }

  // Non-race goals → Gemini custom plan if available
  if (profile.customPlan && Array.isArray(profile.customPlan) && profile.customPlan.length === 7) {
    const dayOfWeek = getDayOfWeek(date);
    const dayPlan = profile.customPlan[dayOfWeek];
    if (dayPlan) {
      const validTypes: WorkoutType[] = ['run', 'gym', 'bike', 'rest', 'race'];
      const validColors = ['blue', 'purple', 'orange', 'gray', 'red'];
      return {
        type: (validTypes.includes(dayPlan.type as WorkoutType) ? dayPlan.type : 'rest') as WorkoutType,
        label: dayPlan.label || 'Workout',
        description: dayPlan.description || '',
        color: (validColors.includes(dayPlan.color) ? dayPlan.color : 'gray') as WorkoutInfo['color'],
      };
    }
  }

  // Fallback to hardcoded templates
  const schedule = buildWeeklySchedule(profile);
  const dayOfWeek = getDayOfWeek(date);
  return schedule[dayOfWeek] ?? REST_DAY;
}

// ─── Workout detail (structured breakdown for detail sheet) ──────────────────

export function getWorkoutDetail(date: Date, profile?: PlanProfile | null): WorkoutDetail {
  const workout = getWorkoutForDateWithProfile(date, profile);

  // Generic detail based on workout type
  if (workout.type === 'race') {
    return {
      duration: 'All day',
      intensity: 'Race effort',
      steps: [
        { icon: '🌅', title: 'Morning', detail: 'Wake up 3h before start. Eat your usual pre-run breakfast — nothing new today.' },
        { icon: '👟', title: 'Warm-up', detail: '10min easy jog + 4 strides. Get the legs turning over.' },
        { icon: '🏃', title: 'Race', detail: 'Start conservative, negative split. Don\'t go out too fast in the first 5km.' },
        { icon: '🧊', title: 'Recovery', detail: 'Walk for 10-15min after finishing. Eat within 30min. Ice any sore spots.' },
      ],
      keyPoints: [
        'Trust the training — you have prepared for this',
        'Start 10-15 sec/km slower than goal pace for the first 5km',
        'Drink at every aid station even if not thirsty',
      ],
    };
  }

  if (workout.type === 'rest') {
    return {
      duration: '—',
      intensity: 'Rest / Recovery',
      steps: [
        { icon: '😴', title: 'Rest', detail: workout.description },
        { icon: '💧', title: 'Hydration', detail: 'Drink 2-3L water throughout the day.' },
      ],
      keyPoints: ['Rest is training — this is where you absorb your work'],
    };
  }

  if (workout.type === 'run') {
    return {
      duration: workout.label.match(/(\d+)km/) ? `~${Math.round(parseInt(workout.label.match(/(\d+)km/)![1]) * 6.5)}min` : '~45min',
      intensity: workout.label.includes('Tempo') || workout.label.includes('Race Pace') ? 'Moderate-Hard' : 'Easy — Zone 2',
      steps: [
        { icon: '🚶', title: 'Warm-up', detail: '5min brisk walk to wake the legs up.' },
        { icon: '🏃', title: 'Run', detail: workout.description },
        { icon: '🚶', title: 'Cool-down', detail: '5min walk + stretching (calves, quads, hip flexors).' },
      ],
      keyPoints: [
        'Easy means EASY — HR Zone 2, conversational pace',
        'Focus on relaxed form: tall posture, low arm carry',
      ],
    };
  }

  if (workout.type === 'gym') {
    return {
      duration: workout.label.includes('+ Easy Run') ? '75-90min' : '45-60min',
      intensity: 'Strength',
      steps: [
        { icon: '🔥', title: 'Strength', detail: workout.description },
        { icon: '🦵', title: 'Eccentric heel drops', detail: '3 x 15 reps each leg. Stand on a step, rise on both feet, lower slowly on one (4 sec down).' },
        { icon: '🧊', title: 'Post-session', detail: 'Eat protein within 30min. Ice any sore spots.' },
      ],
      keyPoints: [
        'Eccentric heel drops protect the Achilles — don\'t skip',
        'Prioritise sleep tonight — recovery happens at night',
      ],
    };
  }

  if (workout.type === 'bike') {
    return {
      duration: workout.description.match(/(\d+)min/) ? workout.description.match(/(\d+)min/)![1] + 'min' : '45min',
      intensity: 'Zone 2 — Aerobic',
      steps: [
        { icon: '🚴', title: 'Warm-up', detail: '5min easy spinning.' },
        { icon: '🎯', title: 'Zone 2 ride', detail: workout.description },
        { icon: '🧘', title: 'Cool-down', detail: '5min easy, then stretch (hip flexors, quads, lower back).' },
      ],
      keyPoints: [
        'Zone 2 = conversational pace',
        'This session actively speeds up recovery from gym work',
      ],
    };
  }

  // Fallback
  return {
    duration: '~45min',
    intensity: 'Moderate',
    steps: [{ icon: '🏋️', title: 'Workout', detail: workout.description }],
    keyPoints: [],
  };
}

// Legacy — kept for backward compat, but delegates to profile-aware version
export function getWorkoutForDate(date: Date): WorkoutInfo {
  return getWorkoutForDateWithProfile(date, null);
}
