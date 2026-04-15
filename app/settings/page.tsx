'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, UserProfile } from '@/lib/supabase';
import BottomNav from '@/components/BottomNav';

const GOALS = [
  { value: 'marathon',      label: '🏆 Marathon' },
  { value: 'half_marathon', label: '🥈 Half Marathon' },
  { value: '10k',           label: '🏅 10K' },
  { value: 'get_fit',       label: '💪 Get Fit' },
  { value: 'lose_weight',   label: '⚡ Lose Weight' },
  { value: 'other',         label: '✏️ Other' },
];
const LEVELS = [
  { value: 'beginner',     label: 'Beginner',     sub: 'No fixed schedule' },
  { value: 'intermediate', label: 'Intermediate', sub: '1–3× per week' },
  { value: 'advanced',     label: 'Advanced',     sub: 'Daily training' },
];
const ACTIVITY = [
  { value: 'sedentary',   label: 'Mostly sedentary' },
  { value: 'active',      label: 'Somewhat active' },
  { value: 'very_active', label: 'Regularly active' },
];
const SLEEP_DEVICES = [
  { value: 'whoop',       label: '💚 Whoop' },
  { value: 'garmin',      label: '⌚ Garmin' },
  { value: 'apple_watch', label: '🍎 Apple Watch' },
  { value: 'other',       label: '📱 Other tracker' },
  { value: 'none',        label: '🚫 No tracker' },
];
const EQUIPMENT = [
  { value: 'outdoor_running', label: '🏃 Outdoors' },
  { value: 'gym',             label: '🏋️ Gym' },
  { value: 'bike',            label: '🚴 Bike' },
  { value: 'pool',            label: '🏊 Pool' },
  { value: 'other',           label: '🔧 Other' },
  { value: 'none',            label: '🚫 None' },
];
const PREFERRED_ACTIVITIES = [
  { value: 'run',   label: '🏃 Running' },
  { value: 'gym',   label: '🏋️ Strength' },
  { value: 'bike',  label: '🚴 Cycling' },
  { value: 'swim',  label: '🏊 Swimming' },
  { value: 'other', label: '🔧 Other' },
];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState('');
  const [originalProfile, setOriginalProfile] = useState<UserProfile | null>(null);

  const [name, setName] = useState('');
  const [goal, setGoal] = useState('marathon');
  const [goalOther, setGoalOther] = useState('');
  const [daysPerWeek, setDays] = useState(4);
  const [level, setLevel] = useState('intermediate');
  const [age, setAge] = useState('');
  const [currentActivity, setCurrentActivity] = useState('active');
  const [sleepDevice, setSleepDevice] = useState('none');
  const [equipment, setEquipment] = useState<string[]>(['outdoor_running']);
  const [preferredActivities, setPreferredActivities] = useState<string[]>(['run']);
  const [injuryNotes, setInjuryNotes] = useState('');
  const [preferredDay, setPreferredDay] = useState('Sat');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/signin'); return; }
      setUserId(user.id);
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (prof) {
        setOriginalProfile(prof as UserProfile);
        setName(prof.name ?? '');
        setGoal(prof.goal ?? 'marathon');
        setGoalOther(prof.goal_other ?? '');
        setDays(prof.days_per_week ?? 4);
        setLevel(prof.training_level ?? 'intermediate');
        setAge(prof.age ? String(prof.age) : '');
        setCurrentActivity(prof.current_activity ?? 'active');
        setSleepDevice(prof.sleep_device ?? 'none');
        setEquipment(prof.equipment ?? ['outdoor_running']);
        setPreferredActivities(prof.preferred_activities ?? ['run']);
        setInjuryNotes(prof.injury_notes ?? '');
        setPreferredDay(prof.preferred_long_day ?? 'Sat');
      }
      setLoading(false);
    }
    load();
  }, [router]);

  function toggleEquipment(val: string) {
    setEquipment(prev => prev.includes(val) ? prev.filter(e => e !== val) : [...prev, val]);
  }
  function toggleActivity(val: string) {
    setPreferredActivities(prev => prev.includes(val) ? prev.filter(e => e !== val) : [...prev, val]);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSaved(false);

    const profileData = {
      name,
      goal,
      goal_other:           goal === 'other' ? goalOther : null,
      training_level:       level,
      days_per_week:        daysPerWeek,
      age:                  age ? parseInt(age) : null,
      current_activity:     currentActivity,
      equipment,
      preferred_activities: preferredActivities,
      injury_notes:         injuryNotes || null,
      preferred_long_day:   preferredDay,
      sleep_device:         sleepDevice,
      has_sleep_tracker:    sleepDevice !== 'none',
    };

    const { error: updateError } = await supabase.from('profiles').update(profileData).eq('id', userId);
    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    // Regenerate plan if training-related fields changed
    const trainingChanged =
      originalProfile?.goal !== goal ||
      originalProfile?.training_level !== level ||
      originalProfile?.days_per_week !== daysPerWeek ||
      originalProfile?.preferred_long_day !== preferredDay ||
      JSON.stringify(originalProfile?.preferred_activities) !== JSON.stringify(preferredActivities) ||
      JSON.stringify(originalProfile?.equipment) !== JSON.stringify(equipment);

    if (trainingChanged) {
      try {
        await fetch('/api/generate-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, profile: { ...profileData, id: userId } }),
        });
      } catch {
        console.error('Plan regeneration failed');
      }
    }

    setSaving(false);
    // Update originalProfile for future change detection
    if (originalProfile) setOriginalProfile({ ...originalProfile, ...profileData });
    router.push('/');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950" style={{ paddingBottom: '5.5rem' }}>
      <header className="bg-[#1B2A4A] px-4 pb-4" style={{ paddingTop: 'max(env(safe-area-inset-top), 2.5rem)' }}>
        <div className="max-w-md mx-auto flex items-center gap-3">
          <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <h1 className="text-white font-bold text-lg">Personal Details</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-5 space-y-6">
        {/* Name */}
        <div>
          <label className="text-gray-400 text-xs font-medium block mb-1.5">Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500"
            placeholder="Your name" />
        </div>

        {/* Goal */}
        <div>
          <label className="text-gray-400 text-xs font-medium block mb-2">Training goal</label>
          <div className="grid grid-cols-2 gap-2">
            {GOALS.map(g => (
              <button key={g.value} type="button" onClick={() => setGoal(g.value)}
                className={`py-3 px-3 rounded-xl text-sm font-medium text-left transition-colors ${goal === g.value ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 border border-gray-800'}`}>
                {g.label}
              </button>
            ))}
          </div>
          {goal === 'other' && (
            <textarea value={goalOther} onChange={e => setGoalOther(e.target.value.slice(0, 120))}
              rows={2} placeholder="Describe your goal…"
              className="w-full mt-2 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
          )}
        </div>

        {/* Days per week */}
        <div>
          <label className="text-gray-400 text-xs font-medium block mb-2">Training days per week</label>
          <div className="flex gap-2">
            {[2, 3, 4, 5, 6, 7].map(d => (
              <button key={d} type="button" onClick={() => setDays(d)}
                className={`w-11 h-11 rounded-xl text-sm font-bold transition-colors ${daysPerWeek === d ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 border border-gray-800'}`}>
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Level */}
        <div>
          <label className="text-gray-400 text-xs font-medium block mb-2">Training experience</label>
          <div className="space-y-2">
            {LEVELS.map(l => (
              <button key={l.value} type="button" onClick={() => setLevel(l.value)}
                className={`w-full py-3 px-4 rounded-xl text-sm font-medium text-left flex items-center justify-between transition-colors ${level === l.value ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 border border-gray-800'}`}>
                <span>{l.label}</span>
                <span className={`text-xs ${level === l.value ? 'text-blue-200' : 'text-gray-600'}`}>{l.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Age */}
        <div>
          <label className="text-gray-400 text-xs font-medium block mb-1.5">Age</label>
          <input type="number" value={age} onChange={e => setAge(e.target.value)} min={10} max={99} placeholder="e.g. 32"
            className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500" />
        </div>

        {/* Activity level */}
        <div>
          <label className="text-gray-400 text-xs font-medium block mb-2">Current activity level</label>
          <div className="space-y-2">
            {ACTIVITY.map(a => (
              <button key={a.value} type="button" onClick={() => setCurrentActivity(a.value)}
                className={`w-full py-3 px-4 rounded-xl text-sm font-medium text-left transition-colors ${currentActivity === a.value ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 border border-gray-800'}`}>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sleep / fitness tracker */}
        <div>
          <label className="text-gray-400 text-xs font-medium block mb-2">Sleep / fitness tracker</label>
          <div className="grid grid-cols-2 gap-2">
            {SLEEP_DEVICES.map(d => (
              <button key={d.value} type="button" onClick={() => setSleepDevice(d.value)}
                className={`py-3 px-3 rounded-xl text-sm font-medium text-left transition-colors ${sleepDevice === d.value ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 border border-gray-800'}`}>
                {d.label}
              </button>
            ))}
          </div>
          {sleepDevice !== 'none' && <p className="text-blue-400/70 text-xs mt-1.5">Recovery & sleep scores will appear in your check-ins.</p>}
        </div>

        {/* Preferred activities */}
        <div>
          <label className="text-gray-400 text-xs font-medium block mb-2">Preferred training types</label>
          <div className="grid grid-cols-2 gap-2">
            {PREFERRED_ACTIVITIES.map(a => (
              <button key={a.value} type="button" onClick={() => toggleActivity(a.value)}
                className={`py-3 px-3 rounded-xl text-sm font-medium text-left transition-colors ${preferredActivities.includes(a.value) ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 border border-gray-800'}`}>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Equipment */}
        <div>
          <label className="text-gray-400 text-xs font-medium block mb-2">Available equipment</label>
          <div className="grid grid-cols-2 gap-2">
            {EQUIPMENT.map(eq => (
              <button key={eq.value} type="button" onClick={() => toggleEquipment(eq.value)}
                className={`py-3 px-3 rounded-xl text-sm font-medium text-left transition-colors ${equipment.includes(eq.value) ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 border border-gray-800'}`}>
                {eq.label}
              </button>
            ))}
          </div>
        </div>

        {/* Preferred long day */}
        <div>
          <label className="text-gray-400 text-xs font-medium block mb-2">Preferred long / hard day</label>
          <div className="flex gap-1.5">
            {DAYS.map(d => (
              <button key={d} type="button" onClick={() => setPreferredDay(d)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${preferredDay === d ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 border border-gray-800'}`}>
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Injuries */}
        <div>
          <label className="text-gray-400 text-xs font-medium block mb-1.5">
            Injuries / limitations <span className="text-gray-600">(optional)</span>
          </label>
          <textarea value={injuryNotes} onChange={e => setInjuryNotes(e.target.value.slice(0, 200))}
            rows={2} placeholder="e.g. bad knee, achilles pain…"
            className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
        </div>

        {error && <p className="text-red-400 text-sm bg-red-950/50 border border-red-800/40 rounded-xl px-4 py-2">{error}</p>}

        <button onClick={handleSave} disabled={saving}
          className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold text-base disabled:opacity-60 active:scale-95 transition-transform">
          {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Changes'}
        </button>

        {saving && (
          <p className="text-center text-blue-400/60 text-xs -mt-2">
            {originalProfile?.goal !== goal || originalProfile?.training_level !== level
              ? 'Updating your training plan with AI…'
              : 'Saving your details…'}
          </p>
        )}
      </main>

      <BottomNav active="today" />
    </div>
  );
}
