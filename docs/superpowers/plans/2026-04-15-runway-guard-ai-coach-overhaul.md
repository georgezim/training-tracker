# Runway Guard + AI Coach Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guard runway sessions to only show from signup date onward, and overhaul the AI coach so it only fires on red metrics and replaces the main workout card (not a separate panel).

**Architecture:** Four focused changes: (1) date guard in week/today views for runway days before created_at; (2) CheckinModal gains inRunway prop + red-metrics gate before calling AI coach; (3) app/page.tsx removes the aiCoach state + AiCoachCard, reads directly from checkin.ai_coach_title to overlay the main workout card, adds yellow tip; (4) ai-coach prompt RULES updated to drop the medium-recovery rule. All changes are client-side except the prompt edit.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Tailwind CSS dark, Supabase, Gemini 2.5 Flash.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `app/week/page.tsx` | Modify | Skip rendering runway cards for days before `created_at` |
| `app/page.tsx` | Modify | Remove aiCoach state + AiCoachCard; overlay AI title/desc on workout card; yellow tip; pass inRunway to modal |
| `components/CheckinModal.tsx` | Modify | Add `inRunway` + `onAiResult` props; gate AI coach call to red metrics only |
| `app/api/ai-coach/route.ts` | Modify | Remove medium-recovery rule from prompt; tighten RULES to red-only intervention |
| `components/AiCoachCard.tsx` | Delete | No longer used |

---

## Task 1: Runway Day Guard in Week Tab

**Files:**
- Modify: `app/week/page.tsx`

During the runway week, some days in the 7-day grid predate the user's signup. Those days must render nothing at all — no card, no placeholder, no label.

The guard: `dateToString(day) >= dateToString(new Date(profile.created_at))`

Because `profile` is already in scope (used by `runwayPlan`), and `created_at` is typed as `string | undefined` in UserProfile, use `profile?.created_at` safely.

- [ ] **Step 1: Read `app/week/page.tsx`**

Read the file to locate the runway week `days.map` block (look for `{isRunwayWeek && days.map((day, i) =>`). You need to know the exact shape of the map callback.

- [ ] **Step 2: Add the pre-signup guard inside the runway `days.map`**

Inside `{isRunwayWeek && days.map((day, i) => {`, immediately after computing `dayStr = dateToString(day)`, add an early return:

```ts
          // Don't show runway cards for days before the user signed up
          const createdAtStr = profile?.created_at ? dateToString(new Date(profile.created_at)) : null;
          if (createdAtStr && dayStr < createdAtStr) return null;
```

Insert this after:
```ts
          const dayStr = dateToString(day);
```

And before:
```ts
          const isToday = dayStr === todayStr;
```

Full context — the map callback starts like this (find it and insert the guard lines after `dayStr`):

```ts
        {isRunwayWeek && days.map((day, i) => {
          const dayStr = dateToString(day);
          // ↑ INSERT GUARD HERE ↑
          const isToday = dayStr === todayStr;
          const rwDay = runwayPlan ? runwayPlan[i] : null;
```

After your insertion it should look like:

```ts
        {isRunwayWeek && days.map((day, i) => {
          const dayStr = dateToString(day);
          // Don't show runway cards for days before the user signed up
          const createdAtStr = profile?.created_at ? dateToString(new Date(profile.created_at)) : null;
          if (createdAtStr && dayStr < createdAtStr) return null;
          const isToday = dayStr === todayStr;
          const rwDay = runwayPlan ? runwayPlan[i] : null;
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/georgezim/projects/training-tracker/.claude/worktrees/awesome-meitner && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/week/page.tsx
git commit -m "fix: skip runway day cards that predate user signup"
```

---

## Task 2: AI Coach Card → Inline on Workout Card

**Files:**
- Modify: `app/page.tsx`
- Delete: `components/AiCoachCard.tsx`

### What changes in app/page.tsx

1. **Remove `aiCoach` state** — no longer needed; read directly from `checkin.ai_coach_title`
2. **Add `checkinTier()` helper** — pure function computing 'red' | 'yellow' | 'green' | 'none' from a checkin
3. **Add `onAiResult` prop to CheckinModal call** — when modal delivers AI result, update `checkin` state
4. **Remove `AiCoachCard` import and JSX** — no separate panel
5. **Workout card: overlay AI data** — title/description replaced when `checkin.ai_coach_title` exists; add "✦ Adapted by AI" badge
6. **Yellow tip** — small muted text below the workout card when tier is yellow
7. **Pass `inRunway` to CheckinModal** — so modal can skip the AI call during runway

- [ ] **Step 1: Read `app/page.tsx` in full**

Read the entire file. You need to understand:
- Line numbers for `aiCoach` state declaration (around line 188)
- The `AiCoachCard` import (around line 18)
- The `AiCoachCard` JSX (around line 611–617)
- The `onSave` callback inside `<CheckinModal>` (around line 736–741)
- The workout card `<h2>` and description `<p>` (around line 537–538)
- The `<div className="flex items-center gap-2 mb-1">` wrapper in the workout card

- [ ] **Step 2: Add `checkinTier` helper function**

Find the module-level helpers near the top of the file (where `recoveryTier`, `sleepTier`, `achillesTier` are defined — around lines 54–71). Add this function after them:

```ts
function checkinTier(ci: DailyCheckin | null): 'red' | 'yellow' | 'green' | 'none' {
  if (!ci) return 'none';
  // Red — meaningful intervention needed
  if (
    (ci.whoop_recovery != null && ci.whoop_recovery < 33) ||
    (ci.sleep_score != null && ci.sleep_score < 33) ||
    (ci.sleep_hours != null && ci.sleep_hours < 6) ||
    (ci.achilles_pain != null && ci.achilles_pain >= 4) ||
    ci.feeling === 'bad' || ci.feeling === 'injured'
  ) return 'red';
  // Yellow — slightly off, show tip only
  if (
    (ci.whoop_recovery != null && ci.whoop_recovery >= 33 && ci.whoop_recovery < 70) ||
    (ci.sleep_score != null && ci.sleep_score >= 33 && ci.sleep_score < 70) ||
    (ci.sleep_hours != null && ci.sleep_hours >= 6 && ci.sleep_hours < 7.5) ||
    ci.feeling === 'tired'
  ) return 'yellow';
  return 'green';
}
```

- [ ] **Step 3: Remove `aiCoach` state and `setAiCoach` usages**

Find and remove:
```ts
  // AI Coach — from Supabase checkin record
  const [aiCoach, setAiCoach] = useState<{ title: string; description: string } | null>(null);
```

Find and remove the block that sets aiCoach in the load() effect:
```ts
      // Load AI coach from checkin record
      if (ci?.ai_coach_title) {
        setAiCoach({ title: ci.ai_coach_title, description: ci.ai_coach_description ?? '' });
      }
```

- [ ] **Step 4: Remove AiCoachCard import**

Find:
```ts
import AiCoachCard from '@/components/AiCoachCard';
```
Remove it.

- [ ] **Step 5: Add `currentTier` derived value after the checkin state**

In the component body, after `const [checkin, setCheckin] = useState<DailyCheckin | null>(null);` (or wherever makes sense after the checkin is declared), add:

```ts
  const currentTier = checkinTier(checkin);
```

Place it near the other computed values like `planProfile`, `workout`, `racePlanInfo`.

- [ ] **Step 6: Update the workout card to overlay AI data and add badges**

In the workout card JSX (`{!inRunway && profile?.custom_plan && <div ...>`), find the inner structure:

```tsx
            <div className="flex items-center gap-2 mb-1">
              <span className="text-white/70 text-xs font-semibold uppercase tracking-widest">
                {workout.type === 'rest' ? 'Rest Day' : workout.type}
              </span>
              {session && (
                <span className="flex items-center gap-1 text-xs text-green-300 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                  Done
                </span>
              )}
            </div>
            <h2 className="text-white text-2xl font-bold leading-tight">{workout.label}</h2>
            <p className="text-white/75 text-sm mt-2 leading-relaxed">{workout.description}</p>
```

Replace with:

```tsx
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-white/70 text-xs font-semibold uppercase tracking-widest">
                {workout.type === 'rest' ? 'Rest Day' : workout.type}
              </span>
              {checkin?.ai_coach_title && (
                <span className="text-xs font-medium text-blue-300 bg-blue-900/40 px-2 py-0.5 rounded-full">✦ Adapted by AI</span>
              )}
              {session && (
                <span className="flex items-center gap-1 text-xs text-green-300 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                  Done
                </span>
              )}
            </div>
            <h2 className="text-white text-2xl font-bold leading-tight">
              {checkin?.ai_coach_title ?? workout.label}
            </h2>
            <p className="text-white/75 text-sm mt-2 leading-relaxed">
              {checkin?.ai_coach_description ?? workout.description}
            </p>
```

- [ ] **Step 7: Add yellow tip below the workout card**

Find the closing `</div>}` of the workout card (`{!inRunway && profile?.custom_plan && <div ...>...</div>}`). Immediately after it (and before `{/* ── Goal-based plan notice */}`), add:

```tsx
        {/* ── Yellow tip — shown when metrics are slightly off but not red ── */}
        {!inRunway && checkin && currentTier === 'yellow' && workout.type !== 'rest' && (
          <p className="text-gray-500 text-xs text-center px-2">Feeling a bit off today — ease into it if needed.</p>
        )}
```

- [ ] **Step 8: Remove AiCoachCard JSX**

Find and remove this block:
```tsx
        {/* ── AI Coach ── */}
        {aiCoach && (
          <AiCoachCard
            coach={aiCoach}
            onDismiss={() => setAiCoach(null)}
          />
        )}
```

- [ ] **Step 9: Update CheckinModal usage — add `inRunway` and `onAiResult` props**

Find the `<CheckinModal` usage in the JSX. Currently it has:
```tsx
        <CheckinModal
          profile={profile}
          planProfile={planProfile}
          userId={userId}
          todayStr={todayStr}
          onSave={(saved) => {
            setCheckin(saved);
            if (saved.ai_coach_title) {
              setAiCoach({ title: saved.ai_coach_title, description: saved.ai_coach_description ?? '' });
            }
```

Replace the full `<CheckinModal ...>` element with:
```tsx
        <CheckinModal
          profile={profile}
          planProfile={planProfile}
          userId={userId}
          todayStr={todayStr}
          inRunway={inRunway}
          onSave={(saved) => {
            setCheckin(saved);
          }}
          onAiResult={(title, desc) => {
            setCheckin(prev => prev ? { ...prev, ai_coach_title: title, ai_coach_description: desc } : prev);
          }}
```

Keep `onDismiss` and any other props that follow.

- [ ] **Step 10: Delete `components/AiCoachCard.tsx`**

```bash
rm /Users/georgezim/projects/training-tracker/.claude/worktrees/awesome-meitner/components/AiCoachCard.tsx
```

- [ ] **Step 11: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors. If TypeScript complains about `onAiResult` prop not existing on CheckinModal, that's expected — it will be fixed in Task 3.

If you get only the `onAiResult` / `inRunway` prop errors, that's fine — commit anyway and note them as expected to be fixed in Task 3.

- [ ] **Step 12: Commit**

```bash
git add app/page.tsx
git rm components/AiCoachCard.tsx
git commit -m "feat: AI coach overlays workout card inline; add yellow tip; remove AiCoachCard panel"
```

---

## Task 3: CheckinModal — inRunway Prop + Red-Only AI Gate

**Files:**
- Modify: `components/CheckinModal.tsx`

Add two new props:
- `inRunway: boolean` — when true, skip the AI coach call entirely
- `onAiResult?: (title: string, description: string) => void` — called after AI coach resolves, so the parent can update `checkin` state without a page reload

Gate the AI coach fetch: only call it when `!inRunway` AND the checkin metrics are in the red zone.

- [ ] **Step 1: Read `components/CheckinModal.tsx` in full**

Read the file. Note:
- The `Props` interface (around line 15–22)
- The `handleSave` function (around line 45–100)
- The `fetch('/api/ai-coach', ...)` call inside handleSave

- [ ] **Step 2: Add `isRedCheckin` helper and update `Props`**

At the top of the file, after the imports, add a helper function:

```ts
function isRedCheckin(
  whoop: number, sleep: number, sleepHours: number, achilles: number,
  feeling: FeelingType, hasTracker: boolean, hasInjuryNotes: boolean
): boolean {
  if (hasTracker && whoop < 33) return true;
  if (hasTracker && sleep < 33) return true;
  if (!hasTracker && sleepHours < 6) return true;
  if (hasInjuryNotes && achilles >= 4) return true;
  if (feeling === 'bad' || feeling === 'injured') return true;
  return false;
}
```

Then update the `Props` interface to add the two new props:

```ts
interface Props {
  profile: UserProfile | null;
  planProfile: PlanProfile | null;
  userId: string;
  todayStr: string;
  inRunway: boolean;
  onSave: (checkin: DailyCheckin) => void;
  onDismiss: () => void;
  onAiResult?: (title: string, description: string) => void;
}
```

Update the function signature to destructure the new props:

```ts
export default function CheckinModal({ profile, planProfile, userId, todayStr, inRunway, onSave, onDismiss, onAiResult }: Props) {
```

- [ ] **Step 3: Replace the AI coach fetch block in `handleSave`**

Find this block inside `handleSave` (the fetch call to `/api/ai-coach`):

```ts
      if (data) {
        const savedCheckin = data as DailyCheckin;
        // Call AI coach and persist to Supabase
        const workout = getWorkoutForDateWithProfile(new Date(), planProfile);
        fetch('/api/ai-coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plannedWorkout: workout, checkin: savedCheckin }),
        }).then(r => r.json()).then(async (coach) => {
          if (coach.title) {
            // Persist AI coach to the checkin record
            await supabase.from('daily_checkins').update({
              ai_coach_title: coach.title,
              ai_coach_description: coach.description ?? '',
            }).eq('id', savedCheckin.id);
            // Update the returned checkin with AI coach data
            savedCheckin.ai_coach_title = coach.title;
            savedCheckin.ai_coach_description = coach.description ?? '';
          }
        }).catch(() => {});
        onSave(savedCheckin);
        return;
      }
```

Replace with:

```ts
      if (data) {
        const savedCheckin = data as DailyCheckin;
        onSave(savedCheckin);

        // Only call AI coach when:
        // 1. Not in the runway/preparation period
        // 2. Metrics are in the red zone (meaningful intervention needed)
        const red = isRedCheckin(
          whoop, sleep, sleepHours, achilles, feeling,
          hasTracker, !!profile?.injury_notes
        );

        if (!inRunway && red) {
          const workout = getWorkoutForDateWithProfile(new Date(), planProfile);
          fetch('/api/ai-coach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plannedWorkout: workout, checkin: savedCheckin }),
          }).then(r => r.json()).then(async (coach) => {
            if (coach.title) {
              // Persist to daily_checkins
              await supabase.from('daily_checkins').update({
                ai_coach_title: coach.title,
                ai_coach_description: coach.description ?? '',
              }).eq('id', savedCheckin.id);
              // Notify parent so the workout card updates immediately
              onAiResult?.(coach.title, coach.description ?? '');
            }
          }).catch(() => {});
        }

        return;
      }
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors (including the app/page.tsx errors from Task 2 now resolving).

- [ ] **Step 5: Commit**

```bash
git add components/CheckinModal.tsx
git commit -m "feat: gate AI coach to red metrics only; skip during runway; add onAiResult callback"
```

---

## Task 4: Update AI Coach Prompt Rules

**Files:**
- Modify: `app/api/ai-coach/route.ts`

The AI coach is now only called when metrics are red. The prompt still contains a "Medium recovery" rule that is now dead logic. Remove it and sharpen the remaining rules to reflect that the coach is always responding to a real problem.

- [ ] **Step 1: Read `app/api/ai-coach/route.ts`**

Read the file. Find the `RULES:` section in the prompt (around line 110–117).

Current RULES:
```
RULES:
- High recovery (score ≥70% or sleep ≥7.5h, feeling great/good): do planned workout as-is or slightly harder
- Medium recovery (score 33-69% or sleep 6-7.5h, feeling tired): reduce intensity or volume ~20%
- Low recovery (score <33% or sleep <6h, feeling bad): switch to ${lowRecoveryAlternative}
- Achilles pain ≥4: no running, suggest ${achillesAlternative} instead
- Only ever suggest activities from the athlete's preferred activities list
- If athlete has missed multiple sessions this week, suggest catching up gently — don't overload
```

- [ ] **Step 2: Replace the RULES section**

Find the RULES block in the template literal and replace it with:

```
RULES (you are only called when the athlete's metrics are in the RED zone — this is a real intervention):
- Low recovery (score <33%) or poor sleep (<6h): replace today's session with ${lowRecoveryAlternative} — make it a genuine recovery day, not a scaled-down workout
- Achilles pain ≥4: no running at all — switch to ${achillesAlternative}
- Feeling "bad" or "injured": significantly reduce intensity or replace with recovery alternative
- Only suggest activities from the athlete's preferred activities list — never suggest forbidden activities
- Be specific: give exact duration, effort level, or exercises — vague advice is unhelpful
- If athlete has missed multiple sessions this week, acknowledge it; do not push harder than their body allows
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/ai-coach/route.ts
git commit -m "refactor: AI coach prompt — remove medium-recovery rule; sharpen for red-only invocation"
```

---

## Self-Review

### Spec Coverage

| Spec Requirement | Task |
|---|---|
| Runway day guard: never render days before created_at | Task 1 — `dateToString(day) >= dateToString(new Date(created_at))` guard in week map |
| Today tab: same guard | Implicit — today is always >= created_at; defensive guard not needed since `inRunway` already checks today < planStart, which means today > created_at by design |
| Week tab: days before signup render nothing | Task 1 — `return null` for those days |
| AI coach disabled during runway | Task 3 — `if (!inRunway && red)` gate in CheckinModal |
| Red metrics → call AI coach | Task 3 — `isRedCheckin()` helper |
| Yellow metrics → show tip, no AI call | Task 2 — yellow tip JSX; Task 3 — AI call only on red |
| Green → normal plan, no tip | Task 2 — `currentTier === 'yellow'` gate on tip |
| AI coach result replaces main card title/description | Task 2 — `checkin?.ai_coach_title ?? workout.label` |
| "✦ Adapted by AI" badge on card | Task 2 — badge in workout card header |
| Remove separate AI coach panel | Task 2 — AiCoachCard removed from JSX + file deleted |
| Done/Didn't Do buttons unchanged | Task 2 — only the title/description/badge lines changed, button block unchanged |
| Update AI coach prompt RULES | Task 4 — medium-recovery rule removed |
| onAiResult: card updates immediately after check-in | Tasks 2+3 — callback updates checkin state in parent |

### Placeholder Scan
None — all code blocks are complete.

### Type Consistency
- `isRedCheckin` in CheckinModal takes the local slider state values (number/FeelingType), not the DailyCheckin type
- `checkinTier` in page.tsx takes the DailyCheckin object after load
- Both produce 'red'/'yellow'/'green' consistently — the conditions are the same, just different inputs
- `onAiResult?: (title: string, description: string) => void` — consistent between Props and call site in page.tsx
