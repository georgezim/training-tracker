'use client';

import { useEffect, useState } from 'react';
import { supabase, DailyCheckin, CompletedSession } from '@/lib/supabase';
import {
  getWorkoutForDate,
  getWorkoutDetail,
  getWeekNumber,
  getPhase,
  PHASE_NAMES,
  dateToString,
  COLOR_BG,
} from '@/lib/training-plan';
import BottomNav from '@/components/BottomNav';
import WorkoutDetailSheet from '@/components/WorkoutDetailSheet';
import StravaActivityCard from '@/components/StravaActivityCard';
import AiCoachCard from '@/components/AiCoachCard';
import { useStravaActivity } from '@/lib/useStravaActivity';

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

interface UserRace { id: string; name: string; date: string; distance: string; emoji: string; }
function daysUntil(dateStr: string, today: Date): number {
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((d.getTime() - t.getTime()) / (24 * 60 * 60 * 1000));
}

export default function TodayPage() {
  const today = new Date();
  const todayStr = dateToString(today);

  const workout = getWorkoutForDate(today);
  const week = getWeekNumber(today);
  const phase = getPhase(week);

  const [checkin, setCheckin] = useState<DailyCheckin | null>(null);
  const [session, setSession] = useState<CompletedSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const { activity: stravaActivity, connected: stravaConnected } = useStravaActivity(todayStr);

  // Read Strava OAuth result from URL params
  const [stravaMsg, setStravaMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('strava');
    const detail = params.get('detail');
    if (status === 'connected') {
      setStravaMsg({ type: 'success', text: 'Strava connected! Go to Sessions tab and tap Sync to import your history.' });
    } else if (status === 'error' || status === 'dberror') {
      setStravaMsg({ type: 'error', text: `Connection failed: ${detail ? decodeURIComponent(detail) : status}` });
    } else if (status === 'denied') {
      setStravaMsg({ type: 'error', text: 'Strava authorization was denied.' });
    }
    // Clean up URL
    if (status) window.history.replaceState({}, '', '/');
  }, []);

  // AI Coach
  const [aiCoach, setAiCoach] = useState<{ title: string; description: string } | null>(null);
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ai_coach_today');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.date === todayStr) setAiCoach(parsed);
      }
    } catch {}
  }, [todayStr]);

  // Races
  const [races, setRaces] = useState<UserRace[]>([]);
  const [editingRaces, setEditingRaces] = useState(false);
  const [editRaces, setEditRaces] = useState<UserRace[]>([]);

  function openRaceEditor() { setEditRaces([...races]); setEditingRaces(true); }
  async function saveRaceEdits() {
    if (!userId) return;
    const valid = editRaces.filter(r => r.name && r.date);
    setRaces(valid);
    setEditingRaces(false);
    await supabase.from('profiles').update({ races: valid }).eq('id', userId);
  }
  function updateEditRace(id: string, field: keyof UserRace, value: string) {
    setEditRaces(r => r.map(race => race.id === id ? { ...race, [field]: value } : race));
  }
  function addRace() {
    if (editRaces.length >= 3) return;
    setEditRaces(r => [...r, { id: Date.now().toString(), name: '', date: '', distance: '', emoji: '🏅' }]);
  }
  function removeRace(id: string) { setEditRaces(r => r.filter(race => race.id !== id)); }

  const upcomingRaces = races
    .map(r => ({ ...r, daysLeft: daysUntil(r.date, today) }))
    .filter(r => r.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [{ data: ci }, { data: se }, { data: profile }] = await Promise.all([
        supabase.from('daily_checkins').select('*').eq('user_id', user.id).eq('date', todayStr).maybeSingle(),
        supabase.from('completed_sessions').select('*').eq('user_id', user.id).eq('date', todayStr).eq('session_type', workout.type).maybeSingle(),
        supabase.from('profiles').select('races').eq('id', user.id).maybeSingle(),
      ]);
      setUserId(user.id);
      setCheckin(ci ?? null);
      setSession(se ?? null);
      setRaces(profile?.races ?? []);
      setLoading(false);
    }
    load();
  }, [todayStr, workout.type]);

  async function toggleSession() {
    if (toggling || workout.type === 'rest') return;
    setToggling(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setToggling(false); return; }
    if (session) {
      await supabase.from('completed_sessions').delete().eq('id', session.id);
      setSession(null);
    } else {
      const { data } = await supabase
        .from('completed_sessions')
        .upsert({ user_id: user.id, date: todayStr, session_type: workout.type, completed: true }, { onConflict: 'user_id,date,session_type' })
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
            <form action="/api/auth/logout" method="POST">
              <button type="submit" className="text-gray-500 text-xs px-2 py-1 hover:text-gray-300">Sign out</button>
            </form>
            {week > 0 && week <= 31 && (
              <span className="text-blue-300 text-xs font-medium bg-blue-900/40 px-2 py-1 rounded-full">
                W{week} / 31
              </span>
            )}
          </div>
          {week > 0 && week <= 31 && (
            <p className="text-blue-300/80 text-sm mt-0.5">{PHASE_NAMES[phase]}</p>
          )}
          {/* Races */}
          <div className="mt-3 space-y-2">
            {upcomingRaces.slice(0, 3).map(r => (
              <div key={r.id} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 flex items-center gap-2">
                <span className="text-lg">{r.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold leading-tight truncate">{r.name}</p>
                  <p className="text-blue-300 text-xs">
                    {r.daysLeft === 0 ? 'TODAY — Race day!' : r.daysLeft === 1 ? 'Tomorrow!' : `${r.daysLeft} days away`}
                    {r.distance ? ` · ${r.distance}` : ''}
                  </p>
                </div>
              </div>
            ))}
            <button onClick={openRaceEditor} className="text-blue-400/60 text-xs w-full text-center py-1">
              Edit races ✏️
            </button>
          </div>
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

        {/* ── AI Coach ── */}
        {aiCoach && (
          <AiCoachCard
            coach={aiCoach}
            onDismiss={() => {
              setAiCoach(null);
              localStorage.removeItem('ai_coach_today');
            }}
          />
        )}

        {/* ── Strava status message ── */}
        {stravaMsg && (
          <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
            stravaMsg.type === 'success'
              ? 'bg-green-950 border border-green-700/60 text-green-300'
              : 'bg-red-950 border border-red-700/60 text-red-300'
          }`}>
            {stravaMsg.text}
          </div>
        )}

        {/* ── Strava ── */}
        {stravaConnected === false && (
          <a
            href="/api/strava/auth"
            className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 hover:border-[#FC4C02]/40 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#FC4C02">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
            </svg>
            <div>
              <p className="text-white text-sm font-semibold">Connect Strava</p>
              <p className="text-gray-500 text-xs">Auto-import your runs and rides</p>
            </div>
            <span className="ml-auto text-gray-600 text-sm">→</span>
          </a>
        )}

        {stravaConnected === true && !stravaActivity && (
          <div className="flex items-center gap-3 bg-green-950/50 border border-green-800/40 rounded-2xl px-4 py-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#FC4C02">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
            </svg>
            <div>
              <p className="text-green-300 text-sm font-semibold">Strava connected</p>
              <p className="text-green-400/60 text-xs">No activity logged for today yet</p>
            </div>
            <span className="ml-auto text-green-500 text-base">✓</span>
          </div>
        )}

        {stravaActivity && (
          <StravaActivityCard
            activity={stravaActivity}
            plannedKm={
              workout.label.match(/(\d+)km/) ? parseFloat(workout.label.match(/(\d+)km/)![1]) : undefined
            }
          />
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

      {/* Race editor modal */}
      {editingRaces && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setEditingRaces(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 rounded-t-3xl p-5 space-y-4"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)' }}>
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">Your Races</h3>
              <button onClick={() => setEditingRaces(false)} className="text-gray-500 text-2xl">×</button>
            </div>
            <p className="text-gray-500 text-xs">Up to 3 races. Tap a field to edit.</p>
            <div className="space-y-3">
              {editRaces.map((r) => (
                <div key={r.id} className="bg-gray-800 rounded-xl p-3 space-y-2">
                  <div className="flex gap-2">
                    <input
                      value={r.emoji}
                      onChange={e => updateEditRace(r.id, 'emoji', e.target.value)}
                      className="w-10 bg-gray-700 rounded-lg px-2 py-1.5 text-white text-sm text-center"
                      maxLength={2}
                    />
                    <input
                      value={r.name}
                      onChange={e => updateEditRace(r.id, 'name', e.target.value)}
                      placeholder="Race name"
                      className="flex-1 bg-gray-700 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-500"
                    />
                    <button onClick={() => removeRace(r.id)} className="text-red-400 text-lg px-1">×</button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={r.date}
                      onChange={e => updateEditRace(r.id, 'date', e.target.value)}
                      className="flex-1 bg-gray-700 rounded-lg px-3 py-1.5 text-white text-sm"
                    />
                    <input
                      value={r.distance}
                      onChange={e => updateEditRace(r.id, 'distance', e.target.value)}
                      placeholder="Distance"
                      className="w-20 bg-gray-700 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-500"
                    />
                  </div>
                </div>
              ))}
            </div>
            {editRaces.length < 3 && (
              <button onClick={addRace} className="w-full py-2 rounded-xl border border-dashed border-gray-700 text-gray-500 text-sm">
                + Add race
              </button>
            )}
            <button onClick={saveRaceEdits} className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm">
              Save
            </button>
          </div>
        </>
      )}
    </div>
  );
}
