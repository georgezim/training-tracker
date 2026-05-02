'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import ZoneChart from '@/components/ZoneChart';
import { ZoneBoundaries } from '@/lib/zones';

type TestType = 'maf' | 'threshold' | 'cooper';

const PROTOCOLS: Record<TestType, { name: string; icon: string; steps: string[]; fields: string[] }> = {
  maf: {
    name: 'MAF Test',
    icon: '🫀',
    steps: [
      '10-min easy warm-up',
      'Run 3km (beginner) or 5km (intermediate/advanced) at MAF HR ± 3bpm',
      'MAF HR = 180 minus your age (adjust ±5 for training level)',
      'Record: avg pace per km, avg HR',
    ],
    fields: ['distance_m', 'avg_heartrate', 'avg_pace_ms'],
  },
  threshold: {
    name: 'Threshold Test',
    icon: '🔥',
    steps: [
      '15-min warm-up with 3×30s strides',
      'Run 30 minutes as hard as you can sustain (RPE 7-8/10)',
      'The avg HR of the LAST 20 minutes = your LTHR',
      'Record: avg pace, avg HR, avg HR last 20min (= LTHR)',
    ],
    fields: ['avg_heartrate', 'lthr', 'avg_pace_ms', 'distance_m'],
  },
  cooper: {
    name: 'Cooper Test',
    icon: '⚡',
    steps: [
      '10-min easy warm-up',
      'Run as FAR as possible in exactly 12 minutes on flat terrain',
      'VO2max estimate = (distance_meters − 504.9) / 44.73',
      'Record: distance in meters, avg HR',
    ],
    fields: ['distance_m', 'avg_heartrate'],
  },
};

export default function TestDetailPage() {
  const { type } = useParams<{ type: string }>();
  const router = useRouter();
  const testType = type as TestType;
  const protocol = PROTOCOLS[testType];

  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<'protocol' | 'enter'>('protocol');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ zones?: ZoneBoundaries; estimatedVo2max?: number } | null>(null);

  // Form fields
  const [testDate, setTestDate] = useState(new Date().toISOString().split('T')[0]);
  const [distanceM, setDistanceM] = useState('');
  const [avgHR, setAvgHR] = useState('');
  const [maxHR, setMaxHR] = useState('');
  const [lthr, setLthr] = useState('');
  const [paceMin, setPaceMin] = useState('');
  const [paceSec, setPaceSec] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ).auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/signin');
      else setUserId(user.id);
    });
  }, [router]);

  if (!protocol) return (
    <main className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-gray-400">Unknown test type</p>
    </main>
  );

  const avgPaceMs = paceMin && paceSec ? 1000 / ((parseInt(paceMin) * 60 + parseInt(paceSec))) : null;

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    const res = await fetch('/api/zone-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        testType,
        testDate,
        distanceM: distanceM ? parseFloat(distanceM) : null,
        avgHeartrate: avgHR ? parseFloat(avgHR) : null,
        maxHeartrate: maxHR ? parseFloat(maxHR) : null,
        lthr: lthr ? parseFloat(lthr) : null,
        avgPaceMs,
        notes: notes || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.error) {
      setResult(data);
    }
  };

  // maxHR is captured in the form but forwarded to the API — suppress unused-variable lint
  void maxHR;

  return (
    <main className="min-h-screen bg-black text-white pb-24">
      <div className="px-4 pt-12 pb-4">
        <button onClick={() => router.back()} className="text-gray-500 text-sm mb-4">← Back</button>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">{protocol.icon}</span>
          <h1 className="text-xl font-bold">{protocol.name}</h1>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-900 rounded-xl p-1 mb-6">
          {(['protocol', 'enter'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t ? 'bg-white text-black' : 'text-gray-400'}`}
            >
              {t === 'protocol' ? '📋 Protocol' : '✏️ Enter results'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'protocol' && (
        <div className="px-4">
          <h2 className="text-white font-semibold mb-3">How to run this test</h2>
          <div className="space-y-3">
            {protocol.steps.map((step, i) => (
              <div key={i} className="flex gap-3 bg-gray-900 rounded-xl px-4 py-3">
                <span className="text-gray-500 text-sm font-bold w-5 flex-shrink-0">{i + 1}.</span>
                <p className="text-gray-300 text-sm leading-relaxed">{step}</p>
              </div>
            ))}
          </div>
          <button
            onClick={() => setTab('enter')}
            className="w-full mt-6 bg-blue-600 text-white font-semibold py-4 rounded-2xl text-sm hover:bg-blue-700 transition-colors"
          >
            Enter results →
          </button>
        </div>
      )}

      {tab === 'enter' && !result && (
        <div className="px-4 space-y-4">
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Test date</label>
            <input type="date" value={testDate} onChange={e => setTestDate(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>

          {protocol.fields.includes('distance_m') && (
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Distance (meters)</label>
              <input type="number" placeholder="e.g. 3000" value={distanceM} onChange={e => setDistanceM(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
          )}

          {protocol.fields.includes('avg_heartrate') && (
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Avg Heart Rate (bpm)</label>
              <input type="number" placeholder="e.g. 155" value={avgHR} onChange={e => setAvgHR(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
          )}

          {protocol.fields.includes('lthr') && (
            <div>
              <label className="text-gray-400 text-xs mb-1 block">LTHR — last 20min avg HR (bpm)</label>
              <input type="number" placeholder="e.g. 168" value={lthr} onChange={e => setLthr(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
          )}

          {protocol.fields.includes('avg_pace_ms') && (
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Avg Pace (min:sec per km)</label>
              <div className="flex gap-2">
                <input type="number" placeholder="min" value={paceMin} onChange={e => setPaceMin(e.target.value)}
                  className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
                <input type="number" placeholder="sec" value={paceSec} onChange={e => setPaceSec(e.target.value)}
                  className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
          )}

          <div>
            <label className="text-gray-400 text-xs mb-1 block">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="How did it feel? Weather, terrain..."
              className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-blue-600 text-white font-semibold py-4 rounded-2xl text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save results'}
          </button>
        </div>
      )}

      {tab === 'enter' && result && (
        <div className="px-4 space-y-6">
          <div className="bg-green-500/10 border border-green-500/20 rounded-2xl px-4 py-4">
            <p className="text-green-400 font-semibold text-sm">✅ Test saved!</p>
          </div>

          {result.estimatedVo2max != null && (
            <div className="bg-gray-900 rounded-2xl px-4 py-4">
              <p className="text-gray-400 text-xs mb-1">Estimated VO2max</p>
              <p className="text-white text-3xl font-bold">{result.estimatedVo2max}</p>
              <p className="text-gray-500 text-xs mt-1">ml/kg/min</p>
            </div>
          )}

          {result.zones && (
            <div>
              <h3 className="text-white font-semibold mb-3">Your HR Zones</h3>
              <ZoneChart zones={result.zones} />
            </div>
          )}

          <button onClick={() => router.push('/tests')} className="w-full bg-gray-900 text-white py-4 rounded-2xl text-sm font-medium hover:bg-gray-800 transition-colors">
            Back to tests
          </button>
        </div>
      )}
    </main>
  );
}
