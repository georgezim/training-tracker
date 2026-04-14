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
  const { data: recentActivities } = await supabase
    .from('strava_activities')
    .select('activity_date, sport_type, distance_m, moving_time_s, avg_heartrate, avg_speed_ms')
    .eq('user_id', userId)
    .gte('activity_date', sevenDaysAgo.toISOString().slice(0, 10))
    .order('activity_date', { ascending: false });

  const recentSummary = (recentActivities ?? []).length > 0
    ? (recentActivities ?? []).map(a =>
        `${a.activity_date}: ${a.sport_type} — ${metersToKm(a.distance_m)}km in ${secondsToDuration(a.moving_time_s)} @ ${mpsToMinPerKm(a.avg_speed_ms)}${a.avg_heartrate ? `, avg HR ${Math.round(a.avg_heartrate)}bpm` : ''}`
      ).join('\n')
    : 'No recent Strava activities recorded.';

  const prompt = `You are a personal running coach. Adapt today's planned workout based on this athlete's data. Be concise and specific.

ATHLETE:
- Goal: ${profile?.goal_other ?? profile?.goal ?? 'marathon'}
- Level: ${profile?.training_level ?? 'intermediate'}
- Training days/week: ${profile?.days_per_week ?? 4}
- Age: ${profile?.age ?? 'unknown'}
- Injuries/limitations: ${profile?.injury_notes ?? 'none'}

TODAY'S PLAN:
${plannedWorkout.label}: ${plannedWorkout.description}

TODAY'S BODY DATA:
${checkin.whoop_recovery != null ? `- Recovery Score: ${checkin.whoop_recovery}%` : ''}
${checkin.sleep_score != null ? `- Sleep Score: ${checkin.sleep_score}%` : ''}
${checkin.sleep_hours != null ? `- Hours Slept: ${checkin.sleep_hours}h` : ''}
- Achilles Pain: ${checkin.achilles_pain ?? 0}/10
- Feeling: ${checkin.feeling ?? 'not logged'}
- Notes: ${checkin.notes || 'none'}

LAST 7 DAYS:
${recentSummary}

RULES:
- High recovery (score ≥70% or sleep ≥7.5h, feeling great/good): do planned workout as-is or slightly harder
- Medium recovery (score 33-69% or sleep 6-7.5h, feeling tired): reduce intensity or volume ~20%
- Low recovery (score <33% or sleep <6h, feeling bad): switch to easy bike or complete rest
- Achilles pain ≥4: no running at all, suggest bike or upper body strength only

Reply in exactly this format (3 lines, no extra text):
LINE 1: Short adapted workout title (e.g. "Easy 6km Run" or "Rest — swap to bike")
LINE 2: What to do specifically (distances, duration, effort level)
LINE 3: Why — one sentence referencing their actual numbers`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const lines = text.split('\n').filter(Boolean);

    return NextResponse.json({
      title: lines[0] ?? plannedWorkout.label,
      description: lines.slice(1).join(' '),
    });
  } catch (err) {
    console.error('Gemini error:', err);
    return NextResponse.json({ error: 'AI unavailable' }, { status: 500 });
  }
}
