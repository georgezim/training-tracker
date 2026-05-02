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
    const { userId, weekStart } = body as { userId: string; weekStart: string };

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
      console.log('[weekly-report] Returning cached report for week:', weekStart);
      return NextResponse.json({
        report: existing.report_data,
        weekStart: existing.week_start,
        weekEnd: existing.week_end,
        cached: true,
      });
    }

    // Fetch all week data in parallel
    const [sessionsRes, overridesRes, stravaRes, checkinsRes, profileRes] = await Promise.all([
      supabase
        .from('completed_sessions')
        .select('session_date, session_type, status, distance_km, duration_min')
        .eq('user_id', userId)
        .gte('session_date', weekStart)
        .lte('session_date', weekEnd),
      supabase
        .from('session_overrides')
        .select('session_date, planned_type, actual_type, feedback_tags, feedback_notes')
        .eq('user_id', userId)
        .gte('session_date', weekStart)
        .lte('session_date', weekEnd),
      supabase
        .from('strava_activities_cache')
        .select('activity_date, sport_type, distance_m, duration_sec, avg_heartrate, avg_pace')
        .eq('user_id', userId)
        .gte('activity_date', weekStart)
        .lte('activity_date', weekEnd),
      supabase
        .from('daily_checkins')
        .select('checkin_date, whoop_recovery, achilles_pain, sleep_hours, notes')
        .eq('user_id', userId)
        .gte('checkin_date', weekStart)
        .lte('checkin_date', weekEnd),
      supabase
        .from('profiles')
        .select('goal, training_level, target_race, race_date, days_per_week')
        .eq('id', userId)
        .single(),
    ]);

    const sessions  = sessionsRes.data ?? [];
    const overrides = overridesRes.data ?? [];
    const strava    = stravaRes.data ?? [];
    const checkins  = checkinsRes.data ?? [];
    const profile   = profileRes.data;

    // Compute summary metrics for prompt context
    const sessionsCompleted = sessions.filter(s => s.status === 'done').length;
    const sessionsPlanned   = sessions.length; // all fetched sessions were planned

    const runActivities = strava.filter(a =>
      ['Run', 'TrailRun', 'VirtualRun'].includes(a.sport_type ?? '')
    );
    const totalDistanceKm = Math.round(
      runActivities.reduce((sum, a) => sum + (a.distance_m ?? 0), 0) / 100
    ) / 10;

    const recoveryValues = checkins
      .map(c => c.whoop_recovery)
      .filter((v): v is number => v != null);
    const avgRecovery = recoveryValues.length > 0
      ? Math.round(recoveryValues.reduce((a, b) => a + b, 0) / recoveryValues.length)
      : null;

    const achillesValues = checkins
      .map(c => c.achilles_pain)
      .filter((v): v is number => v != null);
    const avgAchilles = achillesValues.length > 0
      ? Math.round(achillesValues.reduce((a, b) => a + b, 0) / achillesValues.length * 10) / 10
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
  `- ${s.session_date}: ${s.session_type ?? 'session'} — status: ${s.status}${s.distance_km ? `, ${s.distance_km}km` : ''}${s.duration_min ? `, ${s.duration_min}min` : ''}`
).join('\n')}

STRAVA ACTIVITIES:
${strava.length === 0 ? '- No Strava activities logged' : strava.map(a =>
  `- ${a.activity_date}: ${a.sport_type} — ${a.distance_m ? (a.distance_m / 1000).toFixed(2) + 'km' : 'no distance'}${a.duration_sec ? `, ${Math.round(a.duration_sec / 60)}min` : ''}${a.avg_heartrate ? `, avg HR ${Math.round(a.avg_heartrate)}bpm` : ''}${a.avg_pace ? `, pace ${a.avg_pace}` : ''}`
).join('\n')}

${overrides.length > 0 ? `PLAN DEVIATIONS:
${overrides.map(o =>
  `- ${o.session_date}: planned ${o.planned_type ?? 'rest'} → actual ${o.actual_type}. Tags: ${(o.feedback_tags ?? []).join(', ') || 'none'}${o.feedback_notes ? `. Notes: "${o.feedback_notes}"` : ''}`
).join('\n')}
` : ''}
DAILY CHECK-INS:
${checkins.length === 0 ? '- No check-ins recorded' : checkins.map(c =>
  `- ${c.checkin_date}: recovery=${c.whoop_recovery ?? 'N/A'}/100, achilles pain=${c.achilles_pain ?? 'N/A'}/10${c.sleep_hours ? `, sleep ${c.sleep_hours}h` : ''}${c.notes ? `, notes: "${c.notes}"` : ''}`
).join('\n')}

KEY METRICS:
- Sessions completed: ${sessionsCompleted} / ${sessionsPlanned}
- Total run distance (Strava): ${totalDistanceKm}km
- Avg recovery score: ${avgRecovery ?? 'N/A'}/100
- Avg Achilles pain: ${avgAchilles ?? 'N/A'}/10

Write a thorough but concise weekly report. Be specific with numbers. Identify genuine highlights and concerns — don't manufacture either if data doesn't support them. Keep next_week_suggestion practical and actionable.`;

    // Call Gemini with structured response schema
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
                sessions_completed:   { type: 'integer' },
                sessions_planned:     { type: 'integer' },
                total_distance_km:    { type: 'number' },
                highlights:           { type: 'array', items: { type: 'string' } },
                concerns:             { type: 'array', items: { type: 'string' } },
                recovery_summary:     { type: 'string' },
                goal_progress:        { type: 'string' },
                next_week_suggestion: { type: 'string' },
                effort_rating:        { type: 'string', enum: ['excellent', 'good', 'fair', 'poor'] },
              },
              required: [
                'headline', 'summary', 'sessions_completed', 'sessions_planned',
                'total_distance_km', 'highlights', 'concerns', 'recovery_summary',
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

    // Save to weekly_reports
    const { error: insertError } = await supabase
      .from('weekly_reports')
      .insert({
        user_id:     userId,
        week_start:  weekStart,
        week_end:    weekEnd,
        report_data: reportData,
      });

    if (insertError) {
      // If uniqueness conflict (race condition), try to fetch the existing row
      if (insertError.code === '23505') {
        const { data: race } = await supabase
          .from('weekly_reports')
          .select('report_data, week_start, week_end')
          .eq('user_id', userId)
          .eq('week_start', weekStart)
          .maybeSingle();
        if (race) {
          return NextResponse.json({ report: race.report_data, weekStart: race.week_start, weekEnd: race.week_end, cached: true });
        }
      }
      console.error('[weekly-report] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to save report', detail: insertError.message }, { status: 500 });
    }

    console.log('[weekly-report] SUCCESS — effort_rating:', reportData.effort_rating, 'week:', weekStart);
    return NextResponse.json({ report: reportData, weekStart, weekEnd });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[weekly-report] FATAL:', msg);
    return NextResponse.json({ error: 'Weekly report generation failed', detail: msg }, { status: 500 });
  }
}
