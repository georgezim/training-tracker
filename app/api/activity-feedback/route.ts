import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface FeedbackRequest {
  sessionDate: string;
  planned: {
    type: string;
    distance_km?: number;
    duration_min?: number;
    description: string;
  } | null;
  actual: {
    type: string;
    distance_km: number;
    duration_min: number;
    avg_heartrate?: number;
    max_heartrate?: number;
    avg_pace?: string;
    elevation_m?: number;
    source: 'strava' | 'manual';
  };
  context: {
    weekDay: number;          // 1=Mon ... 7=Sun
    weeklyLoadKm: number;     // total km so far this week
    upcomingSessions: string[];
    isRestDay: boolean;
  };
  mismatchFeedback?: {
    tags: string[];
    notes?: string;
  };
}

/** Returns "YYYY-MM-DD" for the Monday of the week containing `dateStr`. */
function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body: FeedbackRequest = await req.json();

  // ── Fetch weekly context ──
  const weekStart = getWeekStart(body.sessionDate);

  const [{ data: weekSessions }, { data: weekActivities }] = await Promise.all([
    supabase
      .from('completed_sessions')
      .select('status, session_type')
      .eq('user_id', userId)
      .gte('date', weekStart)
      .lt('date', body.sessionDate),
    supabase
      .from('strava_activities')
      .select('distance_m')
      .eq('user_id', userId)
      .gte('start_date', weekStart + 'T00:00:00')
      .lt('start_date', body.sessionDate + 'T00:00:00'),
  ]);

  const weeklyDistanceKm = (weekActivities ?? []).reduce(
    (sum, a) => sum + (a.distance_m ?? 0) / 1000,
    0
  );
  const sessionsCompleted = (weekSessions ?? []).filter(s => s.status === 'done').length;
  const sessionsMissed    = (weekSessions ?? []).filter(s => s.status === 'missed').length;

  const weekContext = {
    weekStart,
    weeklyDistanceKm,
    sessionsCompleted,
    sessionsMissed,
  };

  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', userId).maybeSingle();

  const prompt = buildGeminiPrompt(body, profile, weekContext);

  // Call Gemini
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
              summary: { type: 'string' },
              effort_rating: { type: 'string', enum: ['too_easy', 'right', 'too_hard'] },
              injury_flag: { type: 'boolean' },
              tip: { type: 'string' },
            },
            required: ['summary', 'effort_rating', 'injury_flag', 'tip'],
          },
        },
      }),
    }
  );

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    console.error('[activity-feedback] Gemini API error:', geminiRes.status, errText);
    return NextResponse.json({ error: 'AI unavailable' }, { status: 502 });
  }

  const geminiData = await geminiRes.json();
  const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    console.error('[activity-feedback] Gemini returned no content', JSON.stringify(geminiData));
    return NextResponse.json({ error: 'AI returned no content' }, { status: 502 });
  }
  const feedback = JSON.parse(rawText);

  // Save to DB
  await supabase.from('activity_feedback').upsert({
    user_id: userId,
    session_date: body.sessionDate,
    activity_type: body.actual.type,
    feedback_text: feedback.summary,
    effort_rating: feedback.effort_rating,
    achilles_flag: feedback.injury_flag,   // DB column stays achilles_flag — field renamed in API
    tip: feedback.tip,
  }, { onConflict: 'user_id,session_date' });

  // If there was a mismatch or rest-day activity, save override
  if (body.mismatchFeedback || body.context.isRestDay) {
    await supabase.from('session_overrides').upsert({
      user_id: userId,
      session_date: body.sessionDate,
      planned_type: body.planned?.type ?? 'rest',
      planned_detail: body.planned ? {
        distance_km: body.planned.distance_km,
        duration_min: body.planned.duration_min,
        description: body.planned.description,
      } : null,
      actual_type: body.actual.type,
      actual_detail: {
        distance_km: body.actual.distance_km,
        duration_min: body.actual.duration_min,
        avg_hr: body.actual.avg_heartrate,
        source: body.actual.source,
      },
      feedback_tags: body.mismatchFeedback?.tags ?? [],
      feedback_notes: body.mismatchFeedback?.notes ?? null,
    }, { onConflict: 'user_id,session_date' });
  }

  return NextResponse.json(feedback);
}

function buildGeminiPrompt(
  body: FeedbackRequest,
  profile: any,
  weekContext: {
    weekStart: string;
    weeklyDistanceKm: number;
    sessionsCompleted: number;
    sessionsMissed: number;
  }
): string {
  const { planned, actual, context, mismatchFeedback } = body;
  const { weeklyDistanceKm, sessionsCompleted, sessionsMissed } = weekContext;

  let prompt = `You are a running coach analyzing a completed training session.

ATHLETE:
- Goal: ${profile?.goal ?? 'marathon'}
- Level: ${profile?.training_level ?? 'intermediate'}
- Known injury: ${profile?.injury_notes ?? 'none'}

WEEK CONTEXT (Mon ${weekContext.weekStart} → today):
- Total distance run so far this week: ${weeklyDistanceKm.toFixed(1)}km
- Sessions completed: ${sessionsCompleted}
- Sessions missed: ${sessionsMissed}
- Day of week: ${context.weekDay} of 7

IMPORTANT: Use the week context when assessing effort. If the athlete has done zero or very little training this week, a session on a rest day may be appropriate or even beneficial — do not rate it as "too_hard" just because it is a rest day. If they have done high volume already, flag recovery risk.`;

  if (context.isRestDay) {
    prompt += `\n\nThis was a REST DAY but the athlete trained anyway.`;
  }

  if (planned) {
    prompt += `\n\nPLANNED SESSION:
- Type: ${planned.type}
- Target distance: ${planned.distance_km ? planned.distance_km + 'km' : 'N/A'}
- Description: ${planned.description}`;
  }

  prompt += `\n\nACTUAL SESSION (from ${actual.source}):
- Type: ${actual.type}
- Distance: ${actual.distance_km.toFixed(2)}km
- Duration: ${actual.duration_min.toFixed(0)} minutes
- Avg HR: ${actual.avg_heartrate ? Math.round(actual.avg_heartrate) + 'bpm' : 'N/A'}
- Max HR: ${actual.max_heartrate ? Math.round(actual.max_heartrate) + 'bpm' : 'N/A'}
- Avg pace: ${actual.avg_pace ?? 'N/A'}
- Elevation: ${actual.elevation_m ? Math.round(actual.elevation_m) + 'm' : 'N/A'}`;

  if (mismatchFeedback) {
    prompt += `\n\nATHLETE FEEDBACK ON DEVIATION:
- Reasons: ${mismatchFeedback.tags.join(', ')}
- Notes: ${mismatchFeedback.notes ?? 'none'}`;
  }

  prompt += `\n\nRESPOND with:
1. summary: 2 sentences max. What went well or what to watch. Be specific with numbers.
2. effort_rating: was this session "too_easy", "right", or "too_hard" relative to the plan and their level?
3. injury_flag: true if this session's load/intensity could aggravate the athlete's known injury. Consider total weekly load.
4. tip: One specific actionable tip for next time. Keep it to 1 sentence.

Be direct. No fluff.`;

  return prompt;
}
