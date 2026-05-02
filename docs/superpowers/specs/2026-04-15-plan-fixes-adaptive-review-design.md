# Plan Fixes & Adaptive Weekly Review — Design Spec

**Date:** 2026-04-15
**Branch:** claude/awesome-meitner
**Status:** Approved

---

## 1. Bug 1 — Plan starts before sign-up day

### Problem
`computePlanStart()` (`lib/training-plan.ts:88`) aligns to the Monday of the sign-up week. A user who signs up on Wednesday Apr 15 gets `planStart = Mon Apr 13` — two days before they existed. Week 1 workouts appear in the past.

### Fix
In `getRacePlanInfo()`, after calling `computePlanStart()`, clamp `planStart` forward:

```ts
if (profile.createdAt) {
  const signupTomorrow = new Date(new Date(profile.createdAt).getTime() + 24 * 60 * 60 * 1000);
  const st = new Date(signupTomorrow.getFullYear(), signupTomorrow.getMonth(), signupTomorrow.getDate());
  if (planStart < st) planStart = st;
}
```

No Monday re-alignment after clamping. `currentWeek` and phase calculations use `Math.floor((today - planStart) / 7days)` so they adjust automatically.

**Result for user 538c297d (created Apr 15):** Week 1 starts Apr 16 (Thursday).

---

## 2. Bug 2A — Distances not scaled to training level

### Problem
`getRaceRunWorkout()` uses a fixed `goalMultiplier` per distance (marathon/half/10k) but ignores `trainingLevel`. A beginner and an advanced runner get the same km targets.

### Fix — Thread `trainingLevel` and `planAdjustment` down the call chain

Add `planAdjustment?: number` to the `PlanProfile` interface.

Update signatures:

```
getWorkoutForDateWithProfile(date, profile)
  └─ getRaceWorkoutByType(…, trainingLevel, planAdjustment)
      └─ getRaceRunWorkout(…, trainingLevel, planAdjustment)
  └─ getRaceWorkoutForDay(…, trainingLevel, planAdjustment)
      └─ getRaceRunWorkout(…, trainingLevel, planAdjustment)
      └─ getRaceWorkoutByType(…, trainingLevel, planAdjustment)
```

### Distance multipliers in `getRaceRunWorkout`

```
levelMultiplier =
  'beginner'     → 0.55
  'intermediate' → 1.0
  'advanced'     → 1.2
  (default)      → 1.0

adjMultiplier = clamp(planAdjustment ?? 1.0, 0.6, 1.3)

finalKm = round(rawKm * levelMultiplier * goalMultiplier * adjMultiplier, 0.5)
finalKm = max(finalKm, 2)
```

`round(x, 0.5)` = `Math.round(x * 2) / 2`

### Beginner caps
Week 1 only — hard caps applied after all multipliers:
- Long run: ≤ 5km
- Easy run: ≤ 4km

Week 2 onward — no static cap. `levelMultiplier = 0.55` stays in place permanently, keeping distances naturally lower than intermediate/advanced. The adaptive review multiplier (`planAdjustment`) handles week-over-week progression from that point.

---

## 3. Bug 2B — Gemini prompts lack level constraints

### Race goal prompt (`isRaceGoal && hasRunPreference`)
Add to RULES section:

```
TRAINING LEVEL CONSTRAINTS for ${profile.training_level || 'intermediate'}:
- beginner: Week 1 long run label must say "Easy Run — 4-5km". Easy run days are 20-30min. No more than 1 run day in weeks 1-2. Prioritise 1 rest day between every run day.
- intermediate: Week 1 long run is 8-10km. Easy runs 40-50min.
- advanced: Week 1 long run is 12-14km. Easy runs 50-60min. Can include tempo or intervals from week 3.
```

### Non-race goal prompt
Replace:
```
- For beginners, keep sessions shorter and lower intensity
```
With:
```
- beginner: Run sessions max 30min or 4km. No session over 45min in week 1.
- intermediate: Run sessions 40-55min or 6-9km.
- advanced: Run sessions 50-70min or 8-15km. Can include intervals or tempo.
```

---

## 4. New Feature — Adaptive Weekly Review

### Overview
After each completed training week, when the user opens the app on Monday, a review runs automatically. It fetches the past 7 days of data, asks Gemini whether to maintain/increase/reduce/recovery the next week, and saves the result as a multiplier on the profile. `getRaceRunWorkout()` reads that multiplier when computing distances.

### 4a. Database — migration `016_plan_adjustment.sql`

```sql
alter table profiles
  add column if not exists plan_adjustment jsonb;
-- Shape: { action: 'maintain'|'increase'|'reduce'|'recovery', reason: string, long_run_km_adjustment: number, applied_at: timestamptz }
```

Also add `plan_adjustment` to `UserProfile` interface in `lib/supabase.ts`:
```ts
plan_adjustment: { action: string; reason: string; long_run_km_adjustment: number; applied_at: string } | null;
```

### 4b. API — `app/api/review-week/route.ts`

**Method:** POST  
**Body:** `{ userId: string }`  
**Auth:** Service role key (same pattern as generate-plan)

**Logic:**

1. Fetch from Supabase for the past 7 days (last Monday through yesterday):
   - `completed_sessions` → rows where `user_id = userId` and `date` in range
   - `strava_activities` → rows where `user_id = userId` and `start_date` in range
   - `daily_checkins` → rows where `user_id = userId` and `date` in range
   - `profiles` → fetch `training_level`, `goal`, `custom_plan`, `race_date`

2. Compute summary:
   - `sessionsCompleted` = count where `status = 'done'`
   - `sessionsPlanned` = count of non-rest days from custom_plan (7-day template)
   - `completionRate` = sessionsCompleted / sessionsPlanned (or 0 if none planned)
   - `avgRecovery` = avg of `whoop_recovery` values (null if none)
   - `avgAchilles` = avg of `achilles_pain` values (null if none)
   - `totalRunKm` = sum of Strava distance (metres → km) for runs
   - `plannedRunKm` = sum of planned run km from profile's expected distances (week N)

3. Build Gemini prompt:
   ```
   You are an expert endurance coach reviewing an athlete's last training week.
   
   ATHLETE: goal=${goal}, level=${training_level}
   LAST WEEK SUMMARY:
   - Sessions completed: ${sessionsCompleted} / ${sessionsPlanned}
   - Completion rate: ${Math.round(completionRate * 100)}%
   - Avg recovery score: ${avgRecovery ?? 'N/A'} / 100
   - Avg Achilles pain: ${avgAchilles ?? 'N/A'} / 10
   - Total run km: ${totalRunKm}km (planned: ~${plannedRunKm}km)
   
   Based on this data, should next week's training:
   - maintain: athlete is on track, no change needed
   - increase: athlete is performing well, +10% volume
   - reduce: athlete is struggling, -20% volume
   - recovery: athlete needs a full recovery week (replace sessions with easy/rest)
   
   Return ONLY valid JSON, no markdown:
   {"action":"maintain"|"increase"|"reduce"|"recovery","reason":"<1 sentence>","long_run_km_adjustment":<number, e.g. 0 for maintain, 2 for increase, -3 for reduce>}
   ```

4. Parse Gemini response. Validate `action` is one of the four values.

5. Save to `profiles.plan_adjustment` with `applied_at: new Date().toISOString()`.

6. Return `{ action, reason, long_run_km_adjustment }`.

### 4c. Client — Monday trigger in `app/week/page.tsx`

In the `init()` `useEffect` that already loads profile/sessions, add a Monday check after the user and profile are loaded:

```ts
const today = new Date();
const isMonday = today.getDay() === 1; // 0=Sun, 1=Mon
const lastReviewKey = `review_run_${userId}`;
const lastReviewDate = localStorage.getItem(lastReviewKey);
const todayStr = dateToString(today);

if (isMonday && lastReviewDate !== todayStr && userId) {
  localStorage.setItem(lastReviewKey, todayStr);
  fetch('/api/review-week', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  }).then(async (res) => {
    if (res.ok) {
      // Refresh profile so plan_adjustment is picked up
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (data) setProfile(data);
    }
  }).catch(() => { /* silent — review is non-blocking */ });
}
```

The `localStorage` key prevents the review firing more than once per Monday per user.

### 4d. `getRaceRunWorkout` reads `planAdjustment`

`planAdjustment` is passed from `profile.plan_adjustment?.long_run_km_adjustment`. This is a km delta (e.g. +2, -3), not a multiplier. Wait — the spec says "a multiplier the getRaceRunWorkout() function reads". Re-reading: `long_run_km_adjustment` is a number (km delta), but the profile column stores the full JSON. The multiplier in `getRaceRunWorkout` is `clamp(planAdjustment ?? 1.0, 0.6, 1.3)`.

**Clarification:** `PlanProfile.planAdjustment` will be a numeric multiplier derived from the Gemini action:
- `maintain` → 1.0
- `increase` → 1.1
- `reduce` → 0.8
- `recovery` → 0.6

The route converts `action` to a multiplier before saving, storing it in `plan_adjustment.multiplier`. `getWorkoutForDateWithProfile` reads `profile.plan_adjustment?.multiplier ?? 1.0` and passes it as `planAdjustment` to `getRaceRunWorkout`.

`long_run_km_adjustment` (the raw km number) is stored for display/logging only.

---

## Files Changed

| File | Change |
|------|--------|
| `lib/training-plan.ts` | Bug 1 clamp; Bug 2A thread trainingLevel+planAdjustment; multiplier logic |
| `app/api/generate-plan/route.ts` | Bug 2B prompt level constraints |
| `app/api/review-week/route.ts` | New file — weekly review endpoint |
| `app/week/page.tsx` | Monday trigger for review-week |
| `lib/supabase.ts` | Add `plan_adjustment` to `UserProfile` type |
| `supabase/migrations/016_plan_adjustment.sql` | New column on profiles |
