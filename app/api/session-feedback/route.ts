import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUserId } from '@/lib/api-auth';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { date, sessionType, stravaActivity, manualData, plannedLabel } = body as {
    date: string;
    sessionType: string;
    stravaActivity?: {
      sport_type: string;
      distance_m: number;
      moving_time_s: number;
      avg_heartrate?: number;
      elevation_m?: number;
    } | null;
    manualData?: {
      distance_km?: number;
      duration_min?: number;
      notes?: string;
    } | null;
    plannedLabel?: string;
  };

  const supabase = getSupabaseAdmin();

  // Check cache first
  const { data: existing } = await supabase
    .from('completed_sessions')
    .select('coach_feedback')
    .eq('user_id', userId)
    .eq('date', date)
    .eq('session_type', sessionType)
    .maybeSingle();

  if (existing?.coach_feedback) {
    return NextResponse.json({ feedback: existing.coach_feedback, cached: true });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
  }

  // Build prompt
  const activityLine = stravaActivity
    ? `${stravaActivity.sport_type} — ${(stravaActivity.distance_m / 1000).toFixed(2)}km, ${Math.round(stravaActivity.moving_time_s / 60)}min${stravaActivity.avg_heartrate ? `, avg HR ${Math.round(stravaActivity.avg_heartrate)}bpm` : ''}${stravaActivity.elevation_m ? `, ${Math.round(stravaActivity.elevation_m)}m elevation` : ''}`
    : manualData
    ? `Manual — ${manualData.distance_km ? manualData.distance_km + 'km' : ''}${manualData.duration_min ? ', ' + manualData.duration_min + 'min' : ''}${manualData.notes ? '. Notes: ' + manualData.notes : ''}`
    : 'Activity completed (no details recorded)';

  const prompt = `You are a running and endurance coach. Give brief, direct feedback on this training session.

Session date: ${date}
Planned session: ${plannedLabel ?? sessionType}
What happened: ${activityLine}

Give honest, specific, actionable feedback in 2-3 sentences. Focus on: execution quality, what was good, one thing to watch or improve. Be direct — no padding.`;

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
              summary:       { type: 'string' },
              effort_rating: { type: 'string', enum: ['excellent', 'good', 'fair', 'poor'] },
              key_point:     { type: 'string' },
            },
            required: ['summary', 'effort_rating', 'key_point'],
          },
        },
      }),
    }
  );

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    console.error('[session-feedback] Gemini error:', geminiRes.status, errText);
    return NextResponse.json({ error: 'Gemini error' }, { status: 502 });
  }

  const geminiData = await geminiRes.json();
  const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  let feedback: Record<string, unknown>;
  try {
    feedback = JSON.parse(rawText);
  } catch {
    console.error('[session-feedback] JSON parse failed:', rawText);
    return NextResponse.json({ error: 'Failed to parse Gemini response' }, { status: 500 });
  }

  // Save to DB — upsert the session row with feedback
  await supabase
    .from('completed_sessions')
    .upsert({
      user_id: userId,
      date,
      session_type: sessionType,
      status: 'done',
      coach_feedback: feedback,
    }, { onConflict: 'user_id,date,session_type' });

  console.log('[session-feedback] Generated feedback for user:', userId, 'date:', date);
  return NextResponse.json({ feedback, cached: false });
}
