'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase, DailyCheckin, CompletedSession, UserProfile } from '@/lib/supabase';
import CheckinModal from '@/components/CheckinModal';
import {
  getWorkoutForDateWithProfile,
  getWorkoutDetail,
  getRacePlanInfo,
  PHASE_NAMES,
  dateToString,
  getDayOfWeek,
  getDaysInCurrentWeek,
  getPlanStart,
  isInRunwayPeriod,
  COLOR_BG,
  PlanProfile,
  WorkoutInfo,
  WorkoutDetail,
} from '@/lib/training-plan';
import BottomNav from '@/components/BottomNav';
import WorkoutDetailSheet from '@/components/WorkoutDetailSheet';
import StravaActivityCard from '@/components/StravaActivityCard';
import { useStravaActivity } from '@/lib/useStravaActivity';
import AvatarCropModal from '@/components/AvatarCropModal';
import MismatchFeedbackSheet from '@/components/MismatchFeedbackSheet';
import ActivityFeedbackCard from '@/components/ActivityFeedbackCard';
import ManualActivitySheet, { ManualActivityData } from '@/components/ManualActivitySheet';
import { PlannedSession, StravaMatch } from '@/lib/reconcile';
import WeeklyReportCard from '@/components/WeeklyReportCard';

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

function checkinTier(ci: DailyCheckin | null): 'red' | 'yellow' | 'green' | 'none' {
  if (!ci) return 'none';
  // Red — meaningful intervention needed
  if (
    (ci.whoop_recovery != null && ci.whoop_recovery < 33) ||
    (ci.sleep_score != null && ci.sleep_score < 33) ||
    (ci.sleep_hours != null && ci.sleep_hours < 6) ||
    (ci.achilles_pain != null && ci.achilles_pain >= 4) ||
    ci.feeling === 'bad' || ci.feeling === 'injured'
  ) return 'red';
  // Yellow — slightly off, show tip only
  if (
    (ci.whoop_recovery != null && ci.whoop_recovery >= 33 && ci.whoop_recovery < 70) ||
    (ci.sleep_score != null && ci.sleep_score >= 33 && ci.sleep_score < 70) ||
    (ci.sleep_hours != null && ci.sleep_hours >= 6 && ci.sleep_hours < 7.5) ||
    ci.feeling === 'tired'
  ) return 'yellow';
  return 'green';
}

interface UserRace { id: string; name: string; date: string; distance: string; emoji: string; }

interface WeeklyReport {
  headline: string;
  summary: string;
  sessions_completed: number;
  sessions_planned: number;
  total_distance_km: number;
  effort_rating: 'excellent' | 'good' | 'fair' | 'poor';
  highlights: string[];
  concerns: string[];
  recovery_summary: string;
  goal_progress: string;
  next_week_suggestion: string;
}
function daysUntil(dateStr: string, today: Date): number {
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((d.getTime() - t.getTime()) / (24 * 60 * 60 * 1000));
}

function buildPlanProfile(profile: UserProfile): PlanProfile {
  return {
    goal: profile.goal,
    daysPerWeek: profile.days_per_week ?? 4,
    preferredLongDay: profile.preferred_long_day ?? 'Sat',
    trainingLevel: profile.training_level ?? 'intermediate',
    customPlan: profile.custom_plan ?? null,
    raceDate: profile.race_date ?? null,
    createdAt: profile.created_at ?? null,
    injuryNotes: profile.injury_notes ?? null,
  };
}

export default function TodayPage() {
  const today = new Date();
  const todayStr = dateToString(today);
  const checkinPrompted = useRef(false);

  const [checkin, setCheckin] = useState<DailyCheckin | null>(null);
  const [session, setSession] = useState<CompletedSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showMissedModal, setShowMissedModal] = useState(false);
  const [missedReason, setMissedReason] = useState('');
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [planGenerating, setPlanGenerating] = useState(false);
  const [showRunwayDetail, setShowRunwayDetail] = useState(false);
  const [showMismatchSheet, setShowMismatchSheet] = useState(false);
  const [showManualSheet, setShowManualSheet] = useState<false | 'mark_done' | 'edit' | 'rest_day_log'>(false);
  const [activityFeedback, setActivityFeedback] = useState<{
    summary: string;
    effort_rating: 'too_easy' | 'right' | 'too_hard';
    achilles_flag: boolean;
    tip: string;
  } | null>(null);
  const [weekSessions, setWeekSessions] = useState<CompletedSession[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<{ report: WeeklyReport; weekStart: string; weekEnd: string } | null>(null);
  const [weeklyReportDismissed, setWeeklyReportDismissed] = useState(false);

  const planProfile: PlanProfile | null = profile ? buildPlanProfile(profile) : null;
  const workout = getWorkoutForDateWithProfile(today, planProfile);
  const racePlanInfo = getRacePlanInfo(today, planProfile);

  // Runway period: between sign-up and planStart Monday
  const inRunway = profile ? isInRunwayPeriod(today, planProfile) : false;
  const runwayPlan = profile?.runway_plan ?? null;
  const runwayDayIndex = getDayOfWeek(today); // 0=Mon … 6=Sun
  const runwayDay = runwayPlan ? runwayPlan[runwayDayIndex] : null;

  // Compute how many days until planStart
  const planStartDate = planProfile ? getPlanStart(planProfile) : null;
  const daysToStart = planStartDate
    ? Math.ceil((planStartDate.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / (24 * 60 * 60 * 1000))
    : null;

  // Hardcoded mobility steps for gym-type runway sessions
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

  function buildRunwayDetail(day: typeof runwayDay): WorkoutDetail | null {
    if (!day || day.type === 'rest') return null;
    if (day.type === 'gym') return MOBILITY_STEPS;
    return {
      duration: day.type === 'run' ? '20–25 min' : '25–30 min',
      intensity: 'Easy — preparation week',
      steps: [{ icon: day.type === 'run' ? '🏃' : '🚴', title: day.label, detail: day.description }],
      keyPoints: ['Keep it easy — this is your warm-up week.', 'Enjoy the process!'],
    };
  }

  const runwayDetail = buildRunwayDetail(runwayDay);
  const runwayWorkoutInfo: WorkoutInfo | null = runwayDay && runwayDay.type !== 'rest' ? {
    type: runwayDay.type as WorkoutInfo['type'],
    label: runwayDay.label,
    description: runwayDay.description,
    color: (runwayDay.color ?? 'gray') as WorkoutInfo['color'],
  } : null;

  const currentTier = checkinTier(checkin);

  const plannedSession: PlannedSession | null = workout.type !== 'rest' ? {
    type: workout.type as PlannedSession['type'],
    description: workout.description,
  } : null;

  const { activity: stravaActivity, connected: stravaConnected, reconcileResult } = useStravaActivity(todayStr, plannedSession);

  // Strava OAuth result — show a temporary toast for ?strava=connected, error banner for failures
  const [stravaToast, setStravaToast] = useState(false);
  const [stravaMsg, setStravaMsg] = useState<{ type: 'error'; text: string } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('strava');
    const detail = params.get('detail');
    if (status === 'connected') {
      setStravaToast(true);
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => setStravaToast(false), 5000);
    } else if (status === 'error' || status === 'dberror') {
      setStravaMsg({ type: 'error', text: `Connection failed: ${detail ? decodeURIComponent(detail) : status}` });
    } else if (status === 'denied') {
      setStravaMsg({ type: 'error', text: 'Strava authorization was denied.' });
    }
    if (status && status !== 'connected') window.history.replaceState({}, '', '/');
  }, []);

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

    // Build the update payload
    const updatePayload: Record<string, unknown> = { races: valid };

    // For race goals: also sync race_date to the soonest upcoming race
    // This makes the race nudge disappear and unlocks the phased training plan
    if (profile && ['marathon', 'half_marathon', '10k'].includes(profile.goal ?? '')) {
      const todayDateStr = dateToString(today);
      const upcoming = valid
        .filter(r => r.date >= todayDateStr)
        .sort((a, b) => a.date.localeCompare(b.date));
      const newRaceDate = upcoming[0]?.date ?? null;
      updatePayload.race_date = newRaceDate;

      // Update local profile state so the nudge disappears immediately
      setProfile(prev => prev ? { ...prev, race_date: newRaceDate, races: valid } : prev);
    }

    await supabase.from('profiles').update(updatePayload).eq('id', userId);
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

      const [{ data: ci }, { data: se }, { data: prof }] = await Promise.all([
        supabase.from('daily_checkins').select('*').eq('user_id', user.id).eq('date', todayStr).maybeSingle(),
        supabase.from('completed_sessions').select('*').eq('user_id', user.id).eq('date', todayStr).eq('session_type', workout.type).maybeSingle(),
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      ]);
      setUserId(user.id);
      setCheckin(ci ?? null);
      setSession(se ?? null);
      if (prof) setProfile(prof as UserProfile);
      setRaces((prof as UserProfile | null)?.races ?? []);

      // Fetch completed sessions for the current week (Mon-Sun) for progress dots
      const weekDays = getDaysInCurrentWeek(today);
      const weekStartStr = dateToString(weekDays[0]);
      const weekEndStr = dateToString(weekDays[6]);
      supabase
        .from('completed_sessions')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', weekStartStr)
        .lte('date', weekEndStr)
        .then(({ data: weekData }) => {
          if (weekData) setWeekSessions(weekData as CompletedSession[]);
        });

      // Auto-generate personalised plan for users who don't have one yet
      // (existing users pre-dating onboarding, or signup where Gemini timed out)
      // Fires in the background — does not block the UI
      if (prof && !prof.custom_plan) {
        console.log('[plan] No custom_plan found for user', user.id, '— triggering generate-plan');
        setPlanGenerating(true);
        fetch('/api/generate-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, profile: prof }),
        })
          .then(async r => {
            const data = await r.json();
            if (!r.ok) {
              console.error('[plan] generate-plan API error', r.status, data);
              return;
            }
            if (data.plan) {
              console.log('[plan] Plan generated successfully — updating profile state');
              setProfile(prev => prev ? { ...prev, custom_plan: data.plan } : prev);
            } else {
              console.warn('[plan] generate-plan returned no plan:', data);
            }
          })
          .catch(err => {
            console.error('[plan] generate-plan fetch failed:', err);
          })
          .finally(() => setPlanGenerating(false));
      }

      // Auto-generate runway plan for users in the preparation week who don't have one yet
      // (accounts created before this feature, or where Gemini timed out during signup)
      if (prof && !prof.runway_plan) {
        const tempPlanProfile: PlanProfile = {
          goal: prof.goal ?? null,
          daysPerWeek: prof.days_per_week ?? 4,
          preferredLongDay: prof.preferred_long_day ?? 'Sat',
          trainingLevel: prof.training_level ?? 'intermediate',
          createdAt: prof.created_at ?? null,
        };
        if (isInRunwayPeriod(today, tempPlanProfile)) {
          console.log('[runway] No runway_plan found for user in runway —triggering generate-runway');
          fetch('/api/generate-runway', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, profile: prof }),
          })
            .then(async r => {
              const data = await r.json();
              if (!r.ok) {
                console.error('[runway] generate-runway API error', r.status, data);
                return;
              }
              if (data.runway) {
                console.log('[runway] Runway plan generated — updating profile state');
                setProfile(prev => prev ? { ...prev, runway_plan: data.runway } : prev);
              }
            })
            .catch(err => {
              console.error('[runway] generate-runway fetch failed:', err);
            });
        }
      }

      // Show weekly report card on Sunday evening or Monday morning
      const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon
      const hourOfDay = today.getHours();
      const isReportTime = (dayOfWeek === 0 && hourOfDay >= 18) || (dayOfWeek === 1 && hourOfDay < 12);
      if (isReportTime && user) {
        // Get Monday of last week (or this week's Monday if it's Sunday)
        const monday = new Date(today);
        monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : 0));
        monday.setHours(0, 0, 0, 0);
        const weekStart = monday.toISOString().split('T')[0];

        fetch('/api/weekly-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, weekStart }),
        })
          .then(r => r.json())
          .then(data => {
            if (data.report && !data.error) {
              setWeeklyReport(data);
            }
          })
          .catch(err => console.error('[weekly-report] fetch failed:', err));
      }

      // Show checkin popup on every fresh load after 5am if not yet checked in today
      if (!ci && !checkinPrompted.current) {
        const hour = new Date().getHours();
        if (hour >= 5) {
          checkinPrompted.current = true;
          setShowCheckinModal(true);
        }
      }
      setLoading(false);
    }
    load();
  }, [todayStr, workout.type]);

  async function toggleSession() {
    if (toggling || workout.type === 'rest') return;
    if (!userId) return;
    setToggling(true);
    const { data } = await supabase
      .from('completed_sessions')
      .upsert({ user_id: userId, date: todayStr, session_type: workout.type, completed: true, status: 'done' }, { onConflict: 'user_id,date,session_type' })
      .select().single();
    if (data) setSession(data as CompletedSession);
    setToggling(false);
  }

  async function markMissed(reason: string) {
    if (!userId) return;
    setToggling(true);
    const { data } = await supabase
      .from('completed_sessions')
      .upsert({ user_id: userId, date: todayStr, session_type: workout.type, completed: false, status: 'missed', missed_reason: reason || null }, { onConflict: 'user_id,date,session_type' })
      .select().single();
    if (data) setSession(data as CompletedSession);
    setMissedReason('');
    setToggling(false);
  }

  async function clearSession() {
    if (!session) return;
    setToggling(true);
    await supabase.from('completed_sessions').delete().eq('id', session.id);
    setSession(null);
    setToggling(false);
  }

  function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setCropFile(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }

  async function handleAvatarCropped(blob: Blob) {
    setCropFile(null);
    if (!userId) return;
    setAvatarUploading(true);
    try {
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/avatar', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) { console.error('Avatar upload failed:', json.error); return; }
      setProfile(prev => prev ? { ...prev, avatar_url: json.url } : prev);
    } finally {
      setAvatarUploading(false);
    }
  }

  async function requestActivityFeedback(actual: {
    type: string;
    distance_km: number;
    duration_min: number;
    avg_heartrate?: number;
    avg_pace?: string;
    elevation_m?: number;
    source: 'strava' | 'manual';
  }, mismatchFeedback?: { tags: string[]; notes?: string }) {
    const weekDay = today.getDay() === 0 ? 7 : today.getDay(); // 1=Mon...7=Sun
    const res = await fetch('/api/activity-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionDate: todayStr,
        planned: plannedSession,
        actual,
        context: {
          weekDay,
          weeklyLoadKm: 0, // simplified for now
          upcomingSessions: [],
          isRestDay: workout.type === 'rest',
        },
        mismatchFeedback,
      }),
    });
    if (res.ok) {
      const fb = await res.json();
      setActivityFeedback(fb);
    }
  }

  useEffect(() => {
    if (reconcileResult?.status === 'match' && stravaActivity) {
      requestActivityFeedback({
        type: stravaActivity.sport_type,
        distance_km: stravaActivity.distance_m / 1000,
        duration_min: stravaActivity.moving_time_s / 60,
        avg_heartrate: stravaActivity.avg_heartrate,
        elevation_m: stravaActivity.elevation_m,
        source: 'strava',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconcileResult?.status]);

  const bgClass = COLOR_BG[workout.color] ?? 'bg-gray-700';
  const dateLabel = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // Race goals that need a race date nudge
  const needsRaceDateNudge = profile &&
    ['marathon', 'half_marathon', '10k'].includes(profile.goal ?? '') &&
    !profile.race_date;

  return (
    <div className="min-h-screen bg-gray-950" style={{ paddingBottom: '5.5rem' }}>
      {/* ── Header ── */}
      <header
        className="bg-[#1B2A4A] px-4 pb-5"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 2.5rem)' }}
      >
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between">
            <img src="/logo.png" alt="Dromos" className="w-9 h-9 rounded-xl object-cover" />
            <button onClick={() => setShowProfile(true)} className="p-2 text-gray-400 hover:text-white transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            {racePlanInfo && racePlanInfo.currentWeek > 0 && racePlanInfo.currentWeek <= racePlanInfo.totalWeeks && (
              <span className="text-blue-300 text-xs font-medium bg-blue-900/40 px-2 py-1 rounded-full">
                W{racePlanInfo.currentWeek} / {racePlanInfo.totalWeeks}
              </span>
            )}
          </div>
          {racePlanInfo && racePlanInfo.currentWeek > 0 && racePlanInfo.currentWeek <= racePlanInfo.totalWeeks && (
            <p className="text-blue-300/80 text-sm mt-0.5">{racePlanInfo.phaseName}</p>
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
        {stravaToast && (
          <div className="mx-4 mb-4 bg-[#FC4C021A] border border-[#FC4C02]/40 rounded-2xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#FC4C02">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
              </svg>
              <span className="text-[#FC4C02] text-sm font-medium">Strava connected!</span>
            </div>
            <button onClick={() => setStravaToast(false)} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
          </div>
        )}

        {weeklyReport && !weeklyReportDismissed && (
          <WeeklyReportCard
            report={weeklyReport.report}
            weekStart={weeklyReport.weekStart}
            onDismiss={() => setWeeklyReportDismissed(true)}
          />
        )}

        <div className="flex items-center justify-between">
          <p className="text-gray-500 text-sm">{dateLabel}</p>
          {checkin ? (
            <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-900/30 px-3 py-1.5 rounded-full font-medium">
              ✓ Checked in
            </span>
          ) : (
            <button
              onClick={() => setShowCheckinModal(true)}
              className="flex items-center gap-1.5 text-xs text-orange-300 bg-orange-900/30 px-3 py-1.5 rounded-full font-medium active:scale-95 transition-transform"
            >
              📋 Check in
            </button>
          )}
        </div>

        {/* ── Week Progress ── */}
        {planProfile && !inRunway && (() => {
          const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
          const weekDays = getDaysInCurrentWeek(today);
          const doneDates = new Set(weekSessions.filter(s => s.status === 'done').map(s => s.date));
          const missedDates = new Set(weekSessions.filter(s => s.status === 'missed').map(s => s.date));
          const doneCount = weekSessions.filter(s => s.status === 'done').length;
          const plannedCount = weekDays.filter(d => getWorkoutForDateWithProfile(d, planProfile).type !== 'rest').length;

          return (
            <div className="bg-gray-900 rounded-2xl px-4 py-3 border border-gray-800/60">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-xs font-semibold uppercase tracking-widest">This Week</span>
                <span className="text-gray-500 text-xs">{doneCount}/{plannedCount} sessions</span>
              </div>
              <div className="flex justify-between">
                {weekDays.map((day, i) => {
                  const dayStr = dateToString(day);
                  const isToday = dayStr === todayStr;
                  const planned = getWorkoutForDateWithProfile(day, planProfile);
                  const isRest = planned.type === 'rest';
                  const isDone = doneDates.has(dayStr);
                  const isMissed = missedDates.has(dayStr);
                  const isPast = day < today && !isToday;

                  let dotClass = 'bg-gray-800 border-gray-700';
                  if (isDone) dotClass = 'bg-green-600 border-green-500';
                  else if (isMissed) dotClass = 'bg-red-900 border-red-700';
                  else if (isRest) dotClass = 'bg-gray-800/50 border-gray-700/50';
                  else if (isPast) dotClass = 'bg-gray-700 border-gray-600';

                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <span className={`text-[10px] ${isToday ? 'text-blue-400 font-bold' : 'text-gray-600'}`}>{DAY_LABELS[i]}</span>
                      <div className={`w-5 h-5 rounded-full border ${dotClass} flex items-center justify-center ${isToday ? 'ring-1 ring-blue-500/50' : ''}`}>
                        {isDone && <span className="text-white text-[9px]">✓</span>}
                        {isMissed && <span className="text-red-300 text-[9px]">✕</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── Race date nudge ── */}
        {needsRaceDateNudge && (
          <div className="bg-amber-950/50 border border-amber-800/40 rounded-xl px-4 py-3">
            <p className="text-amber-300 text-sm font-semibold">📅 Add your race date</p>
            <p className="text-amber-200/60 text-xs mt-1">
              Set your race date to get a fully personalized training plan with the right phases and taper.
            </p>
            <button onClick={openRaceEditor} className="text-amber-400 text-xs font-medium mt-2 underline underline-offset-2">
              Add your race date →
            </button>
          </div>
        )}

        {/* ── Runway Period ── shown between sign-up and planStart */}
        {inRunway && (
          <>
            {/* Skeleton: runway_plan not yet generated */}
            {!runwayDay && (
              <div className="rounded-2xl p-6 bg-gray-900 border border-gray-700/40 flex flex-col items-center gap-4 text-center">
                <svg className="animate-spin w-8 h-8 text-gray-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                  <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                <div>
                  <p className="text-white font-semibold text-base">Preparing your week…</p>
                  <p className="text-gray-500 text-sm mt-1">Generating your personalised preparation sessions</p>
                </div>
              </div>
            )}

            {/* Runway card: rest day */}
            {runwayDay && runwayDay.type === 'rest' && (
              <div className="rounded-2xl p-5 bg-gray-900 border border-gray-700/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500 text-xs font-semibold uppercase tracking-widest">Preparation Week</span>
                  <span className="text-gray-500 text-xs font-medium bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">Optional</span>
                </div>
                <h2 className="text-white text-2xl font-bold leading-tight">{runwayDay.label}</h2>
                <p className="text-gray-400 text-sm mt-2 leading-relaxed">{runwayDay.description}</p>
                {planStartDate && daysToStart !== null && (
                  <div className="mt-4 pt-4 border-t border-gray-800">
                    <p className="text-gray-300 text-sm font-semibold">
                      Your plan starts {planStartDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </p>
                    <p className="text-gray-500 text-xs mt-0.5">{daysToStart} day{daysToStart !== 1 ? 's' : ''} to go</p>
                  </div>
                )}
              </div>
            )}

            {/* Runway card: active session */}
            {runwayDay && runwayDay.type !== 'rest' && (
              <div
                className="rounded-2xl p-5 bg-gray-900 border border-gray-700/40 cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => setShowRunwayDetail(true)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500 text-xs font-semibold uppercase tracking-widest">Preparation Week</span>
                  <span className="text-gray-500 text-xs font-medium bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">Optional</span>
                </div>
                <h2 className="text-white text-2xl font-bold leading-tight">{runwayDay.label}</h2>
                <p className="text-gray-400 text-sm mt-2 leading-relaxed">{runwayDay.description}</p>
                <p className="text-gray-500 text-xs mt-3">Tap for full session details →</p>
                {planStartDate && daysToStart !== null && (
                  <div className="mt-4 pt-4 border-t border-gray-800">
                    <p className="text-gray-300 text-sm font-semibold">
                      Your plan starts {planStartDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </p>
                    <p className="text-gray-500 text-xs mt-0.5">{daysToStart} day{daysToStart !== 1 ? 's' : ''} to go</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Plan Generating State ── shown when not in runway but no plan yet */}
        {!inRunway && profile && !profile.custom_plan && (
          <div className="rounded-2xl p-6 bg-gray-900 border border-gray-800 flex flex-col items-center gap-4 text-center">
            <svg className="animate-spin w-8 h-8 text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
              <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <div>
              <p className="text-white font-semibold text-base">Preparing your plan…</p>
              <p className="text-gray-500 text-sm mt-1">Your AI coach is building sessions tailored to your goals and preferences</p>
            </div>
          </div>
        )}

        {/* ── Workout Card ── only shown once plan is ready AND not in runway */}
        {!inRunway && profile?.custom_plan && <div
          className={`rounded-2xl p-5 ${bgClass} relative overflow-hidden cursor-pointer active:scale-[0.98] transition-transform`}
          onClick={() => setShowDetail(true)}
        >
          <div className="absolute inset-0 opacity-10 bg-gradient-to-br from-white to-transparent" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-white/70 text-xs font-semibold uppercase tracking-widest">
                {workout.type === 'rest' ? 'Rest Day' : workout.type}
              </span>
              {checkin?.ai_coach_title && (
                <span className="text-xs font-medium text-blue-300 bg-blue-900/40 px-2 py-0.5 rounded-full">✦ Adapted by AI</span>
              )}
              {session && (
                <span className="flex items-center gap-1 text-xs text-green-300 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                  Done
                </span>
              )}
            </div>
            <h2 className="text-white text-2xl font-bold leading-tight">
              {checkin?.ai_coach_title ?? workout.label}
            </h2>
            <p className="text-white/75 text-sm mt-2 leading-relaxed">
              {checkin?.ai_coach_description ?? workout.description}
            </p>
            <p className="text-white/40 text-xs mt-2">Tap for full workout details →</p>

            {workout.type !== 'rest' && (
              <div className="mt-4" onClick={e => e.stopPropagation()}>
                {toggling && <div className="py-3 text-center text-white/50 text-sm">…</div>}

                {!toggling && !session && (
                  <div className="flex gap-2">
                    <button onClick={toggleSession} className="flex-1 py-3 rounded-xl font-bold text-sm bg-white text-gray-900 shadow-sm active:scale-95 transition-transform">
                      ✓ Done
                    </button>
                    <button onClick={() => setShowMissedModal(true)} className="flex-1 py-3 rounded-xl font-bold text-sm bg-red-900/40 text-red-300 border border-red-700/30 active:scale-95 transition-transform">
                      ✗ Didn't Do
                    </button>
                  </div>
                )}

                {!toggling && session?.status === 'done' && (
                  <button onClick={clearSession} className="w-full py-3 rounded-xl font-bold text-sm bg-green-500/20 text-green-300 border border-green-500/40 active:scale-95 transition-transform">
                    ✓ Completed · tap to undo
                  </button>
                )}

                {!toggling && session?.status === 'missed' && (
                  <div className="space-y-1">
                    <button onClick={() => { setMissedReason(session.missed_reason ?? ''); setShowMissedModal(true); }} className="w-full py-3 rounded-xl font-bold text-sm bg-red-900/40 text-red-300 border border-red-700/30 active:scale-95 transition-transform">
                      ✗ Missed{session.missed_reason ? ` — ${session.missed_reason.slice(0, 28)}${session.missed_reason.length > 28 ? '…' : ''}` : ''}
                    </button>
                    <button onClick={clearSession} className="w-full py-1.5 text-xs text-gray-600 active:scale-95 transition-transform">
                      Clear
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>}

        {/* ── Yellow tip — shown when metrics are slightly off but not red ── */}
        {!inRunway && checkin && currentTier === 'yellow' && workout && workout.type !== 'rest' && (
          <p className="text-gray-500 text-xs text-center px-2">Feeling a bit off today — ease into it if needed.</p>
        )}

        {/* ── Goal-based plan notice for non-race users ── */}
        {profile && profile.goal && !['marathon', 'half_marathon', '10k'].includes(profile.goal) && (
          <div className="bg-blue-950/50 border border-blue-800/40 rounded-xl px-4 py-3">
            <p className="text-blue-300 text-sm font-semibold">
              {profile.custom_plan ? '✦ Your AI-generated plan' : '✦ Your personalised plan'}
            </p>
            <p className="text-blue-200/60 text-xs mt-1">
              {profile.custom_plan
                ? `Tailored for ${profile.goal_other ?? profile.goal?.replace('_', ' ')} · ${profile.days_per_week ?? 4} days/week · AI coach adapts daily after check-in`
                : `Based on your goal (${profile.goal_other ?? profile.goal?.replace('_', ' ')}) and ${profile.days_per_week ?? 4} days/week. Complete a check-in to get AI coaching.`
              }
            </p>
          </div>
        )}

        {/* ── Warnings ── */}
        {profile?.injury_notes && checkin?.achilles_pain != null && checkin.achilles_pain > 3 && (
          <div className="bg-red-950 border border-red-700/60 rounded-xl px-4 py-3">
            <p className="text-red-300 text-sm font-semibold">⚠️ Pain Alert — {checkin.achilles_pain}/10</p>
            <p className="text-red-200/80 text-xs mt-1">
              Consider reducing today's intensity. {profile.injury_notes}
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

        {/* ── Strava error message ── */}
        {stravaMsg && (
          <div className="rounded-xl px-4 py-3 text-sm font-medium bg-red-950 border border-red-700/60 text-red-300">
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

        {stravaActivity && reconcileResult?.status === 'mismatch' && (
          <div className="bg-yellow-950/40 border border-yellow-700/40 rounded-2xl p-4">
            <p className="text-yellow-300 text-sm font-semibold mb-1">⚠️ Session mismatch</p>
            <p className="text-yellow-200/70 text-xs mb-3">Your Strava activity doesn't match today's plan. Tell us what happened.</p>
            <button
              onClick={() => setShowMismatchSheet(true)}
              className="text-yellow-300 text-sm font-medium underline"
            >
              Review →
            </button>
          </div>
        )}

        {stravaActivity && reconcileResult?.status !== 'mismatch' && (
          <StravaActivityCard
            activity={stravaActivity}
            plannedKm={
              workout.label.match(/(\d+\.?\d*)km/) ? parseFloat(workout.label.match(/(\d+\.?\d*)km/)![1]) : undefined
            }
          />
        )}

        {activityFeedback && (
          <ActivityFeedbackCard
            feedback={activityFeedback}
            onDismiss={() => setActivityFeedback(null)}
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
                  {checkin.achilles_pain != null && profile?.injury_notes && (
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
          detail={getWorkoutDetail(today, planProfile)}
          dateLabel={dateLabel}
          onClose={() => setShowDetail(false)}
          onMarkDone={!stravaActivity ? () => setShowManualSheet('mark_done') : undefined}
          onEditWorkout={!stravaActivity ? () => setShowManualSheet('edit') : undefined}
          onLogRestDay={() => setShowManualSheet('rest_day_log')}
        />
      )}

      {showRunwayDetail && runwayWorkoutInfo && runwayDetail && (
        <WorkoutDetailSheet
          workout={runwayWorkoutInfo}
          detail={runwayDetail}
          dateLabel={`Preparation — ${today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`}
          onClose={() => setShowRunwayDetail(false)}
        />
      )}

      {showMismatchSheet && stravaActivity && plannedSession && reconcileResult?.status === 'mismatch' && (
        <MismatchFeedbackSheet
          planned={plannedSession}
          actual={{
            strava_id: stravaActivity.strava_id,
            sport_type: stravaActivity.sport_type,
            distance_km: stravaActivity.distance_m / 1000,
            moving_time_min: stravaActivity.moving_time_s / 60,
            avg_heartrate: stravaActivity.avg_heartrate,
            max_heartrate: stravaActivity.max_heartrate,
          }}
          onSubmit={async (tags, notes) => {
            setShowMismatchSheet(false);
            await requestActivityFeedback({
              type: stravaActivity.sport_type,
              distance_km: stravaActivity.distance_m / 1000,
              duration_min: stravaActivity.moving_time_s / 60,
              avg_heartrate: stravaActivity.avg_heartrate,
              elevation_m: stravaActivity.elevation_m,
              source: 'strava',
            }, { tags, notes });
          }}
          onClose={() => setShowMismatchSheet(false)}
        />
      )}

      {showManualSheet && (
        <ManualActivitySheet
          mode={showManualSheet}
          planned={plannedSession ?? undefined}
          onSubmit={async (data: ManualActivityData) => {
            setShowManualSheet(false);
            await requestActivityFeedback({
              type: data.type,
              distance_km: data.distance_km ?? 0,
              duration_min: data.duration_min ?? 0,
              source: 'manual',
            }, showManualSheet === 'edit' ? { tags: [data.perceived_effort], notes: data.notes } : undefined);
          }}
          onClose={() => setShowManualSheet(false)}
        />
      )}

      {/* Daily checkin popup */}
      {showCheckinModal && userId && (
        <CheckinModal
          profile={profile}
          planProfile={planProfile}
          userId={userId}
          todayStr={todayStr}
          inRunway={inRunway}
          onSave={(saved) => {
            setCheckin(saved);
          }}
          onAiResult={(title, desc) => {
            setCheckin(prev => prev ? { ...prev, ai_coach_title: title, ai_coach_description: desc } : prev);
          }}
          onDismiss={() => setShowCheckinModal(false)}
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
                    <input value={r.emoji} onChange={e => updateEditRace(r.id, 'emoji', e.target.value)} className="w-10 bg-gray-700 rounded-lg px-2 py-1.5 text-white text-sm text-center" maxLength={2} />
                    <input value={r.name} onChange={e => updateEditRace(r.id, 'name', e.target.value)} placeholder="Race name" className="flex-1 bg-gray-700 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-500" />
                    <button onClick={() => removeRace(r.id)} className="text-red-400 text-lg px-1">×</button>
                  </div>
                  <div className="flex gap-2">
                    <input type="date" value={r.date} onChange={e => updateEditRace(r.id, 'date', e.target.value)} className="flex-1 bg-gray-700 rounded-lg px-3 py-1.5 text-white text-sm" />
                    <input value={r.distance} onChange={e => updateEditRace(r.id, 'distance', e.target.value)} placeholder="Distance" className="w-20 bg-gray-700 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-500" />
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

      {/* Missed reason modal */}
      {showMissedModal && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setShowMissedModal(false)} />
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
              <button onClick={() => setShowMissedModal(false)} className="flex-1 py-3 rounded-xl bg-gray-800 text-gray-300 font-bold text-sm">
                Cancel
              </button>
              <button onClick={() => { markMissed(missedReason); setShowMissedModal(false); }} className="flex-1 py-3 rounded-xl bg-red-700 text-white font-bold text-sm active:scale-95 transition-transform">
                Save
              </button>
            </div>
          </div>
        </>
      )}

      {/* Profile / Settings drawer */}
      {showProfile && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setShowProfile(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 rounded-t-3xl p-5 space-y-5"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)' }}>
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">Profile</h3>
              <button onClick={() => setShowProfile(false)} className="text-gray-500 text-2xl leading-none">×</button>
            </div>

            {/* Avatar */}
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center overflow-hidden">
                  {avatarUploading
                    ? <svg className="animate-spin w-8 h-8 text-white" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                    : profile?.avatar_url
                      ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                      : <span className="text-white text-3xl font-bold">{profile?.name?.charAt(0)?.toUpperCase() ?? '?'}</span>
                  }
                </div>
                <label className="absolute bottom-0 right-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-400">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
                </label>
              </div>
              <div className="text-center">
                <p className="text-white font-semibold">{profile?.name ?? '—'}</p>
                <p className="text-gray-500 text-sm">{profile?.goal?.replace(/_/g, ' ') ?? ''}</p>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-white font-bold text-lg">{profile?.days_per_week ?? '—'}</p>
                <p className="text-gray-500 text-xs">days/week</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-white font-bold text-lg capitalize">{profile?.training_level?.slice(0,3) ?? '—'}</p>
                <p className="text-gray-500 text-xs">level</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-white font-bold text-lg">{racePlanInfo ? `W${racePlanInfo.currentWeek}` : '—'}</p>
                <p className="text-gray-500 text-xs">current week</p>
              </div>
            </div>

            {/* Personal Details */}
            <a href="/settings" onClick={() => setShowProfile(false)}
              className="w-full py-3 rounded-xl bg-gray-800 text-gray-300 font-semibold text-sm text-center block">
              ✏️ Personal Details
            </a>

            {/* Sign out */}
            <form action="/api/auth/logout" method="POST">
              <button type="submit" className="w-full py-3 rounded-xl bg-red-900/40 text-red-300 border border-red-700/30 font-bold text-sm active:scale-95 transition-transform">
                Sign Out
              </button>
            </form>
          </div>
        </>
      )}

      {cropFile && (
        <AvatarCropModal
          imageFile={cropFile}
          onConfirm={handleAvatarCropped}
          onCancel={() => setCropFile(null)}
        />
      )}
    </div>
  );
}
