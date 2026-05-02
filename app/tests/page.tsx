'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import ZoneTestCard from '@/components/ZoneTestCard';
import BottomNav from '@/components/BottomNav';

interface ZoneTest {
  id: string;
  test_type: 'maf' | 'threshold' | 'cooper';
  test_date: string;
  distance_m?: number;
  avg_heartrate?: number;
  avg_pace_ms?: number;
  lthr?: number;
  estimated_vo2max?: number;
  notes?: string;
}

interface ZoneSchedule {
  test_type: string;
  next_test_date: string;
  last_test_date?: string;
  interval_weeks: number;
}

const TEST_INFO = {
  maf: { name: 'MAF Test', desc: 'Aerobic base — pace at fixed HR', icon: '🫀', interval: '4 weeks' },
  threshold: { name: 'Threshold Test', desc: 'Lactate threshold HR + zone calibration', icon: '🔥', interval: '6–8 weeks' },
  cooper: { name: 'Cooper Test', desc: 'VO2max estimate — 12 min max effort', icon: '⚡', interval: '8–12 weeks' },
};

export default function TestsPage() {
  const router = useRouter();
  const [, setUserId] = useState<string | null>(null);
  const [tests, setTests] = useState<ZoneTest[]>([]);
  const [schedule, setSchedule] = useState<ZoneSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/signin'); return; }
      setUserId(user.id);

      const [testsRes, scheduleRes] = await Promise.all([
        supabase.from('zone_tests').select('*').eq('user_id', user.id).order('test_date', { ascending: false }),
        supabase.from('zone_test_schedule').select('*').eq('user_id', user.id),
      ]);

      setTests(testsRes.data ?? []);
      setSchedule(scheduleRes.data ?? []);
      setLoading(false);
    };
    load();
  }, [router]);

  const today = new Date().toISOString().split('T')[0];
  const dueTests = schedule.filter(s => s.next_test_date <= today);

  const getLastTest = (type: string) => tests.find(t => t.test_type === type);
  const getPreviousTest = (type: string, current: ZoneTest) => tests.find(t => t.test_type === type && t.id !== current.id);

  // Suppress unused variable warning — getLastTest is available for future use
  void getLastTest;

  if (loading) return (
    <main className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </main>
  );

  return (
    <main className="min-h-screen bg-black text-white pb-24">
      <div className="px-4 pt-12 pb-6">
        <button onClick={() => router.back()} className="text-gray-500 text-sm mb-4">← Back</button>
        <h1 className="text-2xl font-bold">Zone Tests</h1>
        <p className="text-gray-400 text-sm mt-1">Track your fitness and calibrate training zones</p>
      </div>

      {/* Due tests nudge */}
      {dueTests.length > 0 && (
        <div className="px-4 mb-6">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl px-4 py-3">
            <p className="text-blue-400 text-sm font-semibold">{dueTests.length} test{dueTests.length > 1 ? 's' : ''} due</p>
            <p className="text-gray-400 text-xs mt-0.5">{dueTests.map(t => TEST_INFO[t.test_type as keyof typeof TEST_INFO]?.name).join(', ')}</p>
          </div>
        </div>
      )}

      {/* Available tests */}
      <div className="px-4 mb-8">
        <h2 className="text-white font-semibold mb-3">Available Tests</h2>
        <div className="space-y-3">
          {(Object.keys(TEST_INFO) as Array<keyof typeof TEST_INFO>).map(type => {
            const info = TEST_INFO[type];
            const sched = schedule.find(s => s.test_type === type);
            const isDue = sched ? sched.next_test_date <= today : true;
            return (
              <button
                key={type}
                onClick={() => router.push(`/tests/${type}`)}
                className="w-full bg-gray-900 border border-gray-800 rounded-2xl px-4 py-4 text-left flex items-center justify-between hover:border-gray-600 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{info.icon}</span>
                  <div>
                    <p className="text-white font-semibold text-sm">{info.name}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{info.desc}</p>
                    <p className="text-gray-600 text-xs mt-0.5">Every {info.interval}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {isDue && <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">Due</span>}
                  <span className="text-gray-600 text-xs">→</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* History */}
      {tests.length > 0 && (
        <div className="px-4">
          <h2 className="text-white font-semibold mb-3">History</h2>
          <div className="space-y-3">
            {tests.map(test => (
              <ZoneTestCard
                key={test.id}
                test={test}
                previous={getPreviousTest(test.test_type, test) ?? null}
              />
            ))}
          </div>
        </div>
      )}

      {tests.length === 0 && (
        <div className="px-4 text-center py-8">
          <p className="text-gray-500 text-sm">No tests yet — run your first test to calibrate your zones.</p>
        </div>
      )}

      <BottomNav active="tests" />
    </main>
  );
}
