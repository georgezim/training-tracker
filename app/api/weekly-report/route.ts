import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Supabase service role key not configured' }, { status: 500 });
    }

    const body = await req.json();
    const { userId, weekStart, force } = body as { userId: string; weekStart: string; force?: boolean };

    if (!userId || !weekStart) {
      return NextResponse.json({ error: 'userId and weekStart are required' }, { status: 400 });
    }

    // Validate weekStart format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json({ error: 'weekStart must be YYYY-MM-DD' }, { status: 400 });
    }

    // Compute weekEnd (Sunday = Monday + 6 days)
    const weekStartDate = new Date(weekStart + 'T00:00:00Z');
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setUTCDate(weekStartDate.getUTCDate() + 6);
    const weekEnd = weekEndDate.toISOString().slice(0, 10);

    console.log('[weekly-report] Generating report for user:', userId, 'week:', weekStart, '→', weekEnd);

    const supabase = getSupabaseAdmin();

    // Check if report already exists for this (user_id, week_start)
    const { data: existing, error: existingError } = await supabase
      .from('weekly_reports')
      .select('report_data, week_start, week_end')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .maybeSingle();

    if (existingError) {
      console.error('[weekly-report] DB lookup error:', existingError);
      return NextResponse.json({ error: 'Database error', detail: existingError.message }, { status: 500 });
    }

    if (existing) {
      if (!force) {
        console.log('[weekly-report] Returning cached report for week:', weekStart);
        return NextResponse.json({
          report: existing.report_data,
          weekStart: existing.week_start,
          weekEnd: existing.week_end,
          cached: true,
        });
      }
      // force=true: fall through to regenerate — old report preserved until new one succeeds
    }

    // Fetch all week data in parallel
    const [sessionsRes, overridesRes, stravaRes, checkinsRes, profileRes, historyRes] = await Promise.all([
      supabase
        .from('completed_sessions')
        .select('date, session_type, status, distance_km, duration_min')
        .eq('user_id', userId)
        .gte('date', weekStart)
        .lte('date', weekEnd),
      supabase
        .from('session_overrides')
        .select('session_date, planned_type, actual_type, feedback_tags, feedback_notes')
        .eq('user_id', userId)
        .gte('session_date', weekStart)
        .lte('session_date', weekEnd),
      supabase
        .from('strava_activities')
        .select('activity_date, sport_type, distance_m, moving_time_s, avg_heartrate')
        .eq('user_id', userId)
        .gte('activity_date', weekStart)
        .lte('activity_date', weekEnd),
      supabase
        .from('daily_checkins')
        .select('date, whoop_recovery, achilles_pain, sleep_hours, notes')
        .eq('user_id', userId)
        .gte('date', weekStart)
        .lte('date', weekEnd),
      supabase
        .from('profiles')
        .select('goal, training_level, target_race, race_date, days_per_week, races')
        .eq('id', userId)
        .single(),
      supabase
        .from('weekly_reports')
        .select('week_start, week_end, report_data')
        .eq('user_id', userId)
        .lt('week_start', weekStart)
        .order('week_start', { ascending: false })
        .limit(8),
    ]);

    const sessions  = sessionsRes.data ?? [];
    const overrides = overridesRes.data ?? [];
    const strava    = stravaRes.data ?? [];
    const checkins  = checkinsRes.data ?? [];
    const profile   = profileRes.data;
    const history   = historyRes.data ?? [];

    // Compute summary metrics for prompt context
    const doneDates   = new Set(sessions.filter(s => s.status === 'done').map(s => s.date));
    const stravaDates = new Set(strava.map(a => a.activity_date));
    const sessionsCompleted = new Set([...Array.from(doneDates), ...Array.from(stravaDates)]).size;
    const sessionsPlanned   = profile?.days_per_week ?? 4;

    const totalDistanceKm = Math.round(
      strava.reduce((sum, a) => sum + (a.distance_m ?? 0), 0) / 100
    ) / 10;

    const recoveryValues = checkins
      .map(c => c.whoop_recovery)
      .filter((v): v is number => v != null);
    const avgRecovery = recoveryValues.length > 0
      ? Math.round(recoveryValues.reduce((a, b) => a + b, 0) / recoveryValues.length)
      : null;

    const injuryPainValues = checkins
      .map(c => c.achilles_pain)
      .filter((v): v is number => v != null);
    const avgInjuryPain = injuryPainValues.length > 0
      ? Math.round(injuryPainValues.reduce((a, b) => a + b, 0) / injuryPainValues.length * 10) / 10
      : null;

    const historySummary = history.map(h => ({
      weekStart: h.week_start,
      distanceKm: (h.report_data as Record<string, unknown>)?.total_distance_km ?? null,
      sessionsCompleted: (h.report_data as Record<string, unknown>)?.sessions_completed ?? null,
      sessionsPlanned: (h.report_data as Record<string, unknown>)?.sessions_planned ?? null,
      effortRating: (h.report_data as Record<string, unknown>)?.effort_rating ?? null,
    })).reverse(); // oldest first

    const upcomingRaces = ((profile?.races as Array<{ name: string; date: string; distance: string }>) ?? [])
      .filter(r => r.date >= weekEnd)
      .sort((a, b) => a.date.localeCompare(b.date));

    const nearestRace = upcomingRaces[0] ?? null;
    const weeksToNearest = nearestRace
      ? Math.round((new Date(nearestRace.date).getTime() - new Date(weekEnd).getTime()) / (7 * 24 * 60 * 60 * 1000))
      : null;

    // Build prompt
    const prompt = `You are an expert endurance coach writing a weekly training report for an athlete.

ATHLETE PROFILE:
- Goal: ${profile?.goal ?? 'marathon'}
- Training level: ${profile?.training_level ?? 'intermediate'}
- Target race: ${profile?.target_race ?? 'marathon'}
- Race date: ${profile?.race_date ?? 'unknown'}
- Planned training days per week: ${profile?.days_per_week ?? 'unknown'}

WEEK: ${weekStart} to ${weekEnd}

SESSIONS (from training plan):
${sessions.length === 0 ? '- No sessions recorded' : sessions.map(s =>
  `- ${s.date}: ${s.session_type ?? 'session'} — status: ${s.status}${s.distance_km ? `, ${s.distance_km}km` : ''}${s.duration_min ? `, ${s.duration_min}min` : ''}`
).join('\n')}

STRAVA ACTIVITIES:
${strava.length === 0 ? '- No Strava activities logged' : strava.map(a =>
  `- ${a.activity_date}: ${a.sport_type} — ${a.distance_m ? (a.distance_m / 1000).toFixed(2) + 'km' : 'no distance'}${a.moving_time_s ? `, ${Math.round(a.moving_time_s / 60)}min` : ''}${a.avg_heartrate ? `, avg HR ${Math.round(a.avg_heartrate)}bpm` : ''}`
).join('\n')}

${overrides.length > 0 ? `PLAN DEVIATIONS:
${overrides.map(o =>
  `- ${o.session_date}: planned ${o.planned_type ?? 'rest'} → actual ${o.actual_type}. Tags: ${(o.feedback_tags ?? []).join(', ') || 'none'}${o.feedback_notes ? `. Notes: "${o.feedback_notes}"` : ''}`
).join('\n')}
` : ''}DAILY CHECK-INS:
${checkins.length === 0 ? '- No check-ins recorded' : checkins.map(c =>
  `- ${c.date}: recovery=${c.whoop_recovery ?? 'N/A'}/100, injury pain=${c.achilles_pain ?? 'N/A'}/10${c.sleep_hours ? `, sleep ${c.sleep_hours}h` : ''}${c.notes ? `, notes: "${c.notes}"` : ''}`
).join('\n')}

KEY METRICS (computed server-side — treat these as ground truth, do not recalculate):
- Sessions completed: ${sessionsCompleted} / ${sessionsPlanned}
- Total distance all sports: ${totalDistanceKm}km
- Avg recovery: ${avgRecovery ?? 'N/A'}/100
- Avg injury pain: ${avgInjuryPain ?? 'N/A'}/10

${historySummary.length > 0 ? `
TRAINING HISTORY (oldest → newest, up to 8 weeks):
${historySummary.map(h =>
  `- Week of ${h.weekStart}: ${h.distanceKm != null ? h.distanceKm + 'km' : 'no data'}, ${h.sessionsCompleted != null ? `${h.sessionsCompleted}/${h.sessionsPlanned} sessions` : ''}, effort: ${h.effortRating ?? 'unknown'}`
).join('\n')}

Average weekly distance (last ${historySummary.length} weeks): ${
  historySummary.filter(h => h.distanceKm != null).length > 0
    ? Math.round(historySummary.reduce((sum, h) => sum + (Number(h.distanceKm) || 0), 0) / historySummary.filter(h => h.distanceKm != null).length * 10) / 10
    : 'insufficient data'
}km
` : '(No training history yet — this is one of the first weeks.)'}

RACES:
${upcomingRaces.length === 0
  ? '- No races scheduled. Give feedback relative to stated goal and training trend.'
  : upcomingRaces.map((r, i) => {
      const weeks = Math.round((new Date(r.date).getTime() - new Date(weekEnd).getTime()) / (7 * 24 * 60 * 60 * 1000));
      return `- ${r.name} (${r.distance}) — ${r.date} — ${weeks} weeks away${i === 0 ? ' ← NEAREST RACE (primary focus)' : ''}`;
    }).join('\n')}

${nearestRace
  ? `Focus goal_progress commentary on the nearest race (${nearestRace.name}) as the immediate training priority. Mention the full race pipeline briefly so the athlete understands the progression.`
  : `No race scheduled. Focus goal_progress on the stated goal (${profile?.goal ?? 'general fitness'}) and training trend over the past weeks.`
}

Write a thorough but concise weekly report. Be specific with numbers. Identify genuine highlights and concerns — don't manufacture either if data doesn't support them. Keep next_week_suggestion practical and actionable.`;

    // Call Gemini with structured response schema
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'object',
              properties: {
                headline:             { type: 'string' },
                summary:              { type: 'string' },
                highlights:           { type: 'array', items: { type: 'string' } },
                concerns:             { type: 'array', items: { type: 'string' } },
                recovery_summary:     { type: 'string' },
                goal_progress:        { type: 'string' },
                next_week_suggestion: { type: 'string' },
                effort_rating:        { type: 'string', enum: ['excellent', 'good', 'fair', 'poor'] },
              },
              required: [
                'headline', 'summary', 'highlights', 'concerns', 'recovery_summary',
                'goal_progress', 'next_week_suggestion', 'effort_rating',
              ],
            },
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('[weekly-report] Gemini API error:', geminiRes.status, errText);
      return NextResponse.json({ error: 'Gemini API error', detail: errText }, { status: 502 });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    console.log('[weekly-report] Gemini raw response (first 300):', rawText.slice(0, 300));

    let reportData: Record<string, unknown>;
    try {
      reportData = JSON.parse(rawText);
    } catch {
      console.error('[weekly-report] JSON parse failed:', rawText);
      return NextResponse.json({ error: 'Failed to parse Gemini response' }, { status: 500 });
    }

    reportData.total_distance_km = totalDistanceKm;
    reportData.sessions_completed = sessionsCompleted;
    reportData.sessions_planned = sessionsPlanned;

    reportData.nearest_race_name = nearestRace?.name ?? null;
    reportData.nearest_race_date = nearestRace?.date ?? null;
    reportData.nearest_race_weeks = weeksToNearest;
    reportData.upcoming_races = upcomingRaces.map(r => ({
      name: r.name,
      date: r.date,
      distance: r.distance,
      weeks_away: Math.round((new Date(r.date).getTime() - new Date(weekEnd).getTime()) / (7 * 24 * 60 * 60 * 1000)),
    }));
    reportData.history_summary = historySummary;

    // Save to weekly_reports via upsert
    const { error: upsertError } = await supabase
      .from('weekly_reports')
      .upsert({
        user_id:     userId,
        week_start:  weekStart,
        week_end:    weekEnd,
        report_data: reportData,
      }, { onConflict: 'user_id,week_start' });

    if (upsertError) {
      console.error('[weekly-report] Upsert error:', upsertError);
      return NextResponse.json({ error: 'Failed to save report', detail: upsertError.message }, { status: 500 });
    }

    console.log('[weekly-report] SUCCESS — effort_rating:', reportData.effort_rating, 'week:', weekStart);
    return NextResponse.json({ report: reportData, weekStart, weekEnd });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[weekly-report] FATAL:', msg);
    return NextResponse.json({ error: 'Weekly report generation failed', detail: msg }, { status: 500 });
  }
}
