'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

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

const effortColors: Record<string, string> = {
  excellent: 'bg-green-500/20 text-green-400 border-green-500/30',
  good: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  fair: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  poor: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export default function WeeklyReportPage() {
  const { weekStart } = useParams<{ weekStart: string }>();
  const router = useRouter();
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/signin'); return; }

      const res = await fetch('/api/weekly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, weekStart }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); } else { setReport(data.report); }
      setLoading(false);
    };
    load().catch(e => { setError(String(e)); setLoading(false); });
  }, [weekStart, router]);

  // Format week display: "Apr 28 – May 4, 2026"
  const formatWeek = (start: string) => {
    const d = new Date(start + 'T00:00:00');
    const end = new Date(d);
    end.setDate(d.getDate() + 6);
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${d.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
  };

  if (loading) return (
    <main className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </main>
  );

  if (error || !report) return (
    <main className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
      <p className="text-gray-400">Could not load report</p>
      <button onClick={() => router.back()} className="text-blue-400 text-sm">← Go back</button>
    </main>
  );

  return (
    <main className="min-h-screen bg-black text-white pb-24">
      {/* Header */}
      <div className="px-4 pt-12 pb-6">
        <button onClick={() => router.back()} className="text-gray-500 text-sm mb-4 flex items-center gap-1">
          ← Back
        </button>
        <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Weekly Report</p>
        <h1 className="text-xl font-bold text-white">{formatWeek(weekStart)}</h1>
      </div>

      {/* Effort badge + headline */}
      <div className="px-4 mb-6">
        <span className={`inline-block text-xs font-semibold px-3 py-1 rounded-full border mb-3 ${effortColors[report.effort_rating] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
          {report.effort_rating.toUpperCase()}
        </span>
        <h2 className="text-lg font-semibold text-white">{report.headline}</h2>
        <p className="text-gray-400 text-sm mt-2 leading-relaxed">{report.summary}</p>
      </div>

      {/* Stats */}
      <div className="flex gap-3 px-4 mb-6">
        <div className="bg-gray-900 rounded-2xl p-4 flex-1 text-center">
          <p className="text-2xl font-bold text-white">{report.total_distance_km.toFixed(1)}</p>
          <p className="text-gray-500 text-xs mt-1">km total</p>
        </div>
        <div className="bg-gray-900 rounded-2xl p-4 flex-1 text-center">
          <p className="text-2xl font-bold text-white">{report.sessions_completed}<span className="text-gray-500 text-lg">/{report.sessions_planned}</span></p>
          <p className="text-gray-500 text-xs mt-1">sessions</p>
        </div>
      </div>

      {/* Highlights */}
      {report.highlights.length > 0 && (
        <div className="px-4 mb-6">
          <h3 className="text-white font-semibold mb-3">✅ Highlights</h3>
          <div className="space-y-2">
            {report.highlights.map((h, i) => (
              <div key={i} className="bg-gray-900 rounded-xl px-4 py-3">
                <p className="text-gray-300 text-sm">{h}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Concerns */}
      {report.concerns.length > 0 && (
        <div className="px-4 mb-6">
          <h3 className="text-white font-semibold mb-3">⚠️ Watch out</h3>
          <div className="space-y-2">
            {report.concerns.map((c, i) => (
              <div key={i} className="bg-gray-900 rounded-xl px-4 py-3">
                <p className="text-gray-300 text-sm">{c}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recovery */}
      <div className="px-4 mb-6">
        <h3 className="text-white font-semibold mb-3">💤 Recovery</h3>
        <div className="bg-gray-900 rounded-xl px-4 py-3">
          <p className="text-gray-300 text-sm">{report.recovery_summary}</p>
        </div>
      </div>

      {/* Goal progress */}
      <div className="px-4 mb-6">
        <h3 className="text-white font-semibold mb-3">🎯 Goal progress</h3>
        <div className="bg-gray-900 rounded-xl px-4 py-3">
          <p className="text-gray-300 text-sm">{report.goal_progress}</p>
        </div>
      </div>

      {/* Next week */}
      <div className="px-4 mb-6">
        <h3 className="text-white font-semibold mb-3">➡️ Next week</h3>
        <div className="bg-gray-900 rounded-xl px-4 py-3">
          <p className="text-gray-300 text-sm">{report.next_week_suggestion}</p>
        </div>
      </div>
    </main>
  );
}
