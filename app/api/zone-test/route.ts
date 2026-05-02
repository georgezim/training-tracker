import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { zonesFromLTHR, cooperVO2max } from '@/lib/zones';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, testType, testDate, distanceM, durationS, avgHeartrate, maxHeartrate, avgPaceMs, lthr, stravaId, notes } = body;

  if (!userId || !testType || !testDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Compute derived fields
  let estimatedVo2max: number | null = null;
  let zones = null;

  if (testType === 'cooper' && distanceM) {
    estimatedVo2max = cooperVO2max(distanceM);
  }

  if (testType === 'threshold' && lthr) {
    zones = zonesFromLTHR(lthr);
  }

  // Upsert test result
  const { data, error } = await supabase
    .from('zone_tests')
    .upsert({
      user_id: userId,
      test_type: testType,
      test_date: testDate,
      distance_m: distanceM ?? null,
      duration_s: durationS ?? null,
      avg_heartrate: avgHeartrate ?? null,
      max_heartrate: maxHeartrate ?? null,
      avg_pace_ms: avgPaceMs ?? null,
      lthr: lthr ?? null,
      estimated_vo2max: estimatedVo2max,
      zones,
      strava_id: stravaId ?? null,
      notes: notes ?? null,
    }, { onConflict: 'user_id,test_type,test_date' })
    .select()
    .single();

  if (error) {
    console.error('[zone-test] upsert error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update schedule: set last_test_date and compute next_test_date
  const intervalWeeks = testType === 'maf' ? 4 : testType === 'threshold' ? 6 : 10;
  const next = new Date(testDate);
  next.setDate(next.getDate() + intervalWeeks * 7);
  const nextTestDate = next.toISOString().split('T')[0];

  await supabase
    .from('zone_test_schedule')
    .upsert({
      user_id: userId,
      test_type: testType,
      last_test_date: testDate,
      next_test_date: nextTestDate,
      interval_weeks: intervalWeeks,
    }, { onConflict: 'user_id,test_type' });

  return NextResponse.json({ result: data, zones, estimatedVo2max });
}
