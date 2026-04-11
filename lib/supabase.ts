import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Types ────────────────────────────────────────────────────────────────────

export type FeelingType = 'great' | 'good' | 'tired' | 'bad' | 'injured';
export type SessionType = 'run' | 'gym' | 'bike' | 'race';

export interface DailyCheckin {
  id: string;
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
  date: string;
  session_type: SessionType;
  completed: boolean;
  created_at: string;
}
