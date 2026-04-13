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
