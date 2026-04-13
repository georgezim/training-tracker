import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function getFreshToken(): Promise<string | null> {
  const { data: row } = await supabase
    .from('strava_tokens')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (!row) return null;

  const nowSec = Math.floor(Date.now() / 1000);

  // Refresh if expired (or within 5 min of expiry)
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
    }).eq('id', 1);
    return fresh.access_token;
  }

  return row.access_token;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  // Optional: ?date=2026-04-14 to filter to a specific date
  const dateFilter = searchParams.get('date');

  // Check if connected
  const { data: tokenRow } = await supabase
    .from('strava_tokens')
    .select('athlete_id')
    .eq('id', 1)
    .maybeSingle();

  if (!tokenRow) {
    return NextResponse.json({ connected: false, activities: [] });
  }

  // If requesting a specific date, check cache first
  if (dateFilter) {
    const { data: cached } = await supabase
      .from('strava_activities')
      .select('*')
      .eq('activity_date', dateFilter)
      .order('synced_at', { ascending: false });

    if (cached && cached.length > 0) {
      return NextResponse.json({ connected: true, activities: cached, source: 'cache' });
    }
  }

  // Fetch from Strava API
  const token = await getFreshToken();
  if (!token) {
    return NextResponse.json({ connected: false, activities: [] });
  }

  // Fetch last 60 days of activities
  const after = Math.floor(Date.now() / 1000) - 60 * 24 * 60 * 60;
  const stravaRes = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!stravaRes.ok) {
    return NextResponse.json({ connected: true, activities: [], error: 'strava_fetch_failed' });
  }

  const activities = await stravaRes.json();

  // Upsert all into cache
  if (activities.length > 0) {
    const rows = activities.map((a: any) => ({
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
    }));
    await supabase.from('strava_activities').upsert(rows, { onConflict: 'strava_id' });
  }

  // If date filter, return only that day
  if (dateFilter) {
    const filtered = activities.filter((a: any) =>
      a.start_date_local.slice(0, 10) === dateFilter
    );
    return NextResponse.json({ connected: true, activities: filtered, source: 'strava' });
  }

  return NextResponse.json({ connected: true, activities, source: 'strava' });
}
