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

// Plan anchor = Monday April 13, 2026 (as local midnight)
function planStart(): Date {
  return new Date(2026, 3, 13); // month is 0-indexed
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
    return { type: 'rest', label: 'Pre-Plan', description: 'Plan starts Monday April 13, 2026', color: 'gray' };
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

// ─── Structured workout detail ────────────────────────────────────────────────

export function getWorkoutDetail(date: Date): WorkoutDetail {
  const dateStr = dateToString(date);
  const week = getWeekNumber(date);
  const phase = getPhase(week);
  const day = getPlanDayIndex(date);

  // Race days
  if (RACES[dateStr]) {
    const race = RACES[dateStr];
    return {
      duration: 'All day',
      intensity: 'Race effort',
      steps: [
        { icon: '🌅', title: 'Morning', detail: 'Wake up 3h before start. Eat your usual pre-run breakfast — nothing new today.' },
        { icon: '👟', title: 'Warm-up', detail: '10 min easy jog + 4 strides. Get the legs turning over before the gun.' },
        { icon: '🏃', title: 'Race', detail: `${race.distance} — Start conservative, negative split. Don't go out too fast in the first 5km.` },
        { icon: '🧊', title: 'Recovery', detail: 'Walk for 10–15 min after finishing. Eat within 30 min. Ice any sore spots.' },
      ],
      keyPoints: [
        'Trust the training — you have prepared for this',
        'Start 10–15 sec/km slower than goal pace for the first 5km',
        'Drink at every aid station even if not thirsty',
        'Focus on form when tired: tall posture, relaxed shoulders',
      ],
    };
  }

  if (week <= 0) {
    return {
      duration: '—',
      intensity: 'Pre-plan rest',
      steps: [{ icon: '📅', title: 'Plan starts April 13', detail: 'Use this time to prepare gear, plan your nutrition, and get good sleep.' }],
      keyPoints: ['Plan starts Monday April 13, 2026'],
    };
  }

  // Monday — Run
  if (day === 0) {
    const desc = MONDAY_RUN[week] || 'Easy run';
    const isEasy = week <= 6;
    const hasStrides = week >= 4 && week <= 6;
    const isTempo = week >= 7 && week <= 9;
    const isMP = week >= 11;
    const isPreRace = week === 10 || week === 22 || week === 31;

    if (isPreRace) {
      return {
        duration: '35–40 min',
        intensity: 'Easy — Zone 2',
        steps: [
          { icon: '🚶', title: 'Warm-up', detail: '5 min easy walk to loosen up.' },
          { icon: '🏃', title: 'Easy run', detail: desc + '. Keep it purely conversational — this is just to keep the legs moving before race day.' },
          { icon: '🚶', title: 'Cool-down', detail: '5 min walk + full body stretch (quads, calves, hamstrings, hip flexors).' },
        ],
        keyPoints: [
          'Race is coming — protect the legs, no heroics today',
          'HR should stay in Zone 1–2 the whole time',
          'Focus on sleep and hydration this week',
        ],
      };
    }

    if (isEasy && !hasStrides) {
      return {
        duration: '30–40 min',
        intensity: 'Easy — Zone 2',
        steps: [
          { icon: '🚶', title: 'Warm-up', detail: '5 min brisk walk to wake the legs up.' },
          { icon: '🏃', title: 'Easy run', detail: desc + '. Completely conversational pace — you should be able to hold a full sentence.' },
          { icon: '🚶', title: 'Cool-down', detail: '5 min walk + calf stretches, quad stretches, hip flexor stretch (60 sec each).' },
        ],
        keyPoints: [
          'Easy means EASY — HR Zone 2, not Zone 3',
          'If in doubt, slow down. You build aerobic base here.',
          'Focus on relaxed form: tall posture, low arm carry',
        ],
      };
    }

    if (hasStrides) {
      return {
        duration: '40–50 min',
        intensity: 'Easy + short accelerations',
        steps: [
          { icon: '🚶', title: 'Warm-up', detail: '5 min walk.' },
          { icon: '🏃', title: 'Easy run', detail: desc.split('+')[0].trim() + ' at easy conversational pace.' },
          { icon: '⚡', title: 'Strides', detail: '4 × 80m accelerations. Start easy, build to ~90% effort over 80m. Walk back fully to recover between each.' },
          { icon: '🚶', title: 'Cool-down', detail: '5 min walk + stretching.' },
        ],
        keyPoints: [
          'Strides are NOT sprints — smooth controlled acceleration',
          'Full recovery between strides (walk back slowly)',
          'Focus on quick light footstrike and upright posture',
        ],
      };
    }

    if (isTempo) {
      const parts = desc.match(/(\d+)km WU.*?(\d+)km tempo.*?(\d+)km CD/);
      const wu = parts?.[1] ?? '2';
      const main = parts?.[2] ?? '4';
      const cd = parts?.[3] ?? '2';
      return {
        duration: `${parseInt(wu) + parseInt(main) + parseInt(cd)} km / ~${Math.round((parseInt(wu) + parseInt(main) + parseInt(cd)) * 6.5)} min`,
        intensity: 'Moderate — Tempo effort',
        steps: [
          { icon: '🚶', title: 'Warm-up', detail: `${wu}km very easy jog — genuinely easy, HR Zone 2. Don't skip this.` },
          { icon: '🔥', title: 'Tempo', detail: `${main}km at comfortably hard pace — you can speak 3–4 words but not hold a conversation. HR Zone 4 (~155–168 bpm). Steady, not surging.` },
          { icon: '🧊', title: 'Cool-down', detail: `${cd}km easy jog back to easy breathing, then 5 min walk + stretching.` },
        ],
        keyPoints: [
          'Tempo = "comfortably hard" not "as fast as possible"',
          'If you can hold a full conversation, speed up slightly',
          'If you can\'t speak at all, you\'re going too fast',
          'Eccentric heel drops after (3 × 15 each leg)',
        ],
      };
    }

    if (isMP) {
      const parts = desc.match(/(\d+)km.*?(\d+)km @ MP.*?(\d+)km CD/);
      const total = desc.match(/^(\d+)km/)?.[1] ?? '10';
      const mp = parts?.[2] ?? '6';
      const cd = parts?.[3] ?? '2';
      const wu = parseInt(total) - parseInt(mp) - parseInt(cd);
      return {
        duration: `${total} km`,
        intensity: 'Mixed — Easy + Marathon Pace',
        steps: [
          { icon: '🚶', title: 'Warm-up', detail: `${wu}km easy — conversational, get the body warm and loose.` },
          { icon: '🎯', title: 'Marathon pace', detail: `${mp}km at your goal marathon pace. This is race simulation — steady, controlled, sustainable. Aim for consistent splits.` },
          { icon: '🧊', title: 'Cool-down', detail: `${cd}km very easy jog, then walk 5 min, full stretch.` },
        ],
        keyPoints: [
          'Marathon pace should feel "controlled hard" — not a sprint, not easy',
          'Aim for even splits across the MP section',
          'Practice your race day breathing pattern',
          'Fuel within 30 min after finishing',
        ],
      };
    }

    return {
      duration: '~45 min',
      intensity: 'Easy — Zone 2',
      steps: [
        { icon: '🚶', title: 'Warm-up', detail: '5 min walk.' },
        { icon: '🏃', title: 'Run', detail: desc },
        { icon: '🚶', title: 'Cool-down', detail: '5 min walk + stretching.' },
      ],
      keyPoints: ['Keep it easy and consistent'],
    };
  }

  // Tuesday / Thursday — Gym
  if (day === 1 || day === 3) {
    const isThursdayPhase3Plus = day === 3 && phase >= 3;
    return {
      duration: isThursdayPhase3Plus ? '75–90 min' : '60–75 min',
      intensity: 'Strength',
      steps: [
        { icon: '🔥', title: 'Gym class', detail: 'Your regular strength class. Focus on engagement — glutes, core, single-leg stability.' },
        { icon: '🦵', title: 'Eccentric heel drops', detail: '3 × 15 reps each leg. Stand on a step, rise up on both feet, lower slowly on one foot (4 sec down). This is your Achilles protection — do not skip.' },
        ...(isThursdayPhase3Plus ? [
          { icon: '🏃', title: 'Immediate easy run', detail: '20–30 min easy jog straight after the gym — legs will be tired, that\'s the point. Simulates the marathon feeling of running on fatigued muscles.' },
        ] : []),
        { icon: '🧊', title: 'Post-session', detail: 'Ice calves/Achilles if any soreness. Eat protein within 30 min.' },
      ],
      keyPoints: [
        'Eccentric heel drops are non-negotiable for Achilles health',
        'Slow the eccentric (lowering) phase right down — 3–4 seconds',
        ...(isThursdayPhase3Plus ? ['Thursday run is about fatigue tolerance, not pace — go very easy'] : []),
        'Prioritise sleep tonight — recovery happens at night',
      ],
    };
  }

  // Wednesday — Bike
  if (day === 2) {
    const dur = getBikeDuration(week);
    return {
      duration: dur,
      intensity: 'Zone 2 — Aerobic',
      steps: [
        { icon: '🚴', title: 'Warm-up', detail: '5 min easy spinning to warm the legs.' },
        { icon: '🎯', title: 'Zone 2 ride', detail: `${dur} at steady aerobic effort — you should be able to hold a conversation comfortably. HR ~120–140 bpm. This builds your aerobic engine without accumulating fatigue.` },
        { icon: '🧘', title: 'Cool-down', detail: '5 min easy, then off the bike and stretch (hip flexors, quads, lower back).' },
      ],
      keyPoints: [
        'Zone 2 = conversational pace, not "easy but I could go harder"',
        'Resistance low enough that you never feel out of breath',
        'This session actively speeds up recovery from Tuesday gym',
        'Hydrate well — easy to forget on the bike',
      ],
    };
  }

  // Friday — REST
  if (day === 4) {
    return {
      duration: 'All day',
      intensity: 'Complete rest',
      steps: [
        { icon: '😴', title: 'Sleep in', detail: 'Extra sleep tonight directly boosts Saturday performance. Aim for 8–9 hours.' },
        { icon: '🥗', title: 'Nutrition', detail: 'Eat well today — complex carbs at lunch and dinner to top up glycogen for tomorrow\'s long run.' },
        { icon: '💧', title: 'Hydration', detail: 'Drink 2–3L water throughout the day. Avoid heavy alcohol.' },
        { icon: '🎒', title: 'Prepare kit', detail: 'Lay out tomorrow\'s gear tonight. Plan your route and nutrition (gels/water) in advance.' },
      ],
      keyPoints: [
        'Rest is training — this is where you absorb this week\'s work',
        'Prep your kit tonight so tomorrow morning is stress-free',
        'Big Saturday run needs good sleep + food today',
      ],
    };
  }

  // Saturday — Long Run
  if (day === 5) {
    const km = LONG_RUN_KM[week];
    if (!km) {
      return {
        duration: '—',
        intensity: 'Easy',
        steps: [{ icon: '🚶', title: 'Light movement', detail: 'Easy walk or gentle stretch. Nothing structured.' }],
        keyPoints: [],
      };
    }
    const estMin = Math.round(km * (phase <= 2 ? 7.5 : 7));
    const h = Math.floor(estMin / 60);
    const m = estMin % 60;
    const durationStr = h > 0 ? `${h}h ${m}min` : `~${m} min`;

    const steps: WorkoutStep[] = [
      { icon: '🚶', title: 'Warm-up', detail: '10 min brisk walk before you start running. Hips, ankles, glutes — get mobile.' },
    ];

    if (phase === 1) {
      steps.push({ icon: '🏃', title: `${km}km easy run`, detail: 'Fully conversational the entire way. HR Zone 2 — if you can\'t speak a sentence, slow down. No pressure on pace.' });
    } else if (phase === 2) {
      steps.push({ icon: '🏃', title: `${km - 2}km easy`, detail: 'Easy Zone 2 for the first portion. Just cruising.' });
      steps.push({ icon: '🎯', title: 'Final 2km at MP', detail: 'Lift to marathon pace for the last 2km. Get a feel for race effort on tired legs.' });
    } else {
      const mpKm = Math.round(km * 0.4);
      steps.push({ icon: '🏃', title: `${km - mpKm}km easy`, detail: 'Zone 2 easy running — don\'t go faster than necessary.' });
      steps.push({ icon: '🎯', title: `${mpKm}km at marathon pace`, detail: 'Build to marathon pace. This is the key training stimulus — practise running fast when tired.' });
      steps.push({ icon: '🍌', title: 'Nutrition', detail: 'Take a gel or fuel every 40 min. Practice your race day nutrition strategy — nothing new on race day.' });
    }

    steps.push({ icon: '🚶', title: 'Cool-down', detail: '10 min walk. Full stretch: calves, quads, hamstrings, hip flexors, IT band. Foam roll if available.' });
    steps.push({ icon: '🍽️', title: 'Recovery meal', detail: 'Eat a proper meal within 45 min: protein + carbs. Chocolate milk, rice + chicken, or a recovery shake.' });

    return {
      duration: durationStr,
      intensity: phase <= 1 ? 'Easy — Zone 2' : phase === 2 ? 'Easy + MP finish' : 'Mixed — Zone 2 + Marathon Pace',
      steps,
      keyPoints: [
        'The long run builds everything — consistency is more important than pace',
        phase >= 3 ? 'Fuel every 40 min — no heroics, eat on schedule' : 'HR Zone 2 the whole time — slow down if needed',
        'Walk breaks are fine, especially on hot days',
        'How you feel the next day matters — don\'t dig a hole',
      ],
    };
  }

  // Sunday — REST
  return {
    duration: '—',
    intensity: 'Active recovery',
    steps: [
      { icon: '🚶', title: 'Easy walk', detail: '20–30 min gentle walk if legs allow. No running.' },
      { icon: '🧘', title: 'Stretch & foam roll', detail: 'Full body stretch: calves, Achilles, quads, hamstrings, hip flexors, glutes. 10 min foam rolling.' },
      { icon: '🍽️', title: 'Eat well', detail: 'Focus on protein and carbs to replenish after Saturday\'s long run.' },
    ],
    keyPoints: [
      'Sunday is recovery — the work is done',
      'Gentle movement helps flush out lactic acid',
      'Hydrate and eat well — long run recovery takes 24–36h',
    ],
  };
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

// Workout type helpers for Strava auto-matching
export function isRunWorkout(type: string) { return type === 'run' || type === 'race'; }
export function isBikeWorkout(type: string) { return type === 'bike'; }
export function isGymWorkout(type: string) { return type === 'gym' || type === 'strength'; }

// ─────────────────────────────────────────────────────────────────────────────
// Personalized Plans — goal-based workout templates
// ─────────────────────────────────────────────────────────────────────────────

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
}

const REST: WorkoutInfo = { type: 'rest', label: 'Rest Day', description: 'Recovery — light walk, stretching, or complete rest', color: 'gray' };

const FITNESS_WORKOUTS: WorkoutInfo[] = [
  { type: 'run', label: 'Easy Run', description: '30-40min easy pace, conversational effort', color: 'blue' },
  { type: 'gym', label: 'Strength Training', description: 'Full body circuit — squats, push-ups, rows, lunges. 40-45min', color: 'purple' },
  { type: 'run', label: 'Interval Run', description: '5×3min at moderate pace with 2min walk recoveries', color: 'blue' },
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

/**
 * Returns a 7-day workout schedule for non-marathon goals.
 * Spreads `daysPerWeek` workouts across the week with the long session
 * placed on `preferredLongDay`.
 */
function buildWeeklySchedule(profile: PlanProfile): (WorkoutInfo | null)[] {
  const schedule: (WorkoutInfo | null)[] = [null, null, null, null, null, null, null];
  const goal = profile.goal ?? 'get_fit';
  const workouts = goal === 'lose_weight' ? WEIGHT_LOSS_WORKOUTS : FITNESS_WORKOUTS;
  const longSession = LONG_SESSIONS[goal] ?? LONG_SESSIONS['other'];
  const longDayIdx = DAY_INDEX[profile.preferredLongDay] ?? 5;
  const daysPerWeek = Math.min(Math.max(profile.daysPerWeek, 2), 7);

  // Place long session first
  schedule[longDayIdx] = longSession;
  let placed = 1;

  // Spread remaining workouts evenly, skipping the long-day
  const available = Array.from({ length: 7 }, (_, i) => i).filter(i => i !== longDayIdx);
  // Prefer spacing: every other day when possible
  const spacing = Math.max(1, Math.floor(7 / daysPerWeek));
  let workoutIdx = 0;
  for (let i = 0; i < available.length && placed < daysPerWeek; i++) {
    const dayIdx = available[i];
    // Skip if too close to another placed workout (prefer spacing)
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
  // Fill any remaining if spacing was too strict
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

/**
 * Profile-aware workout: returns the workout for `date` based on user's goal.
 * If a Gemini-generated custom plan exists, use it.
 * Marathon/half-marathon uses the existing 31-week periodized plan.
 * Other goals fall back to a rotating weekly template.
 */
export function getWorkoutForDateWithProfile(date: Date, profile?: PlanProfile | null): WorkoutInfo {
  if (!profile || !profile.goal || profile.goal === 'marathon' || profile.goal === 'half_marathon') {
    return getWorkoutForDate(date);
  }

  // Use Gemini-generated custom plan if available
  if (profile.customPlan && Array.isArray(profile.customPlan) && profile.customPlan.length === 7) {
    const dayOfWeek = (date.getDay() + 6) % 7; // 0=Mon
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

  // Fall back to hardcoded templates
  const schedule = buildWeeklySchedule(profile);
  const dayOfWeek = (date.getDay() + 6) % 7; // 0=Mon
  return schedule[dayOfWeek] ?? REST;
}

