import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const { data } = await supabase
    .from('strava_tokens')
    .select('athlete_id')
    .eq('id', 1)
    .maybeSingle();

  const { count } = await supabase
    .from('strava_activities')
    .select('strava_id', { count: 'exact', head: true });

  return NextResponse.json({
    connected: !!data,
    activityCount: count ?? 0,
  });
}
