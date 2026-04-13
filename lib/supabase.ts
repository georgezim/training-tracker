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
