import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import { getAuthUserId } from '@/lib/api-auth';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
}

function actionToMultiplier(action: string): number {
  switch (action) {
    case 'increase': return 1.1;
    case 'reduce':   return 0.8;
    case 'recovery': return 0.6;
    default:         return 1.0; // 'maintain'
  }
}

export async function POST() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Supabase service role key not configured' }, { status: 500 });
    }

    const supabase = getSupabaseAdmin();

    // Date range: last completed week (last Mon → last Sun)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, …
    const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - daysToLastMonday - 7);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);

    const fromDate = `${lastMonday.getFullYear()}-${String(lastMonday.getMonth() + 1).padStart(2, '0')}-${String(lastMonday.getDate()).padStart(2, '0')}`;
    const toDate = `${lastSunday.getFullYear()}-${String(lastSunday.getMonth() + 1).padStart(2, '0')}-${String(lastSunday.getDate()).padStart(2, '0')}`;

    console.log('[review-week] Reviewing week', fromDate, '→', toDate, 'for user:', userId);

    // Fetch all data in parallel
    const [sessionsRes, activitiesRes, checkinsRes, profileRes] = await Promise.all([
      supabase
        .from('completed_sessions')
        .select('date, session_type, status')
        .eq('user_id', userId)
        .gte('date', fromDate)
        .lte('date', toDate),
      supabase
        .from('strava_activities')
        .select('distance_m, sport_type, activity_date')
        .eq('user_id', userId)
        .gte('activity_date', fromDate)
        .lte('activity_date', toDate),
      supabase
        .from('daily_checkins')
        .select('date, whoop_recovery, achilles_pain')
        .eq('user_id', userId)
        .gte('date', fromDate)
        .lte('date', toDate),
      supabase
        .from('profiles')
        .select('training_level, goal, custom_plan')
        .eq('id', userId)
        .single(),
    ]);

    const sessions   = sessionsRes.data ?? [];
    const activities = activitiesRes.data ?? [];
    const checkins   = checkinsRes.data ?? [];
    const profile    = profileRes.data;

    // Compute summary metrics
    const sessionsCompleted = sessions.filter(s => s.status === 'done').length;
    const customPlan: Array<{ type: string }> = Array.isArray(profile?.custom_plan) ? profile.custom_plan : [];
    const sessionsPlanned = customPlan.filter(d => d.type !== 'rest').length;

    // No plan yet — skip Gemini and return a neutral maintain to avoid biasing week 1
    if (sessionsPlanned === 0) {
      console.log('[review-week] No custom plan yet — returning maintain');
      return NextResponse.json({ action: 'maintain', reason: 'No plan data yet.', long_run_km_adjustment: 0, multiplier: 1.0, applied_at: new Date().toISOString() });
    }

    const completionRate = sessionsCompleted / sessionsPlanned;

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

    const runActivities = activities.filter(a =>
      ['Run', 'TrailRun', 'VirtualRun'].includes(a.sport_type ?? '')
    );
    const totalRunKm = Math.round(
      runActivities.reduce((sum, a) => sum + (a.distance_m ?? 0), 0) / 100
    ) / 10;

    const prompt = `You are an expert endurance coach reviewing an athlete's last training week.

ATHLETE: goal=${profile?.goal ?? 'marathon'}, level=${profile?.training_level ?? 'intermediate'}
LAST WEEK (${fromDate} to ${toDate}):
- Sessions completed: ${sessionsCompleted} / ${sessionsPlanned}
- Completion rate: ${Math.round(completionRate * 100)}%
- Avg recovery score: ${avgRecovery ?? 'N/A'} / 100
- Avg Achilles pain: ${avgAchilles ?? 'N/A'} / 10
- Total run km logged via Strava: ${totalRunKm}km

Based on this data, choose ONE action:
- maintain: athlete is on track, no change
- increase: athlete is performing well, safe to add ~10% volume
- reduce: athlete is struggling or incomplete, reduce ~20%
- recovery: athlete needs a full recovery week

Return ONLY valid JSON, no markdown, no explanation:
{"action":"maintain","reason":"<one sentence>","long_run_km_adjustment":<integer, e.g. 0 or 2 or -3>}`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const geminiResult = await model.generateContent(prompt);
    const text = geminiResult.response.text().trim();
    console.log('[review-week] Gemini response:', text.slice(0, 200));

    let parsed: { action: string; reason: string; long_run_km_adjustment: number };
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      console.error('[review-week] JSON parse failed:', text);
      return NextResponse.json({ error: 'Failed to parse Gemini response' }, { status: 500 });
    }

    const validActions = ['maintain', 'increase', 'reduce', 'recovery'];
    if (!validActions.includes(parsed.action)) parsed.action = 'maintain';

    const planAdjustment = {
      action: parsed.action,
      reason: String(parsed.reason ?? '').slice(0, 200),
      long_run_km_adjustment: Number(parsed.long_run_km_adjustment ?? 0),
      multiplier: actionToMultiplier(parsed.action),
      applied_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ plan_adjustment: planAdjustment })
      .eq('id', userId);

    if (updateError) {
      console.error('[review-week] Failed to save:', updateError);
      return NextResponse.json({ error: 'Failed to save review result', detail: updateError.message }, { status: 500 });
    }

    console.log('[review-week] SUCCESS — action:', planAdjustment.action, 'multiplier:', planAdjustment.multiplier);
    return NextResponse.json(planAdjustment);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[review-week] FATAL:', msg);
    return NextResponse.json({ error: 'Review failed', detail: msg }, { status: 500 });
  }
}
