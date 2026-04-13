'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const GOALS = [
  { value: 'marathon',      label: 'Run a Marathon' },
  { value: 'half_marathon', label: 'Run a Half Marathon' },
  { value: 'get_fit',       label: 'Get Fit' },
  { value: 'lose_weight',   label: 'Lose Weight' },
];

const LEVELS = [
  { value: 'beginner',     label: 'Beginner', sub: 'New to running' },
  { value: 'intermediate', label: 'Intermediate', sub: 'Run regularly' },
  { value: 'advanced',     label: 'Advanced', sub: 'Racing experience' },
];

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<'account' | 'goals'>('account');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [goal, setGoal] = useState('marathon');
  const [level, setLevel] = useState('intermediate');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step === 'account') { setStep('goals'); return; }

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
      await supabase.from('profiles').upsert({
        id: data.user.id,
        name,
        goal,
        training_level: level,
      });
    }

    router.push('/');
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        </div>
        <h1 className="text-white text-2xl font-bold">Training Tracker</h1>
        <p className="text-gray-500 text-sm mt-1">
          {step === 'account' ? 'Create your account' : 'Tell us about your training'}
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex gap-2 mb-6">
        <div className="flex-1 h-1 rounded-full bg-blue-600" />
        <div className={`flex-1 h-1 rounded-full transition-colors ${step === 'goals' ? 'bg-blue-600' : 'bg-gray-800'}`} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {step === 'account' && (
          <>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="George"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="you@email.com"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="Min 6 characters"
              />
            </div>
          </>
        )}

        {step === 'goals' && (
          <>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-2">What's your main goal?</label>
              <div className="grid grid-cols-2 gap-2">
                {GOALS.map(g => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => setGoal(g.value)}
                    className={`py-3 px-3 rounded-xl text-sm font-medium text-left transition-colors ${
                      goal === g.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-900 text-gray-400 border border-gray-800'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-gray-400 text-xs font-medium block mb-2">Training level</label>
              <div className="space-y-2">
                {LEVELS.map(l => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => setLevel(l.value)}
                    className={`w-full py-3 px-4 rounded-xl text-sm font-medium text-left flex items-center justify-between transition-colors ${
                      level === l.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-900 text-gray-400 border border-gray-800'
                    }`}
                  >
                    <span>{l.label}</span>
                    <span className={`text-xs ${level === l.value ? 'text-blue-200' : 'text-gray-600'}`}>{l.sub}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {error && (
          <p className="text-red-400 text-sm bg-red-950/50 border border-red-800/40 rounded-xl px-4 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm disabled:opacity-60 active:scale-95 transition-transform"
        >
          {loading ? 'Creating account…' : step === 'account' ? 'Continue →' : 'Start Training'}
        </button>
      </form>

      {step === 'account' && (
        <p className="text-center text-gray-500 text-sm mt-6">
          Have an account?{' '}
          <Link href="/login" className="text-blue-400 font-medium">Sign in</Link>
        </p>
      )}
    </div>
  );
}
