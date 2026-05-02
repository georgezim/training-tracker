# Plan Fixes & Adaptive Weekly Review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two plan-start/distance bugs and add a Monday weekly-review system that calls Gemini and adjusts next-week distances.

**Architecture:** All distance scaling lives in `getRaceRunWorkout()` in `lib/training-plan.ts`. `trainingLevel` and a numeric `planAdjustment` multiplier are threaded down from `getWorkoutForDateWithProfile()`. The review endpoint (`app/api/review-week/route.ts`) fetches last week's data, calls Gemini, and saves the result (including a derived `multiplier`) to `profiles.plan_adjustment`. `long_run_km_adjustment` from Gemini is stored for display only — it is never read by `getRaceRunWorkout`. Only `multiplier` (derived from `action`) is used in distance computation. The week page fires the review on Monday by checking `plan_adjustment.applied_at` from the profile — no localStorage.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (postgres + RLS), Gemini 2.5 Flash (`@google/generative-ai`), no unit test framework — use `npx tsc --noEmit` for type-checking.

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `lib/training-plan.ts` | Modify | Bug 1 clamp; `planAdjustment` on `PlanProfile`; `trainingLevel`+`planAdjustment`+`weekInPlan` threaded through call chain; distance multiplier logic |
| `lib/supabase.ts` | Modify | Add `plan_adjustment` to `UserProfile` |
| `app/api/generate-plan/route.ts` | Modify | Add training-level constraints to both Gemini prompts |
| `supabase/migrations/016_plan_adjustment.sql` | Create | `plan_adjustment jsonb` column on `profiles` |
| `app/api/review-week/route.ts` | Create | Weekly review endpoint |
| `app/week/page.tsx` | Modify | Wire `planAdjustment` into `planProfile`; Monday trigger |

---

## Task 1 — Bug 1: Clamp planStart to day after sign-up

**Files:**
- Modify: `lib/training-plan.ts` (around line 182)

- [ ] **Step 1: Change `planStart` declaration from `const` to `let`**

In `getRacePlanInfo()`, find:
```ts
const planStart = computePlanStart(raceDateStr, totalWeeks, profile.createdAt);
```
Change to:
```ts
let planStart = computePlanStart(raceDateStr, totalWeeks, profile.createdAt);
```

- [ ] **Step 2: Add clamp block immediately after that line**

After `let planStart = computePlanStart(...)`, insert:
```ts
// Clamp: plan must not start before the day after the user signed up
if (profile.createdAt) {
  const signupTomorrow = new Date(new Date(profile.createdAt).getTime() + 24 * 60 * 60 * 1000);
  const st = new Date(signupTomorrow.getFullYear(), signupTomorrow.getMonth(), signupTomorrow.getDate());
  if (planStart < st) planStart = st;
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Manual verify**

In the browser console on the week page, or in a temporary `console.log` in `init()`, confirm that for a user with `createdAt = '2026-04-15'`, calling `getRacePlanInfo(new Date('2026-04-16'), profile)` returns `planStart` of April 16 and `currentWeek = 1`.

- [ ] **Step 5: Commit**

```bash
git add lib/training-plan.ts
git commit -m "fix: clamp plan start to day after sign-up — prevents Week 1 appearing in the past"
```

---

## Task 2 — Types: add planAdjustment to PlanProfile and UserProfile

**Files:**
- Modify: `lib/training-plan.ts` (~line 50)
- Modify: `lib/supabase.ts` (~line 28)

- [ ] **Step 1: Add `planAdjustment` to `PlanProfile`**

In `lib/training-plan.ts`, find the `PlanProfile` interface and add one field:
```ts
export interface PlanProfile {
  goal: string | null;
  daysPerWeek: number;
  preferredLongDay: string;
  trainingLevel: string;
  customPlan?: CustomPlanDay[] | null;
  raceDate?: string | null;
  createdAt?: string | null;
  injuryNotes?: string | null;
  planAdjustment?: number | null;   // <-- add this
}
```

- [ ] **Step 2: Add `plan_adjustment` to `UserProfile`**

In `lib/supabase.ts`, find the `UserProfile` interface and add after `avatar_url`:
```ts
export interface UserProfile {
  // ... existing fields ...
  avatar_url: string | null;
  plan_adjustment: {
    action: string;
    reason: string;
    long_run_km_adjustment: number;
    multiplier: number;
    applied_at: string;
  } | null;
  created_at?: string;
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: 0 errors (no callers reference `planAdjustment` yet so no cascading errors).

- [ ] **Step 4: Commit**

```bash
git add lib/training-plan.ts lib/supabase.ts
git commit -m "types: add planAdjustment to PlanProfile and plan_adjustment to UserProfile"
```

---

## Task 3 — Bug 2A: Distance scaling by training level

**Files:**
- Modify: `lib/training-plan.ts` (functions `getRaceRunWorkout`, `getRaceWorkoutByType`, `getRaceWorkoutForDay`, `getWorkoutForDateWithProfile`)

- [ ] **Step 1: Replace `getRaceRunWorkout` with the level-aware version**

Find the existing `getRaceRunWorkout` function (starts around line 285) and replace the entire function:

```ts
function getRaceRunWorkout(
  isLongRun: boolean,
  phase: number,
  progress: number,
  goalMultiplier: number,
  goal: string,
  trainingLevel: string,
  planAdjustment: number,
  weekInPlan: number,
): WorkoutInfo {
  const levelMult = trainingLevel === 'beginner' ? 0.55 : trainingLevel === 'advanced' ? 1.2 : 1.0;
  const adjMult = Math.min(1.3, Math.max(0.6, planAdjustment));

  function roundHalf(n: number): number { return Math.round(n * 2) / 2; }
  function applyMults(rawKm: number): number { return Math.max(2, roundHalf(rawKm * levelMult * adjMult)); }

  if (isLongRun) {
    if (phase === 4) {
      const rawKm = 12 * goalMultiplier;
      let km = applyMults(rawKm);
      if (trainingLevel === 'beginner' && weekInPlan === 1) km = Math.min(km, 5);
      return { type: 'run', label: `Easy Long Run — ${km}km`, description: `${km}km at easy pace. Trust the taper.`, color: 'blue' };
    }
    const baseKm = Math.round(8 * goalMultiplier);
    const maxKm = goal === 'marathon' ? 35 : goal === 'half_marathon' ? 22 : 14;
    const rawKm = baseKm + (maxKm - baseKm) * Math.min(1, progress * 1.1);
    let km = applyMults(rawKm);
    if (trainingLevel === 'beginner' && weekInPlan === 1) km = Math.min(km, 5);
    let desc = `${km}km long run`;
    if (phase === 1) desc += ' — easy conversational pace, HR Zone 2';
    else if (phase === 2) desc += ' — mostly easy, final 2km at goal pace';
    else desc += ' — includes goal-pace segments. Practice nutrition every 40min.';
    return { type: 'run', label: `Long Run — ${km}km`, description: desc, color: 'blue' };
  } else {
    if (phase === 4) {
      const rawKm = 5 + 3 * goalMultiplier;
      let km = applyMults(rawKm);
      if (trainingLevel === 'beginner' && weekInPlan === 1) km = Math.min(km, 4);
      return { type: 'run', label: `Easy Run — ${km}km`, description: `${km}km easy pace — legs should feel fresh. HR Zone 2.`, color: 'blue' };
    }
    const baseKm = 5;
    const maxKm = Math.round(16 * goalMultiplier);
    const rawKm = baseKm + (maxKm - baseKm) * progress;
    let km = applyMults(rawKm);
    if (trainingLevel === 'beginner' && weekInPlan === 1) km = Math.min(km, 4);
    if (phase === 1) {
      return { type: 'run', label: `Easy Run — ${km}km`, description: `${km}km easy — conversational pace, HR Zone 2`, color: 'blue' };
    }
    if (phase === 2) {
      const tempoKm = roundHalf(Math.max(1, km * 0.4));
      const wuKm = roundHalf(Math.max(0.5, (km - tempoKm) * 0.6));
      const cdKm = roundHalf(Math.max(0.5, km - wuKm - tempoKm));
      return { type: 'run', label: `Tempo Run — ${km}km`, description: `${wuKm}km warm-up, ${tempoKm}km tempo, ${cdKm}km cool-down`, color: 'blue' };
    }
    const mpKm = roundHalf(Math.max(1, km * 0.5));
    const wuKm = roundHalf(Math.max(0.5, (km - mpKm) * 0.5));
    const cdKm = roundHalf(Math.max(0.5, km - wuKm - mpKm));
    return { type: 'run', label: `Race Pace Run — ${km}km`, description: `${wuKm}km WU, ${mpKm}km @ goal pace, ${cdKm}km CD`, color: 'blue' };
  }
}
```

- [ ] **Step 2: Update `getRaceWorkoutByType` signature and run call**

Find `getRaceWorkoutByType` and add `trainingLevel: string` and `planAdjustment: number` to its signature, then pass them to `getRaceRunWorkout`:

```ts
function getRaceWorkoutByType(
  activityType: string,
  isLongSession: boolean,
  phase: number,
  weekInPlan: number,
  totalWeeks: number,
  goal: string,
  trainingLevel: string,
  planAdjustment: number,
): WorkoutInfo {
  const progress = Math.min(1, weekInPlan / Math.max(1, totalWeeks));
  const goalMultiplier = goal === 'marathon' ? 1.0 : goal === 'half_marathon' ? 0.65 : 0.45;

  switch (activityType) {
    case 'run':
      return getRaceRunWorkout(isLongSession, phase, progress, goalMultiplier, goal, trainingLevel, planAdjustment, weekInPlan);

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
```

- [ ] **Step 3: Update `getRaceWorkoutForDay` signature and run/byType calls**

Find `getRaceWorkoutForDay` and replace with:

```ts
function getRaceWorkoutForDay(
  day: number,
  phase: number,
  weekInPlan: number,
  totalWeeks: number,
  goal: string,
  isRaceDay: boolean,
  trainingLevel: string,
  planAdjustment: number,
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
      return getRaceRunWorkout(false, phase, progress, goalMultiplier, goal, trainingLevel, planAdjustment, weekInPlan);

    case 1: // Tuesday — Gym
      return getRaceWorkoutByType('gym', false, phase, weekInPlan, totalWeeks, goal, trainingLevel, planAdjustment);

    case 2: // Wednesday — Bike
      return getRaceWorkoutByType('bike', false, phase, weekInPlan, totalWeeks, goal, trainingLevel, planAdjustment);

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
      return getRaceRunWorkout(true, phase, progress, goalMultiplier, goal, trainingLevel, planAdjustment, weekInPlan);

    case 6: // Sunday — REST
      return { type: 'rest', label: 'REST', description: 'Active recovery: easy walk, stretch, foam roll. Eat well.', color: 'gray' };

    default:
      return { type: 'rest', label: 'REST', description: '', color: 'gray' };
  }
}
```

- [ ] **Step 4: Update the two call sites in `getWorkoutForDateWithProfile`**

In `getWorkoutForDateWithProfile`, extract level and adjustment from profile, then update both calls.

Find the `raceGoals.includes(profile.goal)` block. Before the `if (profile.customPlan ...)` line, add:
```ts
const trainingLevel = profile.trainingLevel ?? 'intermediate';
const planAdjustment = profile.planAdjustment ?? 1.0;
```

Then change the two calls:

Old:
```ts
return getRaceWorkoutByType(activityType, isLongRunDay, info.phase, info.currentWeek, info.totalWeeks, profile.goal);
```
New:
```ts
return getRaceWorkoutByType(activityType, isLongRunDay, info.phase, info.currentWeek, info.totalWeeks, profile.goal, trainingLevel, planAdjustment);
```

Old:
```ts
return getRaceWorkoutForDay(day, info.phase, info.currentWeek, info.totalWeeks, profile.goal, isRaceDay);
```
New:
```ts
return getRaceWorkoutForDay(day, info.phase, info.currentWeek, info.totalWeeks, profile.goal, isRaceDay, trainingLevel, planAdjustment);
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add lib/training-plan.ts
git commit -m "feat: scale run distances by training level — beginner 0.55×, advanced 1.2×, week-1 hard caps"
```

---

## Task 4 — Bug 2B: Training level constraints in Gemini prompts

**Files:**
- Modify: `app/api/generate-plan/route.ts`

- [ ] **Step 1: Add level constraints to the race goal prompt**

In the race goal prompt (inside the `if (isRaceGoal && hasRunPreference)` branch), find the RULES section. It currently ends with:
```
- Keep descriptions to one short sentence
```

Add immediately after that line, still inside the template literal:
```
TRAINING LEVEL CONSTRAINTS for ${profile.training_level || 'intermediate'}:
- beginner: Week 1 long run label must say "Easy Run — 4-5km". Easy run days are 20-30min. No more than 1 run day in weeks 1-2. Prioritise 1 rest day between every run day.
- intermediate: Week 1 long run is 8-10km. Easy runs 40-50min.
- advanced: Week 1 long run is 12-14km. Easy runs 50-60min. Can include tempo or intervals from week 3.
```

- [ ] **Step 2: Replace vague beginner line in the non-race prompt**

In the non-race goal prompt (the `else` branch), find:
```
- For beginners, keep sessions shorter and lower intensity
```
Replace with:
```
- beginner: Run sessions max 30min or 4km. No session over 45min in week 1.
- intermediate: Run sessions 40-55min or 6-9km.
- advanced: Run sessions 50-70min or 8-15km. Can include intervals or tempo.
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/generate-plan/route.ts
git commit -m "feat: add per-level training constraints to Gemini plan prompts"
```

---

## Task 5 — Migration: plan_adjustment column

**Files:**
- Create: `supabase/migrations/016_plan_adjustment.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Add plan_adjustment to profiles for adaptive weekly review results
-- Shape: { action: 'maintain'|'increase'|'reduce'|'recovery', reason: string,
--          long_run_km_adjustment: number, multiplier: number, applied_at: timestamptz }
alter table profiles
  add column if not exists plan_adjustment jsonb;
```

- [ ] **Step 2: Run migration in Supabase**

Open the Supabase dashboard → SQL Editor → paste and run the migration. Verify the `plan_adjustment` column appears on the `profiles` table with type `jsonb`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/016_plan_adjustment.sql
git commit -m "migration: add plan_adjustment jsonb column to profiles"
```

---

## Task 6 — New endpoint: app/api/review-week/route.ts

**Files:**
- Create: `app/api/review-week/route.ts`

The `strava_activities` table schema (from migration 002): columns `user_id`, `activity_date` (date), `sport_type` (text), `distance_m` (numeric). Run types in Strava are `'Run'`, `'TrailRun'`, `'VirtualRun'`.

- [ ] **Step 1: Create the route file**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
}

function actionToMultiplier(action: string): number {
  switch (action) {
    case 'increase': return 1.1;
    case 'reduce':   return 0.8;
    case 'recovery': return 0.6;
    default:         return 1.0; // 'maintain'
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Date range: last completed week (last Mon → last Sun)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, …
    const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - daysToLastMonday - 7);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);

    const fromDate = `${lastMonday.getFullYear()}-${String(lastMonday.getMonth() + 1).padStart(2, '0')}-${String(lastMonday.getDate()).padStart(2, '0')}`;
    const toDate = `${lastSunday.getFullYear()}-${String(lastSunday.getMonth() + 1).padStart(2, '0')}-${String(lastSunday.getDate()).padStart(2, '0')}`;

    console.log('[review-week] Reviewing week', fromDate, '→', toDate, 'for user:', userId);

    // Fetch all data in parallel
    const [sessionsRes, activitiesRes, checkinsRes, profileRes] = await Promise.all([
      supabase
        .from('completed_sessions')
        .select('date, session_type, status')
        .eq('user_id', userId)
        .gte('date', fromDate)
        .lte('date', toDate),
      supabase
        .from('strava_activities')
        .select('distance_m, sport_type, activity_date')
        .eq('user_id', userId)
        .gte('activity_date', fromDate)
        .lte('activity_date', toDate),
      supabase
        .from('daily_checkins')
        .select('date, whoop_recovery, achilles_pain')
        .eq('user_id', userId)
        .gte('date', fromDate)
        .lte('date', toDate),
      supabase
        .from('profiles')
        .select('training_level, goal, custom_plan')
        .eq('id', userId)
        .single(),
    ]);

    const sessions   = sessionsRes.data ?? [];
    const activities = activitiesRes.data ?? [];
    const checkins   = checkinsRes.data ?? [];
    const profile    = profileRes.data;

    // Compute summary metrics
    const sessionsCompleted = sessions.filter(s => s.status === 'done').length;
    const customPlan: Array<{ type: string }> = Array.isArray(profile?.custom_plan) ? profile.custom_plan : [];
    const sessionsPlanned = customPlan.filter(d => d.type !== 'rest').length;
    const completionRate = sessionsPlanned > 0 ? sessionsCompleted / sessionsPlanned : 0;

    const recoveryValues = checkins
      .map(c => c.whoop_recovery)
      .filter((v): v is number => v != null);
    const avgRecovery = recoveryValues.length > 0
      ? Math.round(recoveryValues.reduce((a, b) => a + b, 0) / recoveryValues.length)
      : null;

    const achillesValues = checkins
      .map(c => c.achilles_pain)
      .filter((v): v is number => v != null);
    const avgAchilles = achillesValues.length > 0
      ? Math.round(achillesValues.reduce((a, b) => a + b, 0) / achillesValues.length * 10) / 10
      : null;

    const runActivities = activities.filter(a =>
      ['Run', 'TrailRun', 'VirtualRun'].includes(a.sport_type ?? '')
    );
    const totalRunKm = Math.round(
      runActivities.reduce((sum, a) => sum + (a.distance_m ?? 0), 0) / 100
    ) / 10;

    const prompt = `You are an expert endurance coach reviewing an athlete's last training week.

ATHLETE: goal=${profile?.goal ?? 'marathon'}, level=${profile?.training_level ?? 'intermediate'}
LAST WEEK (${fromDate} to ${toDate}):
- Sessions completed: ${sessionsCompleted} / ${sessionsPlanned}
- Completion rate: ${Math.round(completionRate * 100)}%
- Avg recovery score: ${avgRecovery ?? 'N/A'} / 100
- Avg Achilles pain: ${avgAchilles ?? 'N/A'} / 10
- Total run km logged via Strava: ${totalRunKm}km

Based on this data, choose ONE action:
- maintain: athlete is on track, no change
- increase: athlete is performing well, safe to add ~10% volume
- reduce: athlete is struggling or incomplete, reduce ~20%
- recovery: athlete needs a full recovery week

Return ONLY valid JSON, no markdown, no explanation:
{"action":"maintain","reason":"<one sentence>","long_run_km_adjustment":<integer, e.g. 0 or 2 or -3>}`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const geminiResult = await model.generateContent(prompt);
    const text = geminiResult.response.text().trim();
    console.log('[review-week] Gemini response:', text.slice(0, 200));

    let parsed: { action: string; reason: string; long_run_km_adjustment: number };
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      console.error('[review-week] JSON parse failed:', text);
      return NextResponse.json({ error: 'Failed to parse Gemini response' }, { status: 500 });
    }

    const validActions = ['maintain', 'increase', 'reduce', 'recovery'];
    if (!validActions.includes(parsed.action)) parsed.action = 'maintain';

    const planAdjustment = {
      action: parsed.action,
      reason: String(parsed.reason ?? '').slice(0, 200),
      long_run_km_adjustment: Number(parsed.long_run_km_adjustment ?? 0),
      multiplier: actionToMultiplier(parsed.action),
      applied_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ plan_adjustment: planAdjustment })
      .eq('id', userId);

    if (updateError) {
      console.error('[review-week] Failed to save:', updateError);
      return NextResponse.json({ error: 'Failed to save review result', detail: updateError.message }, { status: 500 });
    }

    console.log('[review-week] SUCCESS — action:', planAdjustment.action, 'multiplier:', planAdjustment.multiplier);
    return NextResponse.json(planAdjustment);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[review-week] FATAL:', msg);
    return NextResponse.json({ error: 'Review failed', detail: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/review-week/route.ts
git commit -m "feat: add /api/review-week endpoint — Gemini weekly plan adjustment"
```

---

## Task 7 — Week page: wire planAdjustment + Monday trigger

**Files:**
- Modify: `app/week/page.tsx`

- [ ] **Step 1: Add planAdjustment to planProfile construction**

Find the `planProfile` object (around line 48):
```ts
const planProfile: PlanProfile | null = profile ? {
  goal: profile.goal,
  daysPerWeek: profile.days_per_week ?? 4,
  preferredLongDay: profile.preferred_long_day ?? 'Sat',
  trainingLevel: profile.training_level ?? 'intermediate',
  customPlan: profile.custom_plan ?? null,
  raceDate: profile.race_date ?? null,
  createdAt: profile.created_at ?? null,
  injuryNotes: profile.injury_notes ?? null,
} : null;
```

Add `planAdjustment` as the last field before the closing `}`:
```ts
  planAdjustment: profile.plan_adjustment?.multiplier ?? 1.0,
```

- [ ] **Step 2: Add the Monday review trigger inside `init()`**

In the `init()` async function (inside the first `useEffect`), after `setProfile(prof as UserProfile)` (line 66), add:

```ts
      // Monday trigger: run weekly review if today is Monday and it hasn't run yet this Monday.
      // Uses plan_adjustment.applied_at from the profile — no localStorage (breaks across devices).
      const nowDate = new Date();
      const isMonday = nowDate.getDay() === 1;
      if (isMonday) {
        const todayIso = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`;
        const lastApplied = (prof as UserProfile).plan_adjustment?.applied_at ?? '';
        const alreadyRanToday = lastApplied.startsWith(todayIso);
        if (!alreadyRanToday) {
          fetch('/api/review-week', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id }),
          }).then(async res => {
            if (res.ok) {
              // Refresh profile so the new multiplier is picked up immediately
              const { data: updatedProf } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
              if (updatedProf) setProfile(updatedProf as UserProfile);
            }
          }).catch(() => { /* silent — review is non-blocking */ });
        }
      }
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Verify Monday trigger logic manually**

On any day other than Monday, confirm the review fetch is NOT called (Network tab stays clear of `/api/review-week`). To test Monday logic, temporarily change the check to `nowDate.getDay() === nowDate.getDay()` (always true), reload — confirm the fetch fires once. Reload again — confirm it does NOT fire a second time (profile `plan_adjustment.applied_at` now starts with today's ISO date, so `alreadyRanToday` is `true`). Revert to `=== 1`.

- [ ] **Step 5: Commit**

```bash
git add app/week/page.tsx
git commit -m "feat: wire planAdjustment into PlanProfile; add Monday review trigger to week page"
```

---

## Final verification

- [ ] Run `npx tsc --noEmit` — 0 errors across all changed files
- [ ] Run `npm run build` — build succeeds with no type errors
- [ ] For user `538c297d-823a-4796-aa98-9c93f64420fd` (beginner, created Apr 15 2026): open the week page on Apr 16 and confirm Week 1 starts Apr 16, long run shows ≤5km, easy run shows ≤4km
- [ ] Manually POST to `/api/review-week` with `{ "userId": "538c297d-..." }` and confirm the response is valid JSON with `action`, `multiplier`, `reason`; check Supabase that `plan_adjustment` is saved on the profile row
- [ ] Open app on a simulated Monday (or toggle the day check temporarily) and confirm the review fires and distances update
