# Auth, Multi-User & AI Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email/password auth, scope all data per user (proper multi-user), and an AI workout coach that adapts today's session after Whoop check-in.

**Architecture:** Supabase Auth handles identity; every DB table gets `user_id` with RLS so each user only sees their own data. Server-side API routes use the service role key and extract `user_id` from the JWT in the request. The AI coach is a Next.js API route that calls Claude with the user's planned workout, today's Whoop data, and recent Strava load — returning a personalized adaptation shown on the Home tab.

**Tech Stack:** Next.js 16 App Router, Supabase Auth + RLS, `@supabase/ssr`, Anthropic SDK (`@anthropic-ai/sdk`), Tailwind CSS

---

## File Map

### New files
- `middleware.ts` — protect all app routes, redirect unauthenticated users to `/login`
- `lib/supabase-server.ts` — server-side Supabase client that reads auth cookie
- `app/(auth)/login/page.tsx` — email + password login form
- `app/(auth)/signup/page.tsx` — signup form (name, email, password, goal, training level)
- `app/(auth)/layout.tsx` — minimal layout for auth pages (no BottomNav)
- `app/api/auth/logout/route.ts` — server action to sign out
- `app/api/ai-coach/route.ts` — AI workout adaptation endpoint
- `components/AiCoachCard.tsx` — card shown on Home with AI-suggested workout
- `supabase/migrations/003_auth_multiuser.sql` — add user_id to all tables, RLS policies, profiles table

### Modified files
- `package.json` — add `@supabase/ssr`, `@anthropic-ai/sdk`
- `lib/supabase.ts` — add `createBrowserClient` helper for auth-aware client
- `app/layout.tsx` — no changes needed (middleware handles redirects)
- `app/page.tsx` — read user from session, trigger AI coach after check-in
- `app/checkin/page.tsx` — after save, call AI coach API
- `app/history/page.tsx` — scope to user (automatic via RLS)
- `app/week/page.tsx` — scope to user (automatic via RLS)
- `app/sessions/page.tsx` — scope to user (automatic via RLS)
- `app/api/strava/callback/route.ts` — use `user_id` from JWT, not hardcoded `id=1`
- `app/api/strava/activities/route.ts` — filter strava data by `user_id`
- `app/api/strava/status/route.ts` — check tokens by `user_id`
- `.env.local` — add `ANTHROPIC_API_KEY`

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
cd /Users/georgezim/projects/training-tracker/.claude/worktrees/awesome-meitner
npm install @supabase/ssr @anthropic-ai/sdk
```

Expected output: added 2 packages

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add @supabase/ssr and @anthropic-ai/sdk"
```

---

## Task 2: Database migration — add user_id + RLS + profiles

**Files:**
- Create: `supabase/migrations/003_auth_multiuser.sql`

This migration: creates a `profiles` table, adds `user_id` to all existing tables, enables RLS on all tables, adds policies so users only see their own rows, and migrates existing data to a dummy user so nothing breaks.

- [ ] **Step 1: Write migration file**

```sql
-- supabase/migrations/003_auth_multiuser.sql

-- ── Profiles (extends auth.users) ────────────────────────────────────────────
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text,
  goal          text,       -- 'marathon', 'get_fit', 'lose_weight', 'half_marathon'
  training_level text,      -- 'beginner', 'intermediate', 'advanced'
  plan_start    date,
  target_race   date,
  created_at    timestamptz default now()
);

alter table profiles enable row level security;
create policy "users manage own profile"
  on profiles for all using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, name)
  values (new.id, new.raw_user_meta_data->>'name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Add user_id to existing tables ───────────────────────────────────────────
alter table daily_checkins     add column if not exists user_id uuid references auth.users(id);
alter table completed_sessions add column if not exists user_id uuid references auth.users(id);
alter table strava_tokens      add column if not exists user_id uuid references auth.users(id);
alter table strava_activities  add column if not exists user_id uuid references auth.users(id);

-- ── RLS on all tables ─────────────────────────────────────────────────────────
alter table daily_checkins     enable row level security;
alter table completed_sessions enable row level security;
alter table strava_tokens      enable row level security;
alter table strava_activities  enable row level security;

-- daily_checkins
create policy "users manage own checkins"
  on daily_checkins for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- completed_sessions
create policy "users manage own sessions"
  on completed_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- strava_tokens (server only via service role — but add policy for safety)
create policy "users manage own strava tokens"
  on strava_tokens for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- strava_activities (server only via service role)
create policy "users manage own strava activities"
  on strava_activities for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Drop old single-user strava_tokens primary key constraint ─────────────────
-- The old table used id=1 as a single-row hack. Replace with user_id as PK.
alter table strava_tokens drop constraint if exists strava_tokens_pkey;
alter table strava_tokens add column if not exists token_id uuid default gen_random_uuid();
alter table strava_tokens add primary key (token_id);
-- Add unique constraint so each user has one token row
create unique index if not exists strava_tokens_user_idx on strava_tokens(user_id);
```

- [ ] **Step 2: Run in Supabase SQL Editor**

Go to Supabase → SQL Editor → paste and run. Verify no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/003_auth_multiuser.sql
git commit -m "feat: add user_id, RLS policies, and profiles table"
```

---

## Task 3: Server-side Supabase client + middleware

**Files:**
- Create: `lib/supabase-server.ts`
- Create: `middleware.ts`

- [ ] **Step 1: Create server Supabase client**

```typescript
// lib/supabase-server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}

export async function getUser() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
```

- [ ] **Step 2: Create middleware**

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/signup', '/api/'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icon.svg|.*\\.png).*)'],
};
```

- [ ] **Step 3: Commit**

```bash
git add lib/supabase-server.ts middleware.ts
git commit -m "feat: add server Supabase client and auth middleware"
```

---

## Task 4: Update browser Supabase client for auth

**Files:**
- Modify: `lib/supabase.ts`

- [ ] **Step 1: Update supabase.ts to use SSR browser client**

```typescript
// lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr';

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type FeelingType = 'great' | 'good' | 'tired' | 'bad' | 'injured';
export type SessionType = 'run' | 'gym' | 'bike' | 'race';

export interface DailyCheckin {
  id: string;
  user_id: string;
  date: string;
  whoop_recovery: number | null;
  sleep_score: number | null;
  achilles_pain: number | null;
  feeling: FeelingType | null;
  notes: string | null;
  created_at: string;
}

export interface CompletedSession {
  id: string;
  user_id: string;
  date: string;
  session_type: SessionType;
  completed: boolean;
  created_at: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/supabase.ts
git commit -m "feat: switch to @supabase/ssr browser client"
```

---

## Task 5: Login page

**Files:**
- Create: `app/(auth)/layout.tsx`
- Create: `app/(auth)/login/page.tsx`

- [ ] **Step 1: Create auth layout (no BottomNav)**

```typescript
// app/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create login page**

```typescript
// app/(auth)/login/page.tsx
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/');
      router.refresh();
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-white text-2xl font-bold">Training Tracker</h1>
        <p className="text-gray-500 text-sm mt-1">Sign in to your account</p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="text-gray-400 text-xs font-medium block mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500"
            placeholder="you@email.com"
          />
        </div>

        <div>
          <label className="text-gray-400 text-xs font-medium block mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-950/50 border border-red-800/40 rounded-xl px-4 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm disabled:opacity-60 active:scale-95 transition-transform"
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      <p className="text-center text-gray-500 text-sm mt-6">
        No account?{' '}
        <Link href="/signup" className="text-blue-400 font-medium">Create one</Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(auth\)/
git commit -m "feat: add login page"
```

---

## Task 6: Signup page (with onboarding)

**Files:**
- Create: `app/(auth)/signup/page.tsx`

- [ ] **Step 1: Create signup page**

```typescript
// app/(auth)/signup/page.tsx
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const GOALS = [
  { value: 'marathon',      label: 'Run a Marathon' },
  { value: 'half_marathon', label: 'Run a Half Marathon' },
  { value: 'get_fit',       label: 'Get Fit' },
  { value: 'lose_weight',   label: 'Lose Weight' },
];

const LEVELS = [
  { value: 'beginner',     label: 'Beginner — new to running' },
  { value: 'intermediate', label: 'Intermediate — run regularly' },
  { value: 'advanced',     label: 'Advanced — racing experience' },
];

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<'account' | 'goals'>('account');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [goal, setGoal] = useState('marathon');
  const [level, setLevel] = useState('intermediate');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (step === 'account') { setStep('goals'); return; }

    setLoading(true);
    setError('');

    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    if (signupError) {
      setError(signupError.message);
      setLoading(false);
      return;
    }

    // Save goal + level to profile
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        name,
        goal,
        training_level: level,
      });
    }

    router.push('/');
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-white text-2xl font-bold">Training Tracker</h1>
        <p className="text-gray-500 text-sm mt-1">
          {step === 'account' ? 'Create your account' : 'Tell us about you'}
        </p>
      </div>

      <form onSubmit={handleSignup} className="space-y-4">
        {step === 'account' && (
          <>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="George"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="you@email.com"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="Min 6 characters"
              />
            </div>
          </>
        )}

        {step === 'goals' && (
          <>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-2">What's your goal?</label>
              <div className="grid grid-cols-2 gap-2">
                {GOALS.map(g => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => setGoal(g.value)}
                    className={`py-3 px-3 rounded-xl text-sm font-medium text-left transition-colors ${
                      goal === g.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-900 text-gray-400 border border-gray-800'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-gray-400 text-xs font-medium block mb-2">Training level</label>
              <div className="space-y-2">
                {LEVELS.map(l => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => setLevel(l.value)}
                    className={`w-full py-3 px-4 rounded-xl text-sm font-medium text-left transition-colors ${
                      level === l.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-900 text-gray-400 border border-gray-800'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {error && (
          <p className="text-red-400 text-sm bg-red-950/50 border border-red-800/40 rounded-xl px-4 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm disabled:opacity-60 active:scale-95 transition-transform"
        >
          {loading ? 'Creating account…' : step === 'account' ? 'Continue →' : 'Start Training'}
        </button>
      </form>

      {step === 'account' && (
        <p className="text-center text-gray-500 text-sm mt-6">
          Have an account?{' '}
          <Link href="/login" className="text-blue-400 font-medium">Sign in</Link>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(auth)/signup/page.tsx"
git commit -m "feat: add signup page with goal/level onboarding"
```

---

## Task 7: Logout API route + add logout to app

**Files:**
- Create: `app/api/auth/logout/route.ts`
- Modify: `app/page.tsx` — add logout button in header

- [ ] **Step 1: Create logout route**

```typescript
// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';

export async function POST() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(
    new URL('/login', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
  );
}
```

- [ ] **Step 2: Add logout button to Home header**

In `app/page.tsx`, replace the `<h1>Training Tracker</h1>` line with:

```tsx
<div className="flex items-center justify-between">
  <h1 className="text-white text-xl font-bold tracking-tight">Training Tracker</h1>
  <form action="/api/auth/logout" method="POST">
    <button type="submit" className="text-gray-500 text-xs px-2 py-1">Sign out</button>
  </form>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/logout/route.ts app/page.tsx
git commit -m "feat: add logout route and sign-out button"
```

---

## Task 8: Scope all DB writes to user_id

All pages that write to Supabase need to include `user_id`. The `supabase` browser client with Supabase Auth automatically sends the JWT, so RLS enforces read scoping. For writes we need to explicitly include `user_id`.

**Files:**
- Modify: `app/page.tsx` — add user_id to completed_sessions upsert
- Modify: `app/checkin/page.tsx` — add user_id to daily_checkins upsert

- [ ] **Step 1: Read current checkin page**

Read `app/checkin/page.tsx` fully to find the upsert call.

- [ ] **Step 2: Update checkin upsert to include user_id**

Find the supabase upsert in `app/checkin/page.tsx`. Add user_id fetch before it:

```typescript
// At top of the submit handler, get the current user:
const { data: { user } } = await supabase.auth.getUser();
if (!user) return;

// Then include user_id in the upsert:
await supabase.from('daily_checkins').upsert({
  user_id: user.id,
  date: todayStr,
  whoop_recovery: whoopRecovery ? parseInt(whoopRecovery) : null,
  sleep_score: sleepScore ? parseInt(sleepScore) : null,
  achilles_pain: achillesPain ? parseInt(achillesPain) : null,
  feeling: feeling || null,
  notes: notes || null,
}, { onConflict: 'user_id,date' });
```

Note: also update the `onConflict` to `'user_id,date'` — requires a unique index on `(user_id, date)`. Add to migration 003:
```sql
create unique index if not exists daily_checkins_user_date_idx on daily_checkins(user_id, date);
create unique index if not exists completed_sessions_user_date_type_idx on completed_sessions(user_id, date, session_type);
```

- [ ] **Step 3: Update completed_sessions upsert in app/page.tsx**

```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) return;

await supabase.from('completed_sessions').upsert({
  user_id: user.id,
  date: todayStr,
  session_type: workout.type,
  completed: true,
}, { onConflict: 'user_id,date,session_type' });
```

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/checkin/page.tsx supabase/migrations/003_auth_multiuser.sql
git commit -m "feat: scope all DB writes to user_id"
```

---

## Task 9: Fix Strava routes to use user_id from JWT

Replace the hardcoded `id=1` single-user hack with proper per-user token storage.

**Files:**
- Modify: `app/api/strava/callback/route.ts`
- Modify: `app/api/strava/activities/route.ts`
- Modify: `app/api/strava/status/route.ts`

- [ ] **Step 1: Add JWT user extraction helper**

Add this function to each Strava API route file (or extract to `lib/api-auth.ts`):

```typescript
// lib/api-auth.ts
import { createClient } from '@supabase/supabase-js';

export async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization') ?? '';
  // The browser sends the JWT via cookie; use service role to verify
  const token = authHeader.replace('Bearer ', '');
  if (!token) return null;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: { user } } = await supabase.auth.getUser(token);
  return user?.id ?? null;
}
```

Actually, for cookie-based sessions (App Router), use the server client instead:

```typescript
// lib/api-auth.ts
import { createSupabaseServer } from './supabase-server';

export async function getAuthUserId(): Promise<string | null> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}
```

- [ ] **Step 2: Update strava/callback/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUserId } from '@/lib/api-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/?strava=denied`);
  }

  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  const tokenRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  });

  const tokenBody = await tokenRes.json();
  if (!tokenRes.ok) {
    const errMsg = encodeURIComponent(JSON.stringify(tokenBody));
    return NextResponse.redirect(`${appUrl}/?strava=error&detail=${errMsg}`);
  }

  const { error: dbError } = await supabase.from('strava_tokens').upsert({
    user_id: userId,
    athlete_id: tokenBody.athlete.id,
    access_token: tokenBody.access_token,
    refresh_token: tokenBody.refresh_token,
    expires_at: tokenBody.expires_at,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (dbError) {
    const errMsg = encodeURIComponent(dbError.message);
    return NextResponse.redirect(`${appUrl}/?strava=dberror&detail=${errMsg}`);
  }

  return NextResponse.redirect(`${appUrl}/?strava=connected`);
}
```

- [ ] **Step 3: Update strava/status/route.ts**

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUserId } from '@/lib/api-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ connected: false, activityCount: 0 });

  const { data } = await supabase
    .from('strava_tokens')
    .select('athlete_id')
    .eq('user_id', userId)
    .maybeSingle();

  const { count } = await supabase
    .from('strava_activities')
    .select('strava_id', { count: 'exact', head: true })
    .eq('user_id', userId);

  return NextResponse.json({ connected: !!data, activityCount: count ?? 0 });
}
```

- [ ] **Step 4: Update strava/activities/route.ts**

Add `user_id` filtering to `getFreshToken`, `fetchAllActivities`, and the upsert. Replace the whole file:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUserId } from '@/lib/api-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getFreshToken(userId: string): Promise<string | null> {
  const { data: row } = await supabase
    .from('strava_tokens').select('*').eq('user_id', userId).maybeSingle();
  if (!row) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  if (row.expires_at < nowSec + 300) {
    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: row.refresh_token,
      }),
    });
    if (!res.ok) return null;
    const fresh = await res.json();
    await supabase.from('strava_tokens').update({
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token,
      expires_at: fresh.expires_at,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
    return fresh.access_token;
  }
  return row.access_token;
}

async function fetchAllActivities(token: string): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=200&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) break;
    const batch = await res.json();
    if (!batch || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 200) break;
    page++;
  }
  return all;
}

function toRow(a: any, userId: string) {
  return {
    user_id: userId,
    strava_id: a.id,
    activity_date: a.start_date_local.slice(0, 10),
    name: a.name,
    sport_type: a.sport_type,
    distance_m: a.distance,
    moving_time_s: a.moving_time,
    elevation_m: a.total_elevation_gain,
    avg_heartrate: a.average_heartrate ?? null,
    max_heartrate: a.max_heartrate ?? null,
    avg_speed_ms: a.average_speed,
    strava_url: `https://www.strava.com/activities/${a.id}`,
    raw: a,
    synced_at: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateFilter = searchParams.get('date');
  const fullSync = searchParams.get('full') === '1';

  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ connected: false, activities: [] });

  const { data: tokenRow } = await supabase
    .from('strava_tokens').select('athlete_id').eq('user_id', userId).maybeSingle();
  if (!tokenRow) return NextResponse.json({ connected: false, activities: [] });

  if (dateFilter && !fullSync) {
    const { data: cached } = await supabase
      .from('strava_activities').select('*')
      .eq('user_id', userId).eq('activity_date', dateFilter)
      .order('synced_at', { ascending: false });
    if (cached && cached.length > 0) {
      return NextResponse.json({ connected: true, activities: cached, source: 'cache' });
    }
  }

  const token = await getFreshToken(userId);
  if (!token) return NextResponse.json({ connected: false, activities: [] });

  const activities = await fetchAllActivities(token);

  if (activities.length > 0) {
    const rows = activities.map(a => toRow(a, userId));
    for (let i = 0; i < rows.length; i += 100) {
      await supabase.from('strava_activities')
        .upsert(rows.slice(i, i + 100), { onConflict: 'strava_id' });
    }
  }

  if (dateFilter) {
    const filtered = activities.filter((a: any) => a.start_date_local.slice(0, 10) === dateFilter);
    return NextResponse.json({ connected: true, activities: filtered, source: 'strava', total: activities.length });
  }
  return NextResponse.json({ connected: true, activities, source: 'strava', total: activities.length });
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/api-auth.ts app/api/strava/
git commit -m "feat: scope Strava routes to authenticated user_id"
```

---

## Task 10: AI Coach API route

**Files:**
- Create: `app/api/ai-coach/route.ts`

The AI coach is called after a Whoop check-in is saved. It receives: today's planned workout, Whoop recovery + sleep + Achilles data, last 7 days of Strava activities, and the user's profile (goal, level). It returns a short adapted workout suggestion.

- [ ] **Step 1: Add ANTHROPIC_API_KEY to .env.local**

```bash
echo "ANTHROPIC_API_KEY=your_key_here" >> .env.local
```

Also add it to Vercel env vars.

- [ ] **Step 2: Create AI coach route**

```typescript
// app/api/ai-coach/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { getAuthUserId } from '@/lib/api-auth';
import { mpsToMinPerKm, metersToKm, secondsToDuration } from '@/lib/strava';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { plannedWorkout, checkin } = await req.json();

  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', userId).maybeSingle();

  // Fetch last 7 days of Strava activities
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const { data: recentActivities } = await supabase
    .from('strava_activities')
    .select('activity_date, sport_type, distance_m, moving_time_s, avg_heartrate, avg_speed_ms')
    .eq('user_id', userId)
    .gte('activity_date', sevenDaysAgo.toISOString().slice(0, 10))
    .order('activity_date', { ascending: false });

  const recentSummary = (recentActivities ?? []).map(a =>
    `${a.activity_date}: ${a.sport_type} — ${metersToKm(a.distance_m)}km in ${secondsToDuration(a.moving_time_s)} @ ${mpsToMinPerKm(a.avg_speed_ms)}${a.avg_heartrate ? `, avg HR ${Math.round(a.avg_heartrate)}bpm` : ''}`
  ).join('\n') || 'No recent activities recorded.';

  const prompt = `You are a personal running coach. Adapt today's planned workout based on this athlete's data.

ATHLETE PROFILE:
- Goal: ${profile?.goal ?? 'marathon'}
- Training level: ${profile?.training_level ?? 'intermediate'}

TODAY'S PLANNED WORKOUT:
${plannedWorkout.label}: ${plannedWorkout.description}

TODAY'S WHOOP DATA:
- Recovery score: ${checkin.whoop_recovery ?? 'not logged'}%
- Sleep score: ${checkin.sleep_score ?? 'not logged'}%
- Achilles pain: ${checkin.achilles_pain ?? 'none'}/10
- Feeling: ${checkin.feeling ?? 'not logged'}
- Notes: ${checkin.notes ?? 'none'}

LAST 7 DAYS OF TRAINING:
${recentSummary}

INSTRUCTIONS:
- If recovery is 70%+: athlete can do the planned workout as-is or slightly harder
- If recovery is 33–69%: reduce intensity or volume by 20%, keep the session type
- If recovery is below 33%: recommend switching to easy bike/walk or rest
- If Achilles pain is 4+: remove all running, suggest bike or gym upper body only
- Keep your response SHORT: 2-3 sentences max. Start with the adapted workout, then briefly explain why.
- Format: first line = adapted workout title, second line = what to do, third line = why (based on their data)
- Be direct and specific with distances/durations.`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const lines = text.trim().split('\n').filter(Boolean);

  return NextResponse.json({
    title: lines[0] ?? plannedWorkout.label,
    description: lines.slice(1).join(' '),
    raw: text,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/ai-coach/route.ts
git commit -m "feat: add AI coach endpoint using Claude Haiku"
```

---

## Task 11: AI Coach card on Home tab

**Files:**
- Create: `components/AiCoachCard.tsx`
- Modify: `app/checkin/page.tsx` — trigger AI coach after save
- Modify: `app/page.tsx` — display AI coach card

- [ ] **Step 1: Create AiCoachCard component**

```typescript
// components/AiCoachCard.tsx
'use client';

interface AiCoach {
  title: string;
  description: string;
}

interface Props {
  coach: AiCoach;
  loading?: boolean;
  onDismiss: () => void;
}

export default function AiCoachCard({ coach, loading, onDismiss }: Props) {
  if (loading) {
    return (
      <div className="bg-indigo-950/50 border border-indigo-700/40 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-indigo-400 text-sm">✦</span>
          <span className="text-indigo-300 text-xs font-semibold uppercase tracking-wide">AI Coach</span>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-indigo-900/60 rounded-full w-3/4 animate-pulse" />
          <div className="h-3 bg-indigo-900/60 rounded-full w-full animate-pulse" />
          <div className="h-3 bg-indigo-900/60 rounded-full w-2/3 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-indigo-950/50 border border-indigo-700/40 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-indigo-400 text-sm">✦</span>
          <span className="text-indigo-300 text-xs font-semibold uppercase tracking-wide">AI Coach</span>
        </div>
        <button onClick={onDismiss} className="text-indigo-600 text-lg leading-none">×</button>
      </div>
      <p className="text-white text-sm font-semibold leading-tight">{coach.title}</p>
      <p className="text-indigo-200/80 text-sm mt-1 leading-relaxed">{coach.description}</p>
    </div>
  );
}
```

- [ ] **Step 2: After check-in save, call AI coach**

In `app/checkin/page.tsx`, after the successful upsert, add:

```typescript
// After saving checkin, trigger AI coach (fire and forget — store result in localStorage)
const workout = getWorkoutForDate(new Date());
fetch('/api/ai-coach', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ plannedWorkout: workout, checkin: savedCheckin }),
}).then(r => r.json()).then(coach => {
  localStorage.setItem('ai_coach_today', JSON.stringify({
    ...coach,
    date: todayStr,
  }));
});
```

- [ ] **Step 3: Display AI coach card on Home**

In `app/page.tsx`, add state and display:

```typescript
// Add state:
const [aiCoach, setAiCoach] = useState<{ title: string; description: string } | null>(null);

// Load from localStorage in useEffect:
useEffect(() => {
  const stored = localStorage.getItem('ai_coach_today');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed.date === todayStr) setAiCoach(parsed);
    } catch {}
  }
}, [todayStr]);

// Display between warnings and Strava section:
{aiCoach && (
  <AiCoachCard
    coach={aiCoach}
    onDismiss={() => {
      setAiCoach(null);
      localStorage.removeItem('ai_coach_today');
    }}
  />
)}
```

- [ ] **Step 4: Commit**

```bash
git add components/AiCoachCard.tsx app/checkin/page.tsx app/page.tsx
git commit -m "feat: show AI coach adaptation on Home after check-in"
```

---

## Task 12: Final — update Vercel env vars + push PR

- [ ] **Step 1: Add to Vercel environment variables**

```
ANTHROPIC_API_KEY = <your key from console.anthropic.com>
SUPABASE_SERVICE_ROLE_KEY = <already set>
NEXT_PUBLIC_APP_URL = https://training-tracker-steel-nine.vercel.app
STRAVA_CLIENT_ID = 223608
STRAVA_CLIENT_SECRET = 7187a927ecc80274811b006d0d270f368d28b68d
```

- [ ] **Step 2: Push and merge PR**

```bash
git push
gh pr merge --squash
```

---

## Self-Review

**Spec coverage:**
- ✅ Email + password auth (Tasks 5, 6)
- ✅ Multi-user: every table has user_id, RLS enforced (Tasks 2, 8, 9)
- ✅ Strava per-user, no hardcoded id=1 (Task 9)
- ✅ Onboarding: goal + training level captured (Task 6)
- ✅ AI adapts workout after Whoop check-in (Tasks 10, 11)
- ✅ Logout (Task 7)
- ✅ Middleware protects all routes (Task 3)

**Gaps to watch:**
- The `daily_checkins` and `completed_sessions` unique indexes need updating to include `user_id` — covered in Task 8 note about migration 003.
- `strava_activities` `strava_id` is unique globally but should be unique per user. A Strava activity ID is globally unique so this is safe as-is.
