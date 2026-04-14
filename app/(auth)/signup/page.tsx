'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Step = 'account' | 'goals' | 'fitness' | 'setup';
const STEPS: Step[] = ['account', 'goals', 'fitness', 'setup'];

const GOALS = [
  { value: 'marathon',      label: '🏆 Run a Marathon' },
  { value: 'half_marathon', label: '🥈 Run a Half Marathon' },
  { value: '10k',           label: '🏅 Run a 10K' },
  { value: 'get_fit',       label: '💪 Get Fit' },
  { value: 'lose_weight',   label: '⚡ Lose Weight' },
  { value: 'other',         label: '✏️ Other' },
];

const LEVELS = [
  { value: 'beginner',     label: 'Beginner',      sub: 'No fixed training schedule' },
  { value: 'intermediate', label: 'Intermediate',  sub: 'Active 1–3 times per week' },
  { value: 'advanced',     label: 'Advanced',      sub: 'Training every day' },
];

const ACTIVITY = [
  { value: 'sedentary',  label: 'Mostly sedentary',   sub: 'Desk job, little movement' },
  { value: 'active',     label: 'Somewhat active',    sub: 'Light activity a few times/week' },
  { value: 'very_active',label: 'Regularly active',   sub: 'Consistent workouts' },
];

const SLEEP_DEVICES = [
  { value: 'whoop',        label: '💚 Whoop' },
  { value: 'garmin',       label: '⌚ Garmin' },
  { value: 'apple_watch',  label: '🍎 Apple Watch' },
  { value: 'other',        label: '📱 Other tracker' },
  { value: 'none',         label: '🚫 No tracker' },
];

const EQUIPMENT = [
  { value: 'outdoor_running', label: '🏃 Running outdoors' },
  { value: 'gym',             label: '🏋️ Gym' },
  { value: 'bike',            label: '🚴 Bike' },
  { value: 'pool',            label: '🏊 Pool' },
  { value: 'other',           label: '🔧 Other' },
  { value: 'none',            label: '🚫 No equipment' },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STEP_TITLES: Record<Step, string> = {
  account: 'Create your account',
  goals:   'What are you training for?',
  fitness: 'Tell us about yourself',
  setup:   'Your training setup',
};

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('account');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1 — account
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  // Step 2 — goals
  const [goal, setGoal]           = useState('marathon');
  const [goalOther, setGoalOther] = useState('');
  const [daysPerWeek, setDays]    = useState(4);

  // Step 3 — fitness
  const [level, setLevel]           = useState('intermediate');
  const [age, setAge]               = useState('');
  const [currentActivity, setCurrentActivity] = useState('active');
  const [sleepDevice, setSleepDevice] = useState('none');

  // Step 4 — setup
  const [equipment, setEquipment]   = useState<string[]>(['outdoor_running']);
  const [injuryNotes, setInjuryNotes] = useState('');
  const [preferredDay, setPreferredDay] = useState('Sat');

  const stepIndex = STEPS.indexOf(step);

  function toggleEquipment(val: string) {
    setEquipment(prev =>
      prev.includes(val) ? prev.filter(e => e !== val) : [...prev, val]
    );
  }

  function next(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1]);
    }
  }

  function back() {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    if (signupError) {
      setError(signupError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      const profileData = {
        id: data.user.id,
        name,
        goal,
        goal_other:         goal === 'other' ? goalOther : null,
        training_level:     level,
        days_per_week:      daysPerWeek,
        age:                age ? parseInt(age) : null,
        current_activity:   currentActivity,
        equipment:          equipment,
        injury_notes:       injuryNotes || null,
        preferred_long_day: preferredDay,
        sleep_device:       sleepDevice,
        has_sleep_tracker:  sleepDevice !== 'none',
      };

      await supabase.from('profiles').upsert(profileData);

      // Generate personalized training plan with Gemini (race goals use built-in phased plan)
      const raceGoals = ['marathon', 'half_marathon', '10k'];
      if (!raceGoals.includes(goal)) {
        try {
          await fetch('/api/generate-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: data.user.id, profile: profileData }),
          });
        } catch {
          // Plan generation is best-effort — don't block signup
          console.error('Plan generation failed, will use fallback templates');
        }
      }
    }

    router.push('/');
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        </div>
        <img src="/logo.jpeg" alt="Dromos" style={{ height: '36px', width: 'auto', margin: '0 auto' }} />
        <p className="text-gray-500 text-sm mt-1">{STEP_TITLES[step]}</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-1">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`flex-1 h-1 rounded-full transition-colors ${
              i <= stepIndex ? 'bg-blue-600' : 'bg-gray-800'
            }`}
          />
        ))}
      </div>
      <p className="text-gray-600 text-xs mb-6 text-right">
        Step {stepIndex + 1} of {STEPS.length}
      </p>

      {/* ── Step 1: Account ── */}
      {step === 'account' && (
        <form onSubmit={next} className="space-y-4">
          <div>
            <label className="text-gray-400 text-xs font-medium block mb-1.5">Name</label>
            <input
              value={name} onChange={e => setName(e.target.value)} required
              className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="George"
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs font-medium block mb-1.5">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              autoComplete="email"
              className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="you@email.com"
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs font-medium block mb-1.5">Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)} required
              minLength={6} autoComplete="new-password"
              className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="Min 6 characters"
            />
          </div>
          <button type="submit" className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm active:scale-95 transition-transform">
            Continue →
          </button>
          <p className="text-center text-gray-500 text-sm">
            Have an account?{' '}
            <Link href="/login" className="text-blue-400 font-medium">Sign in</Link>
          </p>
        </form>
      )}

      {/* ── Step 2: Goals ── */}
      {step === 'goals' && (
        <form onSubmit={next} className="space-y-5">
          <div>
            <label className="text-gray-400 text-xs font-medium block mb-2">What's your main goal?</label>
            <div className="grid grid-cols-2 gap-2">
              {GOALS.map(g => (
                <button
                  key={g.value} type="button" onClick={() => setGoal(g.value)}
                  className={`py-3 px-3 rounded-xl text-sm font-medium text-left transition-colors ${
                    goal === g.value ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 border border-gray-800'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
            {goal === 'other' && (
              <div className="mt-2">
                <textarea
                  value={goalOther}
                  onChange={e => setGoalOther(e.target.value.slice(0, 120))}
                  rows={3}
                  placeholder="Describe your goal… (120 chars max)"
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors resize-none"
                />
                <p className="text-gray-600 text-xs text-right mt-1">{goalOther.length}/120</p>
              </div>
            )}
          </div>

          <div>
            <label className="text-gray-400 text-xs font-medium block mb-2">
              How many days per week do you want to train?
            </label>
            <div className="flex gap-2 flex-wrap">
              {[2, 3, 4, 5, 6, 7].map(d => (
                <button
                  key={d} type="button" onClick={() => setDays(d)}
                  className={`w-11 h-11 rounded-xl text-sm font-bold transition-colors ${
                    daysPerWeek === d ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 border border-gray-800'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <p className="text-gray-600 text-xs mt-1.5">{daysPerWeek} days/week selected</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={back} className="flex-1 py-3 rounded-xl bg-gray-800 text-gray-300 font-bold text-sm active:scale-95 transition-transform">
              ← Back
            </button>
            <button type="submit" className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm active:scale-95 transition-transform">
              Continue →
            </button>
          </div>
        </form>
      )}

      {/* ── Step 3: Fitness ── */}
      {step === 'fitness' && (
        <form onSubmit={next} className="space-y-5">
          <div>
            <label className="text-gray-400 text-xs font-medium block mb-2">Training experience</label>
            <div className="space-y-2">
              {LEVELS.map(l => (
                <button
                  key={l.value} type="button" onClick={() => setLevel(l.value)}
                  className={`w-full py-3 px-4 rounded-xl text-sm font-medium text-left flex items-center justify-between transition-colors ${
                    level === l.value ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 border border-gray-800'
                  }`}
                >
                  <span>{l.label}</span>
                  <span className={`text-xs ${level === l.value ? 'text-blue-200' : 'text-gray-600'}`}>{l.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-xs font-medium block mb-1.5">Age</label>
            <input
              type="number" value={age} onChange={e => setAge(e.target.value)}
              min={10} max={99} placeholder="e.g. 32"
              className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-gray-400 text-xs font-medium block mb-2">Current activity level</label>
            <div className="space-y-2">
              {ACTIVITY.map(a => (
                <button
                  key={a.value} type="button" onClick={() => setCurrentActivity(a.value)}
                  className={`w-full py-3 px-4 rounded-xl text-sm font-medium text-left flex items-center justify-between transition-colors ${
                    currentActivity === a.value ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 border border-gray-800'
                  }`}
                >
                  <span>{a.label}</span>
                  <span className={`text-xs ${currentActivity === a.value ? 'text-blue-200' : 'text-gray-600'}`}>{a.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-xs font-medium block mb-2">Do you use a sleep / fitness tracker?</label>
            <div className="grid grid-cols-2 gap-2">
              {SLEEP_DEVICES.map(d => (
                <button
                  key={d.value} type="button" onClick={() => setSleepDevice(d.value)}
                  className={`py-3 px-3 rounded-xl text-sm font-medium text-left transition-colors ${
                    sleepDevice === d.value ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 border border-gray-800'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            {sleepDevice !== 'none' && (
              <p className="text-blue-400/70 text-xs mt-1.5">Great — your check-ins will include recovery & sleep scores.</p>
            )}
            {sleepDevice === 'none' && (
              <p className="text-gray-500 text-xs mt-1.5">No problem — check-ins will ask how you feel and hours slept.</p>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={back} className="flex-1 py-3 rounded-xl bg-gray-800 text-gray-300 font-bold text-sm active:scale-95 transition-transform">
              ← Back
            </button>
            <button type="submit" className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm active:scale-95 transition-transform">
              Continue →
            </button>
          </div>
        </form>
      )}

      {/* ── Step 4: Setup ── */}
      {step === 'setup' && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-gray-400 text-xs font-medium block mb-2">Available equipment</label>
            <div className="grid grid-cols-2 gap-2">
              {EQUIPMENT.map(eq => (
                <button
                  key={eq.value} type="button" onClick={() => toggleEquipment(eq.value)}
                  className={`py-3 px-3 rounded-xl text-sm font-medium text-left transition-colors ${
                    equipment.includes(eq.value)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-900 text-gray-400 border border-gray-800'
                  }`}
                >
                  {eq.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-xs font-medium block mb-1.5">
              Any injuries or limitations? <span className="text-gray-600">(optional)</span>
            </label>
            <textarea
              value={injuryNotes}
              onChange={e => setInjuryNotes(e.target.value.slice(0, 200))}
              rows={2}
              placeholder="e.g. bad knee, achilles pain on left side…"
              className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors resize-none"
            />
          </div>

          <div>
            <label className="text-gray-400 text-xs font-medium block mb-2">
              Preferred day for your long / hard workout
            </label>
            <div className="flex gap-1.5">
              {DAYS.map(d => (
                <button
                  key={d} type="button" onClick={() => setPreferredDay(d)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${
                    preferredDay === d ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 border border-gray-800'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Tailored plan notice */}
          <div className="bg-blue-950/60 border border-blue-800/40 rounded-xl px-4 py-3 space-y-1">
            <p className="text-blue-300 text-sm font-semibold">✦ We'll build your tailored plan</p>
            <p className="text-blue-200/70 text-xs leading-relaxed">
              Based on your answers, your AI coach will create a personalised training plan adapted to your goals, schedule, and fitness level.
            </p>
            <p className="text-blue-200/50 text-xs mt-1">
              A confirmation email will be sent to <span className="text-blue-300 font-medium">{email}</span>
            </p>
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-950/50 border border-red-800/40 rounded-xl px-4 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={back} className="flex-1 py-3 rounded-xl bg-gray-800 text-gray-300 font-bold text-sm active:scale-95 transition-transform">
              ← Back
            </button>
            <button
              type="submit" disabled={loading}
              className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm disabled:opacity-60 active:scale-95 transition-transform"
            >
              {loading ? 'Creating…' : 'Start Training 🚀'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
