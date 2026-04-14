'use client';

import { useState } from 'react';
import { supabase, DailyCheckin, FeelingType, UserProfile } from '@/lib/supabase';
import { dateToString, getWorkoutForDate } from '@/lib/training-plan';

const FEELING_OPTIONS: { value: FeelingType; label: string; emoji: string; cls: string }[] = [
  { value: 'great',   label: 'Great',   emoji: '🟢', cls: 'bg-green-700 text-white border-green-600' },
  { value: 'good',    label: 'Good',    emoji: '🔵', cls: 'bg-blue-700 text-white border-blue-600' },
  { value: 'tired',   label: 'Tired',   emoji: '🟡', cls: 'bg-yellow-700 text-white border-yellow-600' },
  { value: 'bad',     label: 'Bad',     emoji: '🔴', cls: 'bg-orange-700 text-white border-orange-600' },
  { value: 'injured', label: 'Injured', emoji: '🚨', cls: 'bg-red-800 text-white border-red-600' },
];

interface Props {
  profile: UserProfile | null;
  userId: string;
  todayStr: string;
  onSave: (checkin: DailyCheckin) => void;
  onDismiss: () => void;
}

export default function CheckinModal({ profile, userId, todayStr, onSave, onDismiss }: Props) {
  const hasTracker = profile?.has_sleep_tracker ?? false;

  const [whoop, setWhoop]           = useState(70);
  const [sleep, setSleep]           = useState(70);
  const [sleepHours, setSleepHours] = useState(7);
  const [achilles, setAchilles]     = useState(0);
  const [feeling, setFeeling]       = useState<FeelingType>('good');
  const [saving, setSaving]         = useState(false);

  const recoveryTier = whoop >= 70 ? '#22c55e' : whoop >= 33 ? '#facc15' : '#ef4444';
  const sleepTier    = sleep >= 70 ? '#22c55e' : sleep >= 50 ? '#facc15' : '#ef4444';
  const sleepHrColor = sleepHours >= 7 ? '#22c55e' : sleepHours >= 5.5 ? '#facc15' : '#ef4444';
  const achillesColor = achilles === 0 ? '#22c55e' : achilles <= 3 ? '#facc15' : '#ef4444';

  function sliderBg(color: string, val: number, min: number, max: number) {
    const pct = ((val - min) / (max - min)) * 100;
    return `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, #374151 ${pct}%, #374151 100%)`;
  }

  async function handleSave() {
    setSaving(true);
    const payload: Record<string, unknown> = {
      user_id: userId, date: todayStr,
      achilles_pain: achilles, feeling,
    };
    if (hasTracker) {
      payload.whoop_recovery = whoop;
      payload.sleep_score    = sleep;
    } else {
      payload.sleep_hours = sleepHours;
    }

    try {
      const { data } = await supabase
        .from('daily_checkins')
        .upsert(payload, { onConflict: 'user_id,date' })
        .select().single();

      if (data) {
        const savedCheckin = data as DailyCheckin;
        fetch('/api/ai-coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plannedWorkout: getWorkoutForDate(new Date()), checkin: savedCheckin }),
        }).then(r => r.json()).then(coach => {
          if (coach.title) {
            localStorage.setItem('ai_coach_today', JSON.stringify({ ...coach, date: todayStr }));
          }
        }).catch(() => {});
        onSave(savedCheckin);
        return;
      }
    } catch {}
    // Always dismiss even on error
    setSaving(false);
    onDismiss();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-40" onClick={onDismiss} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-gray-950 rounded-t-3xl"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-700 rounded-full" />
        </div>

        <div className="px-5 pb-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-white font-bold text-lg">Morning Check-in</h2>
              <p className="text-gray-500 text-xs mt-0.5">How are you doing today?</p>
            </div>
            <button onClick={onDismiss} className="text-gray-600 text-2xl leading-none">×</button>
          </div>

          <div className="space-y-4">
            {/* Tracker fields */}
            {hasTracker && (
              <>
                <div className="bg-gray-900 rounded-2xl p-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-white text-sm font-semibold">Recovery Score</span>
                    <span className="text-xl font-bold" style={{ color: recoveryTier }}>{whoop}%</span>
                  </div>
                  <input type="range" min={0} max={100} value={whoop} onChange={e => setWhoop(+e.target.value)}
                    className="w-full" style={{ background: sliderBg(recoveryTier, whoop, 0, 100) }} />
                </div>
                <div className="bg-gray-900 rounded-2xl p-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-white text-sm font-semibold">Sleep Score</span>
                    <span className="text-xl font-bold" style={{ color: sleepTier }}>{sleep}%</span>
                  </div>
                  <input type="range" min={0} max={100} value={sleep} onChange={e => setSleep(+e.target.value)}
                    className="w-full" style={{ background: sliderBg(sleepTier, sleep, 0, 100) }} />
                </div>
              </>
            )}

            {/* No-tracker field */}
            {!hasTracker && (
              <div className="bg-gray-900 rounded-2xl p-4">
                <div className="flex justify-between mb-2">
                  <span className="text-white text-sm font-semibold">Hours slept</span>
                  <span className="text-xl font-bold" style={{ color: sleepHrColor }}>{sleepHours}h</span>
                </div>
                <input type="range" min={3} max={12} step={0.5} value={sleepHours} onChange={e => setSleepHours(+e.target.value)}
                  className="w-full" style={{ background: sliderBg(sleepHrColor, sleepHours, 3, 12) }} />
              </div>
            )}

            {/* Pain tracker — only if user has injury notes */}
            {profile?.injury_notes && (
              <div className="bg-gray-900 rounded-2xl p-4">
                <div className="flex justify-between mb-2">
                  <span className="text-white text-sm font-semibold">Pain Level</span>
                  <span className="text-xl font-bold" style={{ color: achillesColor }}>{achilles}/10</span>
                </div>
                <input type="range" min={0} max={10} value={achilles} onChange={e => setAchilles(+e.target.value)}
                  className="w-full" style={{ background: sliderBg(achillesColor, achilles, 0, 10) }} />
                <p className="text-gray-600 text-xs mt-1">{profile.injury_notes}</p>
              </div>
            )}

            {/* Feeling */}
            <div>
              <p className="text-white text-sm font-semibold mb-2">How are you feeling?</p>
              <div className="flex gap-2 flex-wrap">
                {FEELING_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setFeeling(opt.value)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                      feeling === opt.value ? opt.cls : 'bg-gray-800 text-gray-400 border-gray-700'
                    }`}>
                    <span>{opt.emoji}</span>{opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleSave} disabled={saving}
              className="w-full py-4 rounded-2xl font-bold text-white text-base bg-blue-600 disabled:opacity-60 active:scale-95 transition-transform">
              {saving ? 'Saving…' : 'Save Check-in ✓'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
