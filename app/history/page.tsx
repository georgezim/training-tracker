'use client';

import { useEffect, useState } from 'react';
import { supabase, DailyCheckin } from '@/lib/supabase';
import { getWorkoutForDate, parseLocalDate, COLOR_TEXT } from '@/lib/training-plan';
import BottomNav from '@/components/BottomNav';

const FEELING_EMOJI: Record<string, string> = {
  great:   '🟢',
  good:    '🔵',
  tired:   '🟡',
  bad:     '🔴',
  injured: '🚨',
};

type Tier = 'green' | 'yellow' | 'red' | 'gray';

function tier(value: number | null, type: 'recovery' | 'sleep' | 'achilles'): Tier {
  if (value === null) return 'gray';
  if (type === 'recovery') return value >= 70 ? 'green' : value >= 33 ? 'yellow' : 'red';
  if (type === 'sleep')    return value >= 70 ? 'green' : value >= 50 ? 'yellow' : 'red';
  if (type === 'achilles') return value === 0 ? 'green' : value <= 3 ? 'yellow' : 'red';
  return 'gray';
}

const TIER_CLS: Record<Tier, string> = {
  green:  'bg-green-900/50 text-green-300',
  yellow: 'bg-yellow-900/50 text-yellow-300',
  red:    'bg-red-900/50 text-red-300',
  gray:   'bg-gray-800 text-gray-500',
};

function Badge({ label, value, t }: { label: string; value: string; t: Tier }) {
  return (
    <span className={`inline-flex flex-col items-center rounded-lg px-2.5 py-1.5 ${TIER_CLS[t]}`}>
      <span className="text-xs opacity-60 leading-none">{label}</span>
      <span className="text-xs font-bold leading-tight mt-0.5">{value}</span>
    </span>
  );
}

export default function HistoryPage() {
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from('daily_checkins')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(90);
      if (data) setCheckins(data as DailyCheckin[]);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500">Loading history…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950" style={{ paddingBottom: '5.5rem' }}>
      {/* ── Header ── */}
      <header
        className="bg-[#1B2A4A] px-4 pb-5"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 2.5rem)' }}
      >
        <div className="max-w-md mx-auto">
          <h1 className="text-white text-xl font-bold">History</h1>
          <p className="text-blue-300/80 text-sm mt-0.5">
            {checkins.length === 0
              ? 'No check-ins yet'
              : `${checkins.length} check-in${checkins.length === 1 ? '' : 's'} logged`}
          </p>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-2">
        {checkins.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-400 font-medium">No check-ins yet</p>
            <p className="text-gray-600 text-sm mt-1">
              Head to the Check-in tab to start logging!
            </p>
          </div>
        )}

        {checkins.map((ci) => {
          const date = parseLocalDate(ci.date);
          const workout = getWorkoutForDate(date);
          const colorText = COLOR_TEXT[workout.color] ?? 'text-gray-500';

          const dateLabel = date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });

          return (
            <div
              key={ci.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4"
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold">{dateLabel}</p>
                  <p className={`text-xs mt-0.5 truncate ${colorText}`}>{workout.label}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {ci.feeling && (
                    <>
                      <span className="text-base leading-none">{FEELING_EMOJI[ci.feeling]}</span>
                      <span className="text-gray-400 text-xs capitalize">{ci.feeling}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Metrics */}
              <div className="flex gap-2 flex-wrap">
                {ci.whoop_recovery != null && (
                  <Badge label="Recovery" value={`${ci.whoop_recovery}%`} t={tier(ci.whoop_recovery, 'recovery')} />
                )}
                {ci.sleep_score != null && (
                  <Badge label="Sleep" value={`${ci.sleep_score}%`} t={tier(ci.sleep_score, 'sleep')} />
                )}
                {ci.sleep_hours != null && (
                  <Badge label="Sleep" value={`${ci.sleep_hours}h`} t={ci.sleep_hours >= 7 ? 'green' : ci.sleep_hours >= 5.5 ? 'yellow' : 'red'} />
                )}
                {ci.achilles_pain != null && (
                  <Badge label="Achilles" value={`${ci.achilles_pain}/10`} t={tier(ci.achilles_pain, 'achilles')} />
                )}
              </div>

              {/* Notes */}
              {ci.notes && (
                <p className="text-gray-500 text-xs mt-2 italic leading-relaxed">"{ci.notes}"</p>
              )}
            </div>
          );
        })}
      </main>

      <BottomNav active="history" />
    </div>
  );
}
