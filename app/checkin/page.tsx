'use client';

import { useEffect, useState } from 'react';
import { supabase, DailyCheckin, FeelingType, UserProfile } from '@/lib/supabase';
import { dateToString, getWorkoutForDate } from '@/lib/training-plan';
import BottomNav from '@/components/BottomNav';

const FEELING_OPTIONS: { value: FeelingType; label: string; emoji: string; cls: string }[] = [
  { value: 'great',   label: 'Great',   emoji: '🟢', cls: 'bg-green-700 text-white border-green-600' },
  { value: 'good',    label: 'Good',    emoji: '🔵', cls: 'bg-blue-700 text-white border-blue-600' },
  { value: 'tired',   label: 'Tired',   emoji: '🟡', cls: 'bg-yellow-700 text-white border-yellow-600' },
  { value: 'bad',     label: 'Bad',     emoji: '🔴', cls: 'bg-orange-700 text-white border-orange-600' },
  { value: 'injured', label: 'Injured', emoji: '🚨', cls: 'bg-red-800 text-white border-red-600' },
];

function Slider({ label, value, min, max, unit, tier, onChange, ticks }: {
  label: string; value: number; min: number; max: number; unit: string;
  tier: 'green' | 'yellow' | 'red'; onChange: (v: number) => void; ticks?: string[];
}) {
  const tierColor = {
    green:  { text: 'text-green-400',  accent: '#22c55e' },
    yellow: { text: 'text-yellow-400', accent: '#facc15' },
    red:    { text: 'text-red-400',    accent: '#ef4444' },
  }[tier];
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <label className="text-white font-semibold text-sm">{label}</label>
        <span className={`text-2xl font-bold tabular-nums ${tierColor.text}`}>{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full"
        style={{ background: `linear-gradient(to right, ${tierColor.accent} 0%, ${tierColor.accent} ${((value - min) / (max - min)) * 100}%, #374151 ${((value - min) / (max - min)) * 100}%, #374151 100%)` }}
      />
      {ticks && (
        <div className="flex justify-between mt-1.5">
          {ticks.map(t => <span key={t} className="text-gray-600 text-xs">{t}</span>)}
        </div>
      )}
    </div>
  );
}

export default function CheckinPage() {
  const today = new Date();
  const todayStr = dateToString(today);
  const dateLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [existing, setExisting] = useState<DailyCheckin | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Tracker users
  const [whoop, setWhoop]       = useState(70);
  const [sleep, setSleep]       = useState(70);
  // Non-tracker users
  const [sleepHours, setSleepHours] = useState(7);
  // Common
  const [achilles, setAchilles] = useState(0);
  const [feeling, setFeeling]   = useState<FeelingType>('good');
  const [notes, setNotes]       = useState('');

  const hasTracker = profile ? profile.has_sleep_tracker : true; // default to tracker view while loading

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [{ data: prof }, { data: ci }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('daily_checkins').select('*').eq('user_id', user.id).eq('date', todayStr).maybeSingle(),
      ]);

      if (prof) setProfile(prof as UserProfile);

      if (ci) {
        const c = ci as DailyCheckin;
        setExisting(c);
        if (c.whoop_recovery != null) setWhoop(c.whoop_recovery);
        if (c.sleep_score    != null) setSleep(c.sleep_score);
        if (c.sleep_hours    != null) setSleepHours(c.sleep_hours);
        if (c.achilles_pain  != null) setAchilles(c.achilles_pain);
        if (c.feeling)               setFeeling(c.feeling);
        if (c.notes)                 setNotes(c.notes);
      }
      setLoading(false);
    }
    load();
  }, [todayStr]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const payload: Record<string, unknown> = {
      user_id:      user.id,
      date:         todayStr,
      achilles_pain: achilles,
      feeling,
      notes: notes.trim() || null,
    };

    if (hasTracker) {
      payload.whoop_recovery = whoop;
      payload.sleep_score    = sleep;
    } else {
      payload.sleep_hours    = sleepHours;
    }

    let savedCheckin: DailyCheckin | null = null;
    if (existing) {
      await supabase.from('daily_checkins').update(payload).eq('id', existing.id);
      savedCheckin = { ...existing, ...payload } as DailyCheckin;
    } else {
      const { data } = await supabase
        .from('daily_checkins')
        .upsert(payload, { onConflict: 'user_id,date' })
        .select().single();
      if (data) { savedCheckin = data as DailyCheckin; setExisting(savedCheckin); }
    }

    if (savedCheckin) {
      const workout = getWorkoutForDate(new Date());
      fetch('/api/ai-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plannedWorkout: workout, checkin: savedCheckin }),
      }).then(r => r.json()).then(coach => {
        if (coach.title) {
          localStorage.setItem('ai_coach_today', JSON.stringify({ ...coach, date: todayStr }));
        }
      }).catch(() => {});
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const recoveryTier = whoop >= 70 ? 'green' : whoop >= 33 ? 'yellow' : 'red';
  const sleepTier    = sleep  >= 70 ? 'green' : sleep  >= 50 ? 'yellow' : 'red';
  const sleepHrTier  = sleepHours >= 7 ? 'green' : sleepHours >= 5.5 ? 'yellow' : 'red';
  const achillesTier = achilles === 0 ? 'green' : achilles <= 3 ? 'yellow' : 'red';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950" style={{ paddingBottom: '6rem' }}>
      <header className="bg-[#1B2A4A] px-4 pb-5" style={{ paddingTop: 'max(env(safe-area-inset-top), 2.5rem)' }}>
        <div className="max-w-md mx-auto">
          <h1 className="text-white text-xl font-bold">Daily Check-in</h1>
          <p className="text-blue-300/80 text-sm mt-0.5">{dateLabel}</p>
          {existing && (
            <span className="inline-block mt-1.5 text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full">
              ✓ Logged today
            </span>
          )}
        </div>
      </header>

      <form onSubmit={handleSubmit} className="max-w-md mx-auto px-4 pt-5 space-y-4">
        {hasTracker ? (
          <>
            <Slider label="Recovery Score" value={whoop} min={0} max={100} unit="%" tier={recoveryTier} onChange={setWhoop}
              ticks={['0%', 'Low <33', 'Medium <70', '100%']} />
            <Slider label="Sleep Score" value={sleep} min={0} max={100} unit="%" tier={sleepTier} onChange={setSleep}
              ticks={['0%', 'Poor <50', 'Fair <70', '100%']} />
          </>
        ) : (
          <Slider label="Hours slept" value={sleepHours} min={3} max={12} unit="h" tier={sleepHrTier} onChange={setSleepHours}
            ticks={['3h', '5h', '7h', '9h', '12h']} />
        )}

        {profile?.injury_notes && (
          <div>
            <Slider label="Pain Level" value={achilles} min={0} max={10} unit="/10" tier={achillesTier} onChange={setAchilles}
              ticks={['0 None', '5 Moderate', '10 Severe']} />
            <p className="text-gray-600 text-xs mt-1 px-1">{profile.injury_notes}</p>
            {achilles > 3 && (
              <p className="text-red-400 text-xs mt-2 px-1">⚠️ Pain above 3/10 — consider reducing load. Ice post-session.</p>
            )}
          </div>
        )}

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <label className="text-white font-semibold text-sm block mb-3">How are you feeling?</label>
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

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <label className="text-white font-semibold text-sm block mb-3">
            Notes <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="How did yesterday's workout go? Anything noteworthy."
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-xl px-3 py-2.5 placeholder-gray-600 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
          />
        </div>

        <button type="submit" disabled={saving}
          className={`w-full py-4 rounded-2xl font-bold text-white text-base transition-all active:scale-95 ${
            saved ? 'bg-green-600' : saving ? 'bg-blue-800 opacity-70' : 'bg-blue-600'
          }`}>
          {saving ? 'Saving…' : saved ? '✓ Saved!' : existing ? 'Update Check-in' : 'Save Check-in'}
        </button>
      </form>

      <BottomNav active="checkin" />
    </div>
  );
}
