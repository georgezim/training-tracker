'use client';

import { useEffect, useState } from 'react';
import { supabase, DailyCheckin, UserProfile } from '@/lib/supabase';
import { getWorkoutForDateWithProfile, parseLocalDate, COLOR_TEXT, PlanProfile } from '@/lib/training-plan';
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const planProfile: PlanProfile | null = profile ? {
    goal: profile.goal,
    daysPerWeek: profile.days_per_week ?? 4,
    preferredLongDay: profile.preferred_long_day ?? 'Sat',
    trainingLevel: profile.training_level ?? 'intermediate',
    customPlan: profile.custom_plan ?? null,
    raceDate: profile.race_date ?? null,
    createdAt: profile.created_at ?? null,
  } : null;

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [{ data: checkinData }, { data: prof }] = await Promise.all([
        supabase.from('daily_checkins').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(90),
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      ]);
      if (checkinData) setCheckins(checkinData as DailyCheckin[]);
      if (prof) setProfile(prof as UserProfile);
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
          const workout = getWorkoutForDateWithProfile(date, planProfile);
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

              {ci.notes && (
                <p className="text-gray-500 text-xs mt-2 italic leading-relaxed">"{ci.notes}"</p>
              )}

              {ci.ai_coach_title && (
                <div className="mt-2 bg-indigo-950/40 border border-indigo-800/30 rounded-lg px-3 py-2">
                  <p className="text-indigo-300 text-xs font-semibold">✦ {ci.ai_coach_title}</p>
                  {ci.ai_coach_description && (
                    <p className="text-indigo-200/60 text-xs mt-0.5">{ci.ai_coach_description}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </main>

      <BottomNav active="history" />
    </div>
  );
}
