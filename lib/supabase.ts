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
  sleep_hours: number | null;
  achilles_pain: number | null;
  feeling: FeelingType | null;
  notes: string | null;
  created_at: string;
}

export interface UserProfile {
  id: string;
  name: string | null;
  goal: string | null;
  goal_other: string | null;
  training_level: string | null;
  days_per_week: number | null;
  age: number | null;
  current_activity: string | null;
  equipment: string[] | null;
  injury_notes: string | null;
  preferred_long_day: string | null;
  has_sleep_tracker: boolean;
  sleep_device: string | null;
  races: { id: string; name: string; date: string; distance: string; emoji: string }[] | null;
  plan_start: string | null;
  target_race: string | null;
}

export interface CompletedSession {
  id: string;
  user_id: string;
  date: string;
  session_type: SessionType;
  completed: boolean;
  status: 'done' | 'missed';
  missed_reason?: string | null;
  created_at: string;
}
