'use client';

import { useEffect, useState } from 'react';
import { supabase, CompletedSession, UserProfile } from '@/lib/supabase';
import {
  getWorkoutForDateWithProfile,
  getWorkoutDetail,
  getWorkoutDuration,
  getDaysInCurrentWeek,
  getWeekStart,
  getRacePlanInfo,
  getPlanStart,
  dateToString,
  COLOR_BG,
  COLOR_TEXT,
  WorkoutInfo,
  WorkoutDetail,
  PlanProfile,
} from '@/lib/training-plan';
import BottomNav from '@/components/BottomNav';
import WorkoutDetailSheet from '@/components/WorkoutDetailSheet';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WeekPage() {
  const today = new Date();
  const todayStr = dateToString(today);
  const [weekOffset, setWeekOffset] = useState(0);

  const anchorDate = new Date(today);
  anchorDate.setDate(today.getDate() + weekOffset * 7);

  const days = getDaysInCurrentWeek(anchorDate);
  const isCurrentWeek = weekOffset === 0;

  const [sessions, setSessions] = useState<CompletedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Earliest week the user can navigate to — the week they signed up
  const minWeekOffset = (() => {
    if (!profile?.created_at) return 0;
    const createdWeekStart = getWeekStart(new Date(profile.created_at));
    const thisWeekStart = getWeekStart(today);
    return Math.round((createdWeekStart.getTime() - thisWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
  })();
  const [selectedDay, setSelectedDay] = useState<{ workout: WorkoutInfo; detail: WorkoutDetail; label: string } | null>(null);

  // Status action modal
  const [statusAction, setStatusAction] = useState<{ dateStr: string; sessionType: string } | null>(null);
  // Missed reason modal
  const [missedModal, setMissedModal] = useState<{ dateStr: string; sessionType: string } | null>(null);
  const [missedReason, setMissedReason] = useState('');
  // View reason
  const [viewReason, setViewReason] = useState<{ reason: string } | null>(null);

  const planProfile: PlanProfile | null = profile ? {
    goal: profile.goal,
    daysPerWeek: profile.days_per_week ?? 4,
    preferredLongDay: profile.preferred_long_day ?? 'Sat',
    trainingLevel: profile.training_level ?? 'intermediate',
    customPlan: profile.custom_plan ?? null,
    raceDate: profile.race_date ?? null,
    createdAt: profile.created_at ?? null,
    injuryNotes: profile.injury_notes ?? null,
    planAdjustment: profile.plan_adjustment?.multiplier ?? 1.0,
  } : null;

  // Detect if the displayed week is the runway/preparation week (before planStart)
  const planStartDate = planProfile ? getPlanStart(planProfile) : null;
  const anchorWeekStart = getWeekStart(anchorDate);
  const isRunwayWeek = planStartDate !== null &&
    anchorWeekStart.getTime() < planStartDate.getTime();

  // runway_plan indexed Mon–Sun (0–6)
  const runwayPlan = profile?.runway_plan ?? null;

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (!prof) return;
      setProfile(prof as UserProfile);

      // Monday trigger: run weekly review if today is Monday and it hasn't run yet this Monday.
      // Uses plan_adjustment.applied_at from the profile — no localStorage (breaks across devices).
      const isMonday = today.getDay() === 1;
      if (isMonday) {
        const todayIso = dateToString(today);
        const lastApplied = (prof as UserProfile).plan_adjustment?.applied_at ?? '';
        const alreadyRanToday = lastApplied.startsWith(todayIso);
        if (!alreadyRanToday) {
          fetch('/api/review-week', { method: 'POST' }).then(async res => {
            if (res.ok) {
              // Refresh profile so the new multiplier is picked up immediately
              const { data: updatedProf } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .maybeSingle();
              if (updatedProf) setProfile(updatedProf as UserProfile);
            }
          }).catch(() => { /* silent — review is non-blocking */ });
        }
      }

      // If no plan yet, trigger generation and wait for it to resolve
      if (!prof.custom_plan) {
        fetch('/api/generate-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, profile: prof }),
        })
          .then(async r => {
            const data = await r.json();
            if (data.plan) setProfile(prev => prev ? { ...prev, custom_plan: data.plan } : prev);
          })
          .catch(() => {});
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (days.length === 0 || !userId) return;
    setLoading(true);
    const startStr = dateToString(days[0]);
    const endStr = dateToString(days[6]);
    supabase
      .from('completed_sessions')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startStr)
      .lte('date', endStr)
      .then(({ data }) => {
        if (data) setSessions(data as CompletedSession[]);
        setLoading(false);
      });
  }, [weekOffset, userId]);

  function getSession(dateStr: string, sessionType: string) {
    return sessions.find(s => s.date === dateStr && s.session_type === sessionType) ?? null;
  }

  async function markDone(dateStr: string, sessionType: string) {
    if (!userId) return;
    const { data } = await supabase
      .from('completed_sessions')
      .upsert({ user_id: userId, date: dateStr, session_type: sessionType, completed: true, status: 'done' }, { onConflict: 'user_id,date,session_type' })
      .select().single();
    if (data) setSessions(prev => [...prev.filter(s => !(s.date === dateStr && s.session_type === sessionType)), data as CompletedSession]);
  }

  async function markMissed(dateStr: string, sessionType: string, reason: string) {
    if (!userId) return;
    const { data } = await supabase
      .from('completed_sessions')
      .upsert({ user_id: userId, date: dateStr, session_type: sessionType, completed: false, status: 'missed', missed_reason: reason || null }, { onConflict: 'user_id,date,session_type' })
      .select().single();
    if (data) setSessions(prev => [...prev.filter(s => !(s.date === dateStr && s.session_type === sessionType)), data as CompletedSession]);
    setMissedReason('');
  }

  async function clearSessionForDay(dateStr: string, sessionType: string) {
    const existing = sessions.find(s => s.date === dateStr && s.session_type === sessionType);
    if (!existing) return;
    await supabase.from('completed_sessions').delete().eq('id', existing.id);
    setSessions(prev => prev.filter(s => !(s.date === dateStr && s.session_type === sessionType)));
  }

  const doneSessions = sessions.filter(s => s.status === 'done').length;

  return (
    <div className="min-h-screen bg-gray-950" style={{ paddingBottom: '5.5rem' }}>
      {/* ── Header ── */}
      <header
        className="bg-[#1B2A4A] px-4 pb-5"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 2.5rem)' }}
      >
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setWeekOffset(w => w - 1)}
              disabled={weekOffset <= minWeekOffset}
              className="text-2xl leading-none px-1 transition-transform disabled:opacity-20 disabled:cursor-not-allowed active:scale-90 text-white/60 hover:text-white disabled:hover:text-white/60"
              aria-label="Previous week"
            >‹</button>

            <div className="text-center">
              {(() => {
                const rpi = getRacePlanInfo(anchorDate, planProfile);
                return (
                  <>
                    <div className="flex items-center justify-center gap-2">
                      <h1 className="text-white text-xl font-bold">
                        {isRunwayWeek
                          ? 'Preparation'
                          : isCurrentWeek
                            ? 'This Week'
                            : rpi && rpi.currentWeek > 0 && rpi.currentWeek <= rpi.totalWeeks
                              ? `Week ${rpi.currentWeek}`
                              : 'This Week'}
                      </h1>
                      {rpi && rpi.currentWeek > 0 && rpi.currentWeek <= rpi.totalWeeks && (
                        <span className="text-blue-300 text-xs font-medium bg-blue-900/40 px-2 py-1 rounded-full">
                          W{rpi.currentWeek} / {rpi.totalWeeks}
                        </span>
                      )}
                    </div>
                    {!isRunwayWeek && rpi && rpi.currentWeek > 0 && rpi.currentWeek <= rpi.totalWeeks && (
                      <p className="text-blue-300/80 text-sm mt-0.5">{rpi.phaseName}</p>
                    )}
                    {isRunwayWeek && (
                      <p className="text-gray-500 text-sm mt-0.5">Get ready — plan starts next Monday</p>
                    )}
                  </>
                );
              })()}
              {!isCurrentWeek && (
                <button
                  onClick={() => setWeekOffset(0)}
                  className="text-blue-400 text-xs mt-1 underline underline-offset-2"
                >
                  back to today
                </button>
              )}
            </div>

            <button
              onClick={() => setWeekOffset(w => w + 1)}
              className="text-white/60 hover:text-white text-2xl leading-none px-1 active:scale-90 transition-transform"
              aria-label="Next week"
            >›</button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-2">
        {/* Legend */}
        <div className="flex gap-3 px-1 pb-1 overflow-x-auto scrollbar-hide">
          {[
            { color: 'blue',   label: 'Run' },
            { color: 'purple', label: 'Gym' },
            { color: 'orange', label: 'Bike' },
            { color: 'gray',   label: 'Rest' },
            { color: 'red',    label: 'Race' },
          ].map(({ color, label }) => (
            <div key={color} className="flex items-center gap-1.5 flex-shrink-0">
              <span className={`w-2.5 h-2.5 rounded-full ${COLOR_BG[color]}`} />
              <span className="text-gray-500 text-xs">{label}</span>
            </div>
          ))}
        </div>

        {/* ── Runway week: show runway_plan days ── */}
        {isRunwayWeek && days.map((day, i) => {
          const dayStr = dateToString(day);
          // Don't show runway cards for days before the user signed up
          const createdAtStr = profile?.created_at ? dateToString(new Date(profile.created_at)) : null;
          if (createdAtStr && dayStr < createdAtStr) return null;
          const isToday = dayStr === todayStr;
          const rwDay = runwayPlan ? runwayPlan[i] : null;
          const isActive = rwDay && rwDay.type !== 'rest';

          const mutableColorBg: Record<string, string> = {
            blue: 'bg-blue-900/50', purple: 'bg-purple-900/50',
            orange: 'bg-orange-900/50', gray: 'bg-gray-700/30',
          };
          const mutableColorText: Record<string, string> = {
            blue: 'text-blue-500', purple: 'text-purple-500',
            orange: 'text-orange-500', gray: 'text-gray-600',
          };
          const colorKey = rwDay?.color ?? 'gray';
          const colorStrip = mutableColorBg[colorKey] ?? 'bg-gray-700/30';
          const colorText = mutableColorText[colorKey] ?? 'text-gray-600';

          const runwayWorkoutInfo: WorkoutInfo | null = isActive ? {
            type: rwDay!.type as WorkoutInfo['type'],
            label: rwDay!.label,
            description: rwDay!.description,
            color: (rwDay!.color ?? 'gray') as WorkoutInfo['color'],
          } : null;

          const MOBILITY_STEPS: WorkoutDetail = {
            duration: '25–30 min',
            intensity: 'Easy — mobility focus',
            steps: [
              { icon: '🦵', title: 'Hip flexor stretch', detail: '60 sec each side. Kneel on one knee, push hips forward gently.' },
              { icon: '🦵', title: 'Hamstring stretch', detail: '60 sec each side. Seated, reach toward toes, keep back straight.' },
              { icon: '🦶', title: 'Calf raise + stretch', detail: '15 slow raises then 30 sec stretch each leg. Hands on wall.' },
              { icon: '🍑', title: 'Glute bridge', detail: '3 × 15 reps. Feet flat, drive hips up, squeeze at the top.' },
              { icon: '🔄', title: 'Thoracic rotation', detail: '10 reps each side. Seated cross-legged, rotate upper body slowly.' },
              { icon: '🧘', title: "Child's pose", detail: '60 seconds. Arms extended, breathe deeply.' },
            ],
            keyPoints: ['Move gently — this is prep, not performance.', 'Stop if anything hurts.'],
          };

          function buildRunwayDetailWeek(rd: typeof rwDay): WorkoutDetail | null {
            if (!rd || rd.type === 'rest') return null;
            if (rd.type === 'gym') return MOBILITY_STEPS;
            return {
              duration: rd.type === 'run' ? '20–25 min' : '25–30 min',
              intensity: 'Easy — preparation week',
              steps: [{ icon: rd.type === 'run' ? '🏃' : '🚴', title: rd.label, detail: rd.description }],
              keyPoints: ['Keep it easy — this is your warm-up week.'],
            };
          }

          const rwDetail = buildRunwayDetailWeek(rwDay);
          const rwDateLabel = `${DAY_NAMES[i]} ${day.getDate()} ${day.toLocaleString('default', { month: 'short' })}`;

          return (
            <div
              key={dayStr}
              onClick={() => {
                if (!isActive || !runwayWorkoutInfo || !rwDetail) return;
                setSelectedDay({ workout: runwayWorkoutInfo, detail: rwDetail, label: rwDateLabel });
              }}
              className={`rounded-xl p-4 flex items-center gap-3 transition-all ${
                isActive ? 'cursor-pointer active:scale-[0.98]' : 'cursor-default'
              } ${isToday ? 'bg-gray-800 ring-1 ring-white/20' : 'bg-gray-900/80'}`}
            >
              {/* Day label */}
              <div className="w-10 flex-shrink-0 text-center">
                <p className={`text-xs font-semibold ${isToday ? 'text-white' : 'text-gray-500'}`}>{DAY_NAMES[i]}</p>
                <p className={`text-base font-bold leading-tight ${isToday ? 'text-white' : 'text-gray-400'}`}>{day.getDate()}</p>
              </div>

              {/* Color strip */}
              <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${colorStrip}`} />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-xs font-semibold ${colorText} uppercase tracking-wide`}>
                    {rwDay?.type === 'rest' ? 'Rest' : rwDay?.type ?? 'Rest'}
                  </p>
                  <span className="text-gray-600 text-xs font-medium bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">Optional</span>
                </div>
                <p className="text-white text-sm font-semibold leading-tight mt-0.5 truncate">
                  {rwDay?.label ?? 'Rest Day'}
                </p>
                {isActive && (
                  <p className="text-gray-500 text-xs mt-0.5 truncate">{rwDay?.description}</p>
                )}
              </div>

              {isActive && (
                <span className="text-gray-600 text-sm flex-shrink-0">›</span>
              )}
            </div>
          );
        })}

        {/* ── Normal week: plan not ready yet ── */}
        {!isRunwayWeek && profile && !profile.custom_plan && (
          <div className="rounded-2xl p-6 bg-gray-900 border border-gray-800 flex flex-col items-center gap-4 text-center mt-2">
            <svg className="animate-spin w-8 h-8 text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
              <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <div>
              <p className="text-white font-semibold text-base">Preparing your plan…</p>
              <p className="text-gray-500 text-sm mt-1">Your AI coach is building sessions tailored to your goals. Check back in a moment.</p>
            </div>
          </div>
        )}

        {/* ── Normal week: plan ready ── */}
        {!isRunwayWeek && profile?.custom_plan && days.map((day, i) => {
          const dayStr = dateToString(day);
          const workout = getWorkoutForDateWithProfile(day, planProfile);
          const isToday = dayStr === todayStr;
          const session = getSession(dayStr, workout.type);
          const colorStrip = COLOR_BG[workout.color] ?? 'bg-gray-700';
          const colorText = COLOR_TEXT[workout.color] ?? 'text-gray-500';

          return (
            <div
              key={dayStr}
              onClick={() => setSelectedDay({
                workout,
                detail: getWorkoutDetail(day, planProfile),
                label: `${DAY_NAMES[i]} ${day.getDate()} ${day.toLocaleString('default', { month: 'short' })}`,
              })}
              className={`rounded-xl p-4 flex items-center gap-3 transition-all cursor-pointer active:scale-[0.98] ${
                isToday ? 'bg-gray-800 ring-1 ring-white/20' : 'bg-gray-900'
              }`}
            >
              {/* Day label */}
              <div className="w-10 flex-shrink-0 text-center">
                <p className={`text-xs font-semibold ${isToday ? 'text-white' : 'text-gray-500'}`}>
                  {DAY_NAMES[i]}
                </p>
                <p className={`text-base font-bold leading-tight ${isToday ? 'text-white' : 'text-gray-400'}`}>
                  {day.getDate()}
                </p>
              </div>

              {/* Color strip */}
              <div className={`w-1 self-stretch rounded-full opacity-80 flex-shrink-0 ${colorStrip}`} />

              {/* Workout info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-semibold truncate ${isToday ? 'text-white' : 'text-gray-100'}`}>
                    {workout.label}
                  </p>
                  {getWorkoutDuration(workout) && (
                    <span className="flex-shrink-0 text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded-md">
                      {getWorkoutDuration(workout)}
                    </span>
                  )}
                </div>
                <p className={`text-xs truncate mt-0.5 ${colorText}`}>
                  {workout.description.length > 55
                    ? workout.description.slice(0, 55) + '…'
                    : workout.description}
                </p>
              </div>

              {/* Status chip */}
              <div className="flex-shrink-0 flex flex-col items-center gap-1">
                {isToday && <span className="text-blue-400 text-xs font-bold">NOW</span>}
                {workout.type !== 'rest' && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      if (session?.status === 'missed' && session.missed_reason) {
                        setViewReason({ reason: session.missed_reason });
                      } else {
                        setStatusAction({ dateStr: dayStr, sessionType: workout.type });
                      }
                    }}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                      session?.status === 'done'
                        ? 'bg-green-500/25 text-green-400'
                        : session?.status === 'missed'
                        ? 'bg-red-500/25 text-red-400'
                        : 'bg-gray-800 text-gray-600 border border-gray-700'
                    }`}
                  >
                    {session?.status === 'done' ? '✓' : session?.status === 'missed' ? '✗' : '·'}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Weekly summary — only when plan is ready and not in runway week */}

        {!loading && !isRunwayWeek && (
          <div className="bg-gray-900 rounded-xl p-4 mt-2">
            <div className="flex items-center justify-between">
              <p className="text-gray-400 text-sm">Sessions completed</p>
              <p className="text-white font-bold text-sm">
                {doneSessions} /{' '}
                {days.filter((d) => getWorkoutForDateWithProfile(d, planProfile).type !== 'rest').length}
              </p>
            </div>
          </div>
        )}
      </main>

      <BottomNav active="week" />

      {selectedDay && (
        <WorkoutDetailSheet
          workout={selectedDay.workout}
          detail={selectedDay.detail}
          dateLabel={selectedDay.label}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {/* Status action modal */}
      {statusAction && (() => {
        const existing = getSession(statusAction.dateStr, statusAction.sessionType);
        return (
          <>
            <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setStatusAction(null)} />
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 rounded-t-3xl p-5 space-y-2"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)' }}
              onClick={e => e.stopPropagation()}>
              <h3 className="text-white font-bold text-base mb-3">Mark this session</h3>
              <button
                onClick={() => { markDone(statusAction.dateStr, statusAction.sessionType); setStatusAction(null); }}
                className="w-full py-3 rounded-xl bg-green-700/40 text-green-300 font-bold text-sm active:scale-95 transition-transform"
              >
                ✓ Done
              </button>
              <button
                onClick={() => { setMissedModal(statusAction); setMissedReason(existing?.missed_reason ?? ''); setStatusAction(null); }}
                className="w-full py-3 rounded-xl bg-red-700/30 text-red-300 font-bold text-sm active:scale-95 transition-transform"
              >
                ✗ Didn't Do
              </button>
              {existing && (
                <button
                  onClick={() => { clearSessionForDay(statusAction.dateStr, statusAction.sessionType); setStatusAction(null); }}
                  className="w-full py-3 rounded-xl bg-gray-800 text-gray-400 text-sm active:scale-95 transition-transform"
                >
                  Clear
                </button>
              )}
              <button onClick={() => setStatusAction(null)} className="w-full py-2 text-gray-600 text-sm">
                Cancel
              </button>
            </div>
          </>
        );
      })()}

      {/* Missed reason modal */}
      {missedModal && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setMissedModal(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 rounded-t-3xl p-5 space-y-4"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)' }}
            onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-bold text-lg">Why did you miss it?</h3>
            <textarea
              value={missedReason}
              onChange={e => setMissedReason(e.target.value.slice(0, 200))}
              rows={3}
              placeholder="Feeling tired, work got busy, minor pain…"
              autoFocus
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500 resize-none transition-colors"
            />
            <p className="text-gray-600 text-xs text-right -mt-2">{missedReason.length}/200</p>
            <div className="flex gap-3">
              <button onClick={() => setMissedModal(null)} className="flex-1 py-3 rounded-xl bg-gray-800 text-gray-300 font-bold text-sm">
                Cancel
              </button>
              <button
                onClick={() => { markMissed(missedModal.dateStr, missedModal.sessionType, missedReason); setMissedModal(null); }}
                className="flex-1 py-3 rounded-xl bg-red-700 text-white font-bold text-sm active:scale-95 transition-transform"
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}

      {/* View missed reason */}
      {viewReason && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setViewReason(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 rounded-t-3xl p-5 space-y-3"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)' }}
            onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-bold text-base">Reason for missing</h3>
            <p className="text-gray-300 text-sm leading-relaxed">{viewReason.reason}</p>
            <button onClick={() => setViewReason(null)} className="w-full py-3 rounded-xl bg-gray-800 text-gray-300 font-bold text-sm">
              Close
            </button>
          </div>
        </>
      )}
    </div>
  );
}
