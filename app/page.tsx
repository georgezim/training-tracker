'use client';

import { useEffect, useState } from 'react';
import { supabase, DailyCheckin, CompletedSession } from '@/lib/supabase';
import {
  getWorkoutForDate,
  getWorkoutDetail,
  getWeekNumber,
  getPhase,
  PHASE_NAMES,
  getNextRace,
  dateToString,
  COLOR_BG,
} from '@/lib/training-plan';
import BottomNav from '@/components/BottomNav';
import WorkoutDetailSheet from '@/components/WorkoutDetailSheet';

const FEELING_EMOJI: Record<string, string> = {
  great: '🟢',
  good:  '🔵',
  tired: '🟡',
  bad:   '🔴',
  injured: '🚨',
};

function MetricChip({
  label,
  value,
  tier,
}: {
  label: string;
  value: string;
  tier: 'green' | 'yellow' | 'red' | 'gray';
}) {
  const cls = {
    green:  'bg-green-900/60 text-green-300 border-green-700/40',
    yellow: 'bg-yellow-900/60 text-yellow-300 border-yellow-700/40',
    red:    'bg-red-900/60 text-red-300 border-red-700/40',
    gray:   'bg-gray-800 text-gray-400 border-gray-700',
  }[tier];

  return (
    <div className={`rounded-xl px-3 py-2 border ${cls}`}>
      <p className="text-xs opacity-60 leading-none mb-0.5">{label}</p>
      <p className="text-sm font-bold leading-none">{value}</p>
    </div>
  );
}

function recoveryTier(v: number | null): 'green' | 'yellow' | 'red' | 'gray' {
  if (v === null) return 'gray';
  if (v >= 70) return 'green';
  if (v >= 33) return 'yellow';
  return 'red';
}
function sleepTier(v: number | null): 'green' | 'yellow' | 'red' | 'gray' {
  if (v === null) return 'gray';
  if (v >= 70) return 'green';
  if (v >= 50) return 'yellow';
  return 'red';
}
function achillesTier(v: number | null): 'green' | 'yellow' | 'red' | 'gray' {
  if (v === null) return 'gray';
  if (v === 0) return 'green';
  if (v <= 3) return 'yellow';
  return 'red';
}

export default function TodayPage() {
  const today = new Date();
  const todayStr = dateToString(today);

  const workout = getWorkoutForDate(today);
  const week = getWeekNumber(today);
  const phase = getPhase(week);
  const nextRace = getNextRace(today);

  const [checkin, setCheckin] = useState<DailyCheckin | null>(null);
  const [session, setSession] = useState<CompletedSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: ci }, { data: se }] = await Promise.all([
        supabase.from('daily_checkins').select('*').eq('date', todayStr).maybeSingle(),
        supabase.from('completed_sessions').select('*').eq('date', todayStr).eq('session_type', workout.type).maybeSingle(),
      ]);
      setCheckin(ci ?? null);
      setSession(se ?? null);
      setLoading(false);
    }
    load();
  }, [todayStr, workout.type]);

  async function toggleSession() {
    if (toggling || workout.type === 'rest') return;
    setToggling(true);
    if (session) {
      await supabase.from('completed_sessions').delete().eq('id', session.id);
      setSession(null);
    } else {
      const { data } = await supabase
        .from('completed_sessions')
        .upsert({ date: todayStr, session_type: workout.type, completed: true }, { onConflict: 'date,session_type' })
        .select()
        .single();
      if (data) setSession(data as CompletedSession);
    }
    setToggling(false);
  }

  const bgClass = COLOR_BG[workout.color] ?? 'bg-gray-700';
  const dateLabel = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gray-950" style={{ paddingBottom: '5.5rem' }}>
      {/* ── Header ── */}
      <header
        className="bg-[#1B2A4A] px-4 pb-5"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 2.5rem)' }}
      >
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between">
            <h1 className="text-white text-xl font-bold tracking-tight">Training Tracker</h1>
            {week > 0 && week <= 31 && (
              <span className="text-blue-300 text-xs font-medium bg-blue-900/40 px-2 py-1 rounded-full">
                W{week} / 31
              </span>
            )}
          </div>
          {week > 0 && week <= 31 && (
            <p className="text-blue-300/80 text-sm mt-0.5">{PHASE_NAMES[phase]}</p>
          )}
          {nextRace && (
            <div className="mt-3 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 flex items-center gap-2">
              <span className="text-lg">{nextRace.race.emoji}</span>
              <div>
                <p className="text-white text-sm font-semibold leading-tight">{nextRace.race.name}</p>
                <p className="text-blue-300 text-xs">
                  {nextRace.daysUntil === 0
                    ? 'TODAY — Race day!'
                    : nextRace.daysUntil === 1
                    ? 'Tomorrow!'
                    : `${nextRace.daysUntil} days away`}
                </p>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-5 space-y-4">
        <p className="text-gray-500 text-sm">{dateLabel}</p>

        {/* ── Workout Card ── */}
        <div
          className={`rounded-2xl p-5 ${bgClass} relative overflow-hidden cursor-pointer active:scale-[0.98] transition-transform`}
          onClick={() => setShowDetail(true)}
        >
          {/* Subtle background texture */}
          <div className="absolute inset-0 opacity-10 bg-gradient-to-br from-white to-transparent" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-white/70 text-xs font-semibold uppercase tracking-widest">
                {workout.type === 'rest' ? 'Rest Day' : workout.type}
              </span>
              {session && (
                <span className="flex items-center gap-1 text-xs text-green-300 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                  Done
                </span>
              )}
            </div>
            <h2 className="text-white text-2xl font-bold leading-tight">{workout.label}</h2>
            <p className="text-white/75 text-sm mt-2 leading-relaxed">{workout.description}</p>
            <p className="text-white/40 text-xs mt-2">Tap for full workout details →</p>

            {workout.type !== 'rest' && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleSession(); }}
                disabled={toggling}
                className={`mt-4 w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-95 ${
                  session
                    ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                    : 'bg-white text-gray-900 shadow-sm'
                }`}
              >
                {toggling ? '…' : session ? '✓  Completed' : 'Mark as Done'}
              </button>
            )}
          </div>
        </div>

        {/* ── Warnings ── */}
        {checkin?.achilles_pain != null && checkin.achilles_pain > 3 && (
          <div className="bg-red-950 border border-red-700/60 rounded-xl px-4 py-3">
            <p className="text-red-300 text-sm font-semibold">⚠️ Achilles Alert — {checkin.achilles_pain}/10</p>
            <p className="text-red-200/80 text-xs mt-1">
              Consider reducing today's intensity. Ice after, do eccentric heel drops, and monitor carefully.
            </p>
          </div>
        )}

        {checkin?.whoop_recovery != null && checkin.whoop_recovery < 33 && (
          <div className="bg-yellow-950 border border-yellow-700/60 rounded-xl px-4 py-3">
            <p className="text-yellow-300 text-sm font-semibold">⚡ Low Recovery — {checkin.whoop_recovery}%</p>
            <p className="text-yellow-200/80 text-xs mt-1">
              Keep today easy. Focus on sleep and nutrition tonight.
            </p>
          </div>
        )}

        {/* ── Today's Check-in ── */}
        {!loading && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold text-sm">Today's Check-in</h3>
              <a href="/checkin" className="text-blue-400 text-sm font-medium">
                {checkin ? 'Edit →' : 'Log now →'}
              </a>
            </div>

            {checkin ? (
              <div className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  {checkin.whoop_recovery != null && (
                    <MetricChip label="Recovery" value={`${checkin.whoop_recovery}%`} tier={recoveryTier(checkin.whoop_recovery)} />
                  )}
                  {checkin.sleep_score != null && (
                    <MetricChip label="Sleep" value={`${checkin.sleep_score}%`} tier={sleepTier(checkin.sleep_score)} />
                  )}
                  {checkin.achilles_pain != null && (
                    <MetricChip label="Achilles" value={`${checkin.achilles_pain}/10`} tier={achillesTier(checkin.achilles_pain)} />
                  )}
                </div>
                {checkin.feeling && (
                  <p className="text-gray-300 text-sm">
                    {FEELING_EMOJI[checkin.feeling]}{' '}
                    <span className="capitalize">{checkin.feeling}</span>
                  </p>
                )}
                {checkin.notes && (
                  <p className="text-gray-500 text-sm italic leading-relaxed">"{checkin.notes}"</p>
                )}
              </div>
            ) : (
              <p className="text-gray-600 text-sm">Nothing logged yet — tap Log now to add your metrics.</p>
            )}
          </div>
        )}
      </main>

      <BottomNav active="today" />

      {showDetail && (
        <WorkoutDetailSheet
          workout={workout}
          detail={getWorkoutDetail(today)}
          dateLabel={dateLabel}
          onClose={() => setShowDetail(false)}
        />
      )}
    </div>
  );
}
