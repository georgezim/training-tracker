import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUserId } from '@/lib/api-auth';
import { getWorkoutForDateWithProfile, isRunWorkout, isBikeWorkout, isGymWorkout, PlanProfile } from '@/lib/training-plan';

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

async function autoMarkSessions(activities: any[], userId: string) {
  // Fetch user profile for plan-aware workout matching
  const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  const planProfile: PlanProfile | null = prof ? {
    goal: prof.goal,
    daysPerWeek: prof.days_per_week ?? 4,
    preferredLongDay: prof.preferred_long_day ?? 'Sat',
    trainingLevel: prof.training_level ?? 'intermediate',
    customPlan: prof.custom_plan ?? null,
    raceDate: prof.race_date ?? null,
    createdAt: prof.created_at ?? null,
  } : null;

  // Build a map of date → matched workout types from Strava activities
  const matches: Record<string, string> = {};

  for (const a of activities) {
    const dateStr = a.start_date_local.slice(0, 10);
    const date = new Date(dateStr + 'T12:00:00');
    const workout = getWorkoutForDateWithProfile(date, planProfile);
    if (workout.type === 'rest') continue;

    const sport = a.sport_type as string;
    const isMatch =
      (isRunWorkout(workout.type) && /run/i.test(sport)) ||
      (isBikeWorkout(workout.type) && /ride|cycling/i.test(sport)) ||
      (isGymWorkout(workout.type) && /weight|crossfit|workout|strength/i.test(sport));

    if (isMatch) matches[dateStr] = workout.type;
  }

  if (Object.keys(matches).length === 0) return;

  // Fetch existing sessions for those dates so we don't overwrite 'missed' entries
  const dates = Object.keys(matches);
  const { data: existing } = await supabase
    .from('completed_sessions')
    .select('date, session_type, status')
    .eq('user_id', userId)
    .in('date', dates);

  const existingSet = new Set((existing ?? []).map(s => `${s.date}::${s.session_type}`));

  const toInsert = dates
    .filter(d => !existingSet.has(`${d}::${matches[d]}`))
    .map(d => ({
      user_id: userId,
      date: d,
      session_type: matches[d],
      completed: true,
      status: 'done',
    }));

  if (toInsert.length > 0) {
    await supabase.from('completed_sessions').insert(toInsert);
  }
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

    // Auto-mark sessions as done when a matching Strava activity exists
    await autoMarkSessions(activities, userId);
  }

  if (dateFilter) {
    const filtered = activities.filter((a: any) => a.start_date_local.slice(0, 10) === dateFilter);
    return NextResponse.json({ connected: true, activities: filtered, source: 'strava', total: activities.length });
  }
  return NextResponse.json({ connected: true, activities, source: 'strava', total: activities.length });
}
