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

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body: FeedbackRequest = await req.json();

  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', userId).maybeSingle();

  const prompt = buildGeminiPrompt(body, profile);

  // Call Gemini
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
              summary: { type: 'string' },
              effort_rating: { type: 'string', enum: ['too_easy', 'right', 'too_hard'] },
              achilles_flag: { type: 'boolean' },
              tip: { type: 'string' },
            },
            required: ['summary', 'effort_rating', 'achilles_flag', 'tip'],
          },
        },
      }),
    }
  );

  const geminiData = await geminiRes.json();
  const feedback = JSON.parse(
    geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
  );

  // Save to DB
  await supabase.from('activity_feedback').upsert({
    user_id: userId,
    session_date: body.sessionDate,
    activity_type: body.actual.type,
    feedback_text: feedback.summary,
    effort_rating: feedback.effort_rating,
    achilles_flag: feedback.achilles_flag,
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

function buildGeminiPrompt(body: FeedbackRequest, profile: any): string {
  const { planned, actual, context, mismatchFeedback } = body;

  let prompt = `You are a running coach analyzing a completed training session.

ATHLETE:
- Goal: ${profile?.goal ?? 'marathon'}
- Level: ${profile?.training_level ?? 'intermediate'}
- Known injury: recovering Achilles tendon

SESSION DATE CONTEXT:
- Day ${context.weekDay} of 7
- Weekly load so far: ${context.weeklyLoadKm.toFixed(1)}km
- Upcoming this week: ${context.upcomingSessions.join(', ') || 'none'}`;

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
3. achilles_flag: true if this session's load/intensity could stress the Achilles. Consider total weekly load.
4. tip: One specific actionable tip for next time. Keep it to 1 sentence.

Be direct. No fluff.`;

  return prompt;
}
