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

    const goalLabel = profile.goal === 'other'
      ? (profile.goal_other || 'general fitness')
      : (profile.goal?.replace('_', ' ') || 'general fitness');

    const equipmentList = Array.isArray(profile.equipment)
      ? profile.equipment.join(', ')
      : 'outdoor running';

    const prompt = `You are an expert fitness coach. Create a personalised 7-day weekly training plan for this athlete.

ATHLETE PROFILE:
- Goal: ${goalLabel}
- Training days per week: ${profile.days_per_week || 4}
- Training level: ${profile.training_level || 'intermediate'}
- Age: ${profile.age || 'unknown'}
- Current activity level: ${profile.current_activity || 'active'}
- Available equipment: ${equipmentList}
- Injuries/limitations: ${profile.injury_notes || 'none'}
- Preferred long/hard day: ${profile.preferred_long_day || 'Sat'}

RULES:
- Create exactly 7 entries, one for each day (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
- Training days should equal ${profile.days_per_week || 4}. The remaining days should be rest days.
- Place the hardest or longest session on ${profile.preferred_long_day || 'Sat'}
- Spread training days evenly across the week (avoid 3 consecutive training days)
- Each workout type must be one of: "run", "gym", "bike", "rest"
- Each workout color must be one of: "blue" (for run), "purple" (for gym), "orange" (for bike), "gray" (for rest)
- For beginners, keep sessions shorter and lower intensity
- For advanced, add more volume and intensity
- If they have injuries, avoid exercises that aggravate them
- If they don't have gym access, replace gym with bodyweight or outdoor alternatives
- If they don't have a bike, replace bike with another activity they can do
- Descriptions should be specific with duration, sets/reps, or distance — not vague

Reply with ONLY a valid JSON array, no markdown, no explanation. Example format:
[
  {"day":"Mon","type":"run","label":"Easy Run","description":"30min at conversational pace, HR Zone 2","color":"blue"},
  {"day":"Tue","type":"rest","label":"Rest Day","description":"Complete rest or light stretching","color":"gray"},
  {"day":"Wed","type":"gym","label":"Full Body Strength","description":"Squats 3x10, Push-ups 3x15, Rows 3x10, Lunges 3x12 each leg","color":"purple"},
  {"day":"Thu","type":"run","label":"Interval Training","description":"Warm-up 10min, then 6x400m at 5K effort with 90s walk recoveries, cool-down 10min","color":"blue"},
  {"day":"Fri","type":"rest","label":"Rest Day","description":"Active recovery — foam rolling and mobility work","color":"gray"},
  {"day":"Sat","type":"run","label":"Long Run","description":"60min easy pace, practice fueling every 30min","color":"blue"},
  {"day":"Sun","type":"rest","label":"Rest Day","description":"Complete rest, focus on sleep and nutrition","color":"gray"}
]`;

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Extract JSON from the response (handle potential markdown wrapping)
    let jsonStr = text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const plan = JSON.parse(jsonStr);

    // Validate the plan structure
    if (!Array.isArray(plan) || plan.length !== 7) {
      throw new Error('Invalid plan structure — expected 7 days');
    }

    const validTypes = ['run', 'gym', 'bike', 'rest'];
    const validColors = ['blue', 'purple', 'orange', 'gray'];
    const validDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const cleanPlan = plan.map((entry: Record<string, string>, i: number) => ({
      day: validDays[i], // Force correct day order
      type: validTypes.includes(entry.type) ? entry.type : 'rest',
      label: String(entry.label || 'Workout').slice(0, 50),
      description: String(entry.description || '').slice(0, 200),
      color: validColors.includes(entry.color) ? entry.color : 'gray',
    }));

    // Save to profile
    const supabase = getSupabaseAdmin();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ custom_plan: cleanPlan })
      .eq('id', userId);

    if (updateError) {
      console.error('Failed to save custom plan:', updateError);
      return NextResponse.json({ error: 'Failed to save plan' }, { status: 500 });
    }

    return NextResponse.json({ plan: cleanPlan });
  } catch (err) {
    console.error('Generate plan error:', err);
    return NextResponse.json({ error: 'Failed to generate plan' }, { status: 500 });
  }
}
