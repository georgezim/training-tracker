import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUserId } from '@/lib/api-auth';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST() {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  // 1. Get the current access token
  const { data: tokenRow } = await supabase
    .from('strava_tokens')
    .select('access_token')
    .eq('user_id', userId)
    .maybeSingle();

  // 2. Revoke with Strava (required by API Agreement)
  //    Best-effort — proceed with local deletion even if Strava call fails
  if (tokenRow?.access_token) {
    try {
      await fetch('https://www.strava.com/oauth/deauthorize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenRow.access_token}` },
      });
    } catch (err) {
      console.warn('[strava/disconnect] Strava deauthorize call failed (proceeding):', err);
    }
  }

  // 3. Delete token from database
  await supabase
    .from('strava_tokens')
    .delete()
    .eq('user_id', userId);

  // 4. Delete all cached activities for this user
  await supabase
    .from('strava_activities')
    .delete()
    .eq('user_id', userId);

  console.log('[strava/disconnect] Disconnected and deleted all Strava data for user:', userId);

  return NextResponse.json({ disconnected: true });
}
