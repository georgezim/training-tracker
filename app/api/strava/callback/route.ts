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
