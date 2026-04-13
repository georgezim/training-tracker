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

// Fetch ALL activities from Strava by paginating until empty page
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
    if (batch.length < 200) break; // last page
    page++;
  }
  return all;
}

function toRow(a: any) {
  return {
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

  // Check connection
  const { data: tokenRow } = await supabase
    .from('strava_tokens')
    .select('athlete_id')
    .eq('id', 1)
    .maybeSingle();

  if (!tokenRow) {
    return NextResponse.json({ connected: false, activities: [] });
  }

  // For a date lookup, serve from cache if available and no full sync requested
  if (dateFilter && !fullSync) {
    const { data: cached } = await supabase
      .from('strava_activities')
      .select('*')
      .eq('activity_date', dateFilter)
      .order('synced_at', { ascending: false });

    if (cached && cached.length > 0) {
      return NextResponse.json({ connected: true, activities: cached, source: 'cache' });
    }
  }

  const token = await getFreshToken();
  if (!token) {
    return NextResponse.json({ connected: false, activities: [] });
  }

  const activities = await fetchAllActivities(token);

  // Upsert everything into cache in batches of 100
  if (activities.length > 0) {
    const rows = activities.map(toRow);
    for (let i = 0; i < rows.length; i += 100) {
      await supabase
        .from('strava_activities')
        .upsert(rows.slice(i, i + 100), { onConflict: 'strava_id' });
    }
  }

  if (dateFilter) {
    const filtered = activities.filter((a: any) =>
      a.start_date_local.slice(0, 10) === dateFilter
    );
    return NextResponse.json({ connected: true, activities: filtered, source: 'strava', total: activities.length });
  }

  return NextResponse.json({ connected: true, activities, source: 'strava', total: activities.length });
}
