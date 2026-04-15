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

    if (!process.env.GEMINI_API_KEY) {
      console.error('[generate-runway] MISSING GEMINI_API_KEY');
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[generate-runway] MISSING SUPABASE_SERVICE_ROLE_KEY');
      return NextResponse.json({ error: 'Supabase service role key not configured' }, { status: 500 });
    }

    console.log('[generate-runway] START', { userId, goal: profile.goal });

    const goalLabel = profile.goal === 'other'
      ? (profile.goal_other || 'general fitness')
      : (profile.goal?.replace(/_/g, ' ') || 'general fitness');

    const equipmentList = Array.isArray(profile.equipment)
      ? profile.equipment.join(', ')
      : 'outdoor running';

    const preferredActivities: string[] = Array.isArray(profile.preferred_activities) && profile.preferred_activities.length > 0
      ? profile.preferred_activities
      : ['run'];

    const preferredStr = preferredActivities.join(', ');

    const prompt = `You are an expert endurance coach. A new athlete just signed up and their training plan starts next Monday. Generate a gentle 7-day preparation week (Mon–Sun) to ease them in before the plan begins.

ATHLETE PROFILE:
- Goal: ${goalLabel}
- Training level: ${profile.training_level || 'beginner'}
- Preferred activities: ${preferredStr}
- Available equipment: ${equipmentList}
- Injuries/limitations: ${profile.injury_notes || 'none'}
- Training days per week: ${profile.days_per_week || 3}

RULES:
- This is a PREPARATION week — easy, optional, low pressure. No hard sessions.
- Maximum 3 active days across the week. The rest are rest days.
- Only suggest activities the athlete listed in their preferred activities. If they don't run, don't suggest running. If they don't have a bike, don't suggest cycling.
- All sessions must be short: runs max 25min, gym max 30min, bike max 30min.
- Intensity: easy only. No tempo, no intervals, no heavy lifting.
- If the athlete has injuries, avoid anything that aggravates them.
- Keep descriptions specific and encouraging — this is their first week with the app.
- Friday should be mobility if they have no other preference, because it's a good pre-weekend prep.
- Sunday should always be rest — plan starts Monday.

Workout types: "run", "gym", "bike", "rest"
Colors: "blue" (run), "purple" (gym), "orange" (bike), "gray" (rest)

Reply with ONLY a valid JSON array, no markdown, no explanation:
[{"day":"Mon","type":"rest","label":"Rest Day","description":"Rest up — your plan starts soon.","color":"gray"}, ...]`;

    console.log('[generate-runway] Calling Gemini');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    console.log('[generate-runway] Gemini raw response (first 300 chars):', text.slice(0, 300));

    let jsonStr = text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    let runway;
    try {
      runway = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error('[generate-runway] JSON parse failed:', text);
      throw new Error(`JSON parse error: ${parseErr}`);
    }

    if (!Array.isArray(runway) || runway.length !== 7) {
      console.error('[generate-runway] Invalid runway length:', runway?.length);
      throw new Error(`Invalid runway structure — expected 7 days, got ${runway?.length}`);
    }

    const validTypes = ['run', 'gym', 'bike', 'rest'];
    const validDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const typeToColor: Record<string, string> = { run: 'blue', gym: 'purple', bike: 'orange', rest: 'gray' };

    // Build allowed set from preferred_activities
    const allowedTypes = new Set<string>(['rest']);
    if (preferredActivities.includes('run'))  allowedTypes.add('run');
    if (preferredActivities.includes('gym'))  allowedTypes.add('gym');
    if (preferredActivities.includes('bike') || preferredActivities.includes('swim')) allowedTypes.add('bike');
    const fallbackType = (['gym', 'bike', 'run'] as const).find(t => allowedTypes.has(t)) ?? 'rest';

    const cleanRunway = runway.map((entry: Record<string, string>, i: number) => {
      let type = validTypes.includes(entry.type) ? entry.type : 'rest';
      if (!allowedTypes.has(type)) {
        console.warn(`[generate-runway] Forbidden type "${type}" — replacing with "${fallbackType}"`);
        type = fallbackType;
      }
      return {
        day: validDays[i],
        type,
        label: String(entry.label || 'Rest Day').slice(0, 60),
        description: String(entry.description || '').slice(0, 200),
        color: typeToColor[type] ?? 'gray',
      };
    });

    // Enforce max 3 active days — demote extras to rest
    let activeCount = 0;
    const enforcedRunway = cleanRunway.map((entry: { day: string; type: string; label: string; description: string; color: string }) => {
      if (entry.type === 'rest') return entry;
      activeCount++;
      if (activeCount > 3) {
        console.warn(`[generate-runway] Capping active days — demoting ${entry.day} to rest`);
        return { ...entry, type: 'rest', label: 'Rest Day', description: 'Take it easy today.', color: 'gray' };
      }
      return entry;
    });

    // Enforce Sunday = rest
    enforcedRunway[6] = { day: 'Sun', type: 'rest', label: 'Rest Day', description: 'Rest up — your plan starts tomorrow!', color: 'gray' };

    console.log('[generate-runway] Saving runway to Supabase for user:', userId);
    const supabase = getSupabaseAdmin();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ runway_plan: enforcedRunway })
      .eq('id', userId);

    if (updateError) {
      console.error('[generate-runway] Supabase update failed:', updateError);
      return NextResponse.json({ error: 'Failed to save runway plan', detail: updateError.message }, { status: 500 });
    }

    console.log('[generate-runway] SUCCESS — runway saved for user:', userId);
    return NextResponse.json({ runway: enforcedRunway });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[generate-runway] FATAL ERROR:', msg);
    return NextResponse.json({ error: 'Failed to generate runway', detail: msg }, { status: 500 });
  }
}
