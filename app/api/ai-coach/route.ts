import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import { getAuthUserId } from '@/lib/api-auth';
import { metersToKm, secondsToDuration, mpsToMinPerKm } from '@/lib/strava';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { plannedWorkout, checkin } = await req.json();

  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', userId).maybeSingle();

  // Fetch last 7 days of Strava activities
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  const [{ data: recentActivities }, { data: recentSessions }] = await Promise.all([
    supabase
      .from('strava_activities')
      .select('activity_date, sport_type, distance_m, moving_time_s, avg_heartrate, avg_speed_ms')
      .eq('user_id', userId)
      .gte('activity_date', sevenDaysAgoStr)
      .order('activity_date', { ascending: false }),
    supabase
      .from('completed_sessions')
      .select('date, session_type, status, missed_reason')
      .eq('user_id', userId)
      .gte('date', sevenDaysAgoStr)
      .order('date', { ascending: false }),
  ]);

  const recentSummary = (recentActivities ?? []).length > 0
    ? (recentActivities ?? []).map(a =>
        `${a.activity_date}: ${a.sport_type} — ${metersToKm(a.distance_m)}km in ${secondsToDuration(a.moving_time_s)} @ ${mpsToMinPerKm(a.avg_speed_ms)}${a.avg_heartrate ? `, avg HR ${Math.round(a.avg_heartrate)}bpm` : ''}`
      ).join('\n')
    : 'No recent Strava activities recorded.';

  const sessionsSummary = (recentSessions ?? []).length > 0
    ? (recentSessions ?? []).map(s =>
        `${s.date}: ${s.session_type} — ${s.status}${s.status === 'missed' && s.missed_reason ? ` (${s.missed_reason})` : ''}`
      ).join('\n')
    : 'No sessions tracked this week.';

  const goalLabel = profile?.goal_other ?? profile?.goal ?? 'general fitness';

  const prompt = `You are a personal running coach. Adapt today's planned workout based on this athlete's data. Be concise and specific.

ATHLETE:
- Goal: ${goalLabel}
- Level: ${profile?.training_level ?? 'intermediate'}
- Training days/week: ${profile?.days_per_week ?? 4}
- Age: ${profile?.age ?? 'unknown'}
- Injuries/limitations: ${profile?.injury_notes ?? 'none'}
${profile?.race_date ? `- Race date: ${profile.race_date}` : ''}

TODAY'S PLAN:
${plannedWorkout.label}: ${plannedWorkout.description}

TODAY'S BODY DATA:
${checkin.whoop_recovery != null ? `- Recovery Score: ${checkin.whoop_recovery}%` : ''}
${checkin.sleep_score != null ? `- Sleep Score: ${checkin.sleep_score}%` : ''}
${checkin.sleep_hours != null ? `- Hours Slept: ${checkin.sleep_hours}h` : ''}
- Achilles Pain: ${checkin.achilles_pain ?? 0}/10
- Feeling: ${checkin.feeling ?? 'not logged'}
- Notes: ${checkin.notes || 'none'}

SESSIONS THIS WEEK:
${sessionsSummary}

LAST 7 DAYS (Strava):
${recentSummary}

RULES:
- High recovery (score ≥70% or sleep ≥7.5h, feeling great/good): do planned workout as-is or slightly harder
- Medium recovery (score 33-69% or sleep 6-7.5h, feeling tired): reduce intensity or volume ~20%
- Low recovery (score <33% or sleep <6h, feeling bad): switch to easy bike or complete rest
- Achilles pain ≥4: no running at all, suggest bike or upper body strength only
- If athlete has missed multiple sessions this week, suggest catching up gently — don't overload

Reply in exactly this format (3 lines, no extra text):
LINE 1: Short adapted workout title (e.g. "Easy 6km Run" or "Rest — swap to bike")
LINE 2: What to do specifically (distances, duration, effort level)
LINE 3: Why — one sentence referencing their actual numbers`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-8b' });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const lines = text.split('\n').filter(Boolean);

    const coachTitle = lines[0] ?? plannedWorkout.label;
    const coachDesc = lines.slice(1).join(' ');

    // Persist to daily_checkins
    if (checkin.id) {
      await supabase.from('daily_checkins').update({
        ai_coach_title: coachTitle,
        ai_coach_description: coachDesc,
      }).eq('id', checkin.id);
    }

    return NextResponse.json({
      title: coachTitle,
      description: coachDesc,
    });
  } catch (err) {
    console.error('Gemini error:', err);
    return NextResponse.json({ error: 'AI unavailable' }, { status: 500 });
  }
}
