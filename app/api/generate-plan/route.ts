import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, profile } = body;

    if (!userId || !profile) {
      return NextResponse.json({ error: 'Missing userId or profile' }, { status: 400 });
    }

    // ── Env var check ────────────────────────────────────────────────────────
    const hasGeminiKey = !!process.env.GEMINI_API_KEY;
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    const hasSupabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    console.log('[generate-plan] START', {
      userId,
      goal: profile.goal,
      hasGeminiKey,
      hasServiceKey,
      hasSupabaseUrl,
    });

    if (!hasGeminiKey) {
      console.error('[generate-plan] MISSING GEMINI_API_KEY');
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }
    if (!hasServiceKey) {
      console.error('[generate-plan] MISSING SUPABASE_SERVICE_ROLE_KEY');
      return NextResponse.json({ error: 'Supabase service role key not configured' }, { status: 500 });
    }

    const goalLabel = profile.goal === 'other'
      ? (profile.goal_other || 'general fitness')
      : (profile.goal?.replace(/_/g, ' ') || 'general fitness');

    const equipmentList = Array.isArray(profile.equipment)
      ? profile.equipment.join(', ')
      : 'outdoor running';

    const preferredActivities = Array.isArray(profile.preferred_activities) && profile.preferred_activities.length > 0
      ? profile.preferred_activities.join(', ')
      : 'running, strength training';

    const raceGoals = ['marathon', 'half_marathon', '10k'];
    const isRaceGoal = raceGoals.includes(profile.goal);

    let prompt: string;

    if (isRaceGoal) {
      // For race goals: generate a weekly activity-type template
      // The app applies phase-appropriate intensity/distances on top of this structure
      prompt = `You are an expert endurance coach. Create a personalised weekly training STRUCTURE for a ${goalLabel} athlete.

IMPORTANT: This is a recurring weekly TEMPLATE. The app automatically adjusts workout intensity, distances, and descriptions based on the current training phase (Base Building → Build/Volume → Race Specific → Taper). You only define WHAT activity type happens each day — keep labels and descriptions short/generic.

ATHLETE PROFILE:
- Goal: ${goalLabel}
- Training days per week: ${profile.days_per_week || 4}
- Training level: ${profile.training_level || 'intermediate'}
- Preferred activities: ${preferredActivities}
- Preferred long run day: ${profile.preferred_long_day || 'Sat'}
- Available equipment: ${equipmentList}
- Injuries/limitations: ${profile.injury_notes || 'none'}

RULES:
- Create exactly 7 entries (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
- Total training days must equal ${profile.days_per_week || 4}. The rest are "rest" days.
- The preferred long run day (${profile.preferred_long_day || 'Sat'}) MUST be "run" type (long run day)
- Include at least 2 "run" days for marathon/half marathon training (1 easy + 1 long), or 1 for 10K
- Only include "bike" if cycling is in their preferred activities AND they have the equipment
- Only include "gym" if strength training is in their preferred activities AND they have gym access
- If they prefer swimming (pool), use "bike" type with label "Swim" (cross-training)
- Do NOT schedule 3 consecutive training days
- Keep labels generic: "Run", "Long Run", "Strength", "Bike", "Swim", "Rest Day"
- Keep descriptions to one short sentence — the app replaces them with phase-specific details

Workout types: "run", "gym", "bike", "rest"
Colors: "blue" (run), "purple" (gym), "orange" (bike/swim), "gray" (rest)

Reply with ONLY a valid JSON array, no markdown, no explanation:
[{"day":"Mon","type":"run","label":"Run","description":"Training run — intensity by phase","color":"blue"}, ...]`;
    } else {
      // For non-race goals: generate a full 7-day plan with specific workouts
      prompt = `You are an expert fitness coach. Create a personalised 7-day weekly training plan for this athlete.

ATHLETE PROFILE:
- Goal: ${goalLabel}
- Training days per week: ${profile.days_per_week || 4}
- Training level: ${profile.training_level || 'intermediate'}
- Age: ${profile.age || 'unknown'}
- Current activity level: ${profile.current_activity || 'active'}
- Preferred activities: ${preferredActivities}
- Available equipment: ${equipmentList}
- Injuries/limitations: ${profile.injury_notes || 'none'}
- Preferred long/hard day: ${profile.preferred_long_day || 'Sat'}

RULES:
- Create exactly 7 entries, one for each day (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
- Training days should equal ${profile.days_per_week || 4}. The remaining days should be rest days.
- Place the hardest or longest session on ${profile.preferred_long_day || 'Sat'}
- Spread training days evenly across the week (avoid 3 consecutive training days)
- Only include activities the athlete listed in their preferred activities
- Each workout type must be one of: "run", "gym", "bike", "rest"
- Each workout color: "blue" (run), "purple" (gym), "orange" (bike), "gray" (rest)
- For beginners, keep sessions shorter and lower intensity
- For advanced, add more volume and intensity
- If they have injuries, avoid exercises that aggravate them
- If they don't have gym access, replace gym with bodyweight or outdoor alternatives
- If they don't have a bike, replace bike with another activity they can do
- Descriptions should be specific with duration, sets/reps, or distance — not vague

Reply with ONLY a valid JSON array, no markdown, no explanation:
[
  {"day":"Mon","type":"run","label":"Easy Run","description":"30min at conversational pace, HR Zone 2","color":"blue"},
  ...
]`;
    }

    console.log('[generate-plan] Calling Gemini — goal:', profile.goal, 'isRaceGoal:', isRaceGoal);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    console.log('[generate-plan] Gemini raw response (first 300 chars):', text.slice(0, 300));

    // Extract JSON from the response (handle potential markdown wrapping)
    let jsonStr = text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    let plan;
    try {
      plan = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error('[generate-plan] JSON parse failed. Raw text:', text);
      throw new Error(`JSON parse error: ${parseErr}`);
    }

    // Validate the plan structure
    if (!Array.isArray(plan) || plan.length !== 7) {
      console.error('[generate-plan] Invalid plan length:', plan?.length, JSON.stringify(plan).slice(0, 200));
      throw new Error(`Invalid plan structure — expected 7 days, got ${plan?.length}`);
    }
    console.log('[generate-plan] Plan parsed OK — days:', plan.map((d: Record<string, string>) => `${d.day}:${d.type}`).join(', '));

    const validTypes = ['run', 'gym', 'bike', 'rest'];
    const validColors = ['blue', 'purple', 'orange', 'gray'];
    const validDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const cleanPlan = plan.map((entry: Record<string, string>, i: number) => ({
      day: validDays[i], // Force correct day order
      type: validTypes.includes(entry.type) ? entry.type : 'rest',
      label: String(entry.label || 'Workout').slice(0, 60),
      description: String(entry.description || '').slice(0, 200),
      color: validColors.includes(entry.color) ? entry.color : 'gray',
    }));

    // Save to profile
    console.log('[generate-plan] Saving plan to Supabase for user:', userId);
    const supabase = getSupabaseAdmin();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ custom_plan: cleanPlan })
      .eq('id', userId);

    if (updateError) {
      console.error('[generate-plan] Supabase update failed:', updateError);
      return NextResponse.json({ error: 'Failed to save plan', detail: updateError.message }, { status: 500 });
    }

    console.log('[generate-plan] SUCCESS — plan saved for user:', userId);
    return NextResponse.json({ plan: cleanPlan });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[generate-plan] FATAL ERROR:', msg);
    return NextResponse.json({ error: 'Failed to generate plan', detail: msg }, { status: 500 });
  }
}
