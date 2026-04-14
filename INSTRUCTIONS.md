# Dromos — Claude Code Instructions

## What This App Is

**Dromos** (Δρόμος — Greek for "road") is an adaptive training app for recreational endurance athletes. It generates personalized training plans and adapts daily sessions based on recovery metrics, sleep, Strava data, and how the user actually feels.

**The core loop:** User checks in each morning → app adjusts today's session based on their data → user trains → data feeds back into tomorrow's adaptation.

**This is a learning/side project with commercial intent.** Build clean, production-quality code. No hacks, no hardcodes for specific users.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS — dark theme, mobile-first |
| Database | Supabase (PostgreSQL + Auth + RLS) |
| Hosting | Vercel |
| PWA | Service worker + manifest.json |
| AI Coach | Gemini 1.5 Flash (via @google/generative-ai) |
| External APIs | Strava OAuth + Activities API |

---

## Project Structure

```
app/
  (auth)/login        — Login page
  (auth)/signup       — Signup page
  api/ai-coach        — POST: generate adapted session using Gemini + user data
  api/auth/logout     — Sign out
  api/strava/         — Strava OAuth + activity sync
  checkin/            — Daily check-in form
  history/            — Past check-ins with metrics
  onboarding/         — First-time user setup (goal, race date, schedule, level, injuries)
  sessions/           — Strava activity list with sync
  week/               — Full week view
  page.tsx            — Today (home screen)
components/
  AiCoachCard         — Displays AI coach adapted session
  BottomNav           — Tab bar navigation
  CheckinModal        — Daily check-in popup
  StravaActivityCard  — Shows today's Strava activity vs plan
  WorkoutDetailSheet  — Full workout breakdown slide-up
lib/
  training-plan.ts    — All plan logic (phases, workouts, race-relative calculation)
  supabase.ts         — Client-side Supabase client + types
  supabase-server.ts  — Server-side Supabase client
  strava.ts           — Strava API helpers
  api-auth.ts         — Auth helper for API routes
  useStravaActivity.ts — Hook for today's Strava activity
supabase/migrations/  — SQL migration files (run in order in Supabase SQL Editor)
public/
  manifest.json       — PWA manifest
  sw.js               — Service worker
```

---

## Database Tables

| Table | Purpose |
|---|---|
| `profiles` | User profile: goal, race_date, days_per_week, training_level, age, injury_notes, preferred_long_day, races (jsonb), equipment (jsonb) |
| `daily_checkins` | Per-day: whoop_recovery, sleep_score, sleep_hours, achilles_pain, feeling, notes, ai_coach_title, ai_coach_description |
| `completed_sessions` | Which sessions were done/missed, with missed_reason |
| `strava_tokens` | OAuth tokens per user |
| `strava_activities` | Imported Strava activities |

All tables use `user_id uuid` referencing `auth.users(id)`. RLS is enabled on all tables — policies enforce `user_id = auth.uid()`.

---

## Training Plan Logic — Critical Rules

**The plan MUST be user-specific, not hardcoded to any person or date.**

### How plan generation works
1. Read `profile.race_date` and `profile.goal`
2. Calculate weeks from today to race date
3. Assign phases proportionally:
   - Base: 30% of total weeks
   - Build/Volume: 40%
   - Race-specific: 20%
   - Taper: 10% (min 2 weeks, max 4 weeks)
4. Determine current phase and week within phase
5. Return the appropriate workout

### If no race date is set
- `marathon` goal → anchor to `profile.created_at` + 20 weeks
- `half_marathon` → `created_at` + 16 weeks
- `10k` → `created_at` + 10 weeks
- `get_fit` / `lose_weight` / `other` → perpetual rotating weekly template (no phases)

### Day-of-week structure (standard week)
- **Monday** — Run (easy early phases → tempo/MP later phases)
- **Tuesday** — Gym (strength class + eccentric heel drops)
- **Wednesday** — Bike (Zone 2, aerobic base)
- **Thursday** — Gym (+ short easy run from Phase 3 onwards)
- **Friday** — REST
- **Saturday** — Long Run (THE most important session)
- **Sunday** — REST

### NEVER hardcode dates
Do not hardcode `new Date(2026, 3, 13)` or any other specific date as the plan start. Always derive from user profile.

---

## AI Coach Rules

The AI coach (Gemini 1.5 Flash) adapts today's planned workout based on:
- Today's check-in: whoop_recovery, sleep_score, sleep_hours, achilles_pain, feeling, notes
- Last 7 days of Strava activities
- Last 7 days of completed_sessions (done/missed)
- User profile: goal, level, age, injury_notes

**Adaptation rules (enforce in prompt):**
- Recovery ≥70% OR sleep ≥7.5h + feeling great/good → do planned session as-is or push slightly
- Recovery 33-69% OR sleep 6-7.5h + feeling tired → reduce intensity or volume ~20%
- Recovery <33% OR sleep <6h + feeling bad → swap to easy bike or full rest
- Achilles pain ≥4 → no running at all, bike or upper body only

**AI coach output is saved to `daily_checkins.ai_coach_title` and `daily_checkins.ai_coach_description`. Never use localStorage for this.**

---

## UI/UX Rules

- **Dark theme only.** Background: `bg-gray-950`. Cards: `bg-gray-900`. Header: `bg-[#1B2A4A]`.
- **Mobile-first.** Max width `max-w-md mx-auto` on all pages.
- **Bottom tab navigation** via `<BottomNav>` component. Tabs: Today, Week, Check-in, Sessions, History.
- **Safe area insets** on headers: `paddingTop: 'max(env(safe-area-inset-top), 2.5rem)'`
- **Color coding:**
  - Run → blue (`bg-blue-600`, `text-blue-400`)
  - Gym → purple (`bg-purple-600`, `text-purple-400`)
  - Bike → orange (`bg-orange-500`, `text-orange-400`)
  - Rest → gray (`bg-gray-700`, `text-gray-500`)
  - Race → red (`bg-red-600`, `text-red-400`)
- **Metric color tiers:**
  - Recovery/Sleep: ≥70% green, 33-69% yellow, <33% red
  - Achilles pain: 0 green, 1-3 yellow, 4-10 red
- **Active states:** Use `active:scale-95 transition-transform` on tappable elements
- **No light mode.** Don't add theme toggles.

---

## Auth Flow

- Users sign up/log in via Supabase Auth (email + password)
- After first login, if `profiles.goal` is null → redirect to `/onboarding`
- Middleware (`middleware.ts`) handles redirect logic
- API routes use `getAuthUserId()` from `lib/api-auth.ts`

---

## What NOT to Do

- **Never hardcode a specific user's training plan dates.** All plan logic must be derived from the user's profile.
- **Never use localStorage for persistent data.** Supabase is the source of truth. localStorage is only acceptable for ephemeral UI state (e.g. "has this modal been shown today").
- **Never break Strava integration.** The OAuth flow, token refresh, and activity sync are working — do not refactor them without explicit instruction.
- **Never change the onboarding flow** unless explicitly asked. It works.
- **Never add a light mode.**
- **Never use `getWorkoutForDate` directly** in pages — always use `getWorkoutForDateWithProfile` with the user's profile passed in.
- **Never store secrets in client-side code.** API keys (Gemini, Strava) belong in environment variables, server-side only.

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL          — Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY     — Supabase anon key (public)
SUPABASE_SERVICE_ROLE_KEY         — Supabase service role key (server only)
GEMINI_API_KEY                    — Google Gemini API key (server only)
STRAVA_CLIENT_ID                  — Strava app client ID
STRAVA_CLIENT_SECRET              — Strava app client secret
NEXTAUTH_URL / NEXT_PUBLIC_APP_URL — Public app URL (for OAuth callbacks)
```

---

## Running Locally

```bash
npm install
npm run dev
# → http://localhost:3000
```

---

## Current Status (April 2026)

**Working:**
- Auth (signup/login/logout)
- Onboarding flow
- Today page with workout display, check-in, session completion (done/missed)
- Daily check-in form
- Week view
- History page
- Strava OAuth + activity sync + sessions list
- AI coach (Gemini, rule-based adaptation)
- PWA (manifest + service worker)
- Race countdown and race editor

**Known issues to fix:**
- Training plan is partially hardcoded — needs to be fully user-driven from race_date in profile
- AI coach result stored in localStorage — should be persisted to daily_checkins table
- Some pages call getWorkoutForDate instead of getWorkoutForDateWithProfile
- App name in some places still says "Training Tracker" instead of "Dromos"
