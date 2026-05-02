'use client';

import { useRouter } from 'next/navigation';

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

interface Props {
  report: WeeklyReport;
  weekStart: string; // YYYY-MM-DD
  avgRecovery?: number | null;
  onDismiss: () => void;
}

const effortColors: Record<string, string> = {
  excellent: 'text-green-400',
  good: 'text-blue-400',
  fair: 'text-yellow-400',
  poor: 'text-red-400',
};

export default function WeeklyReportCard({ report, weekStart, avgRecovery, onDismiss }: Props) {
  const router = useRouter();

  return (
    <div className="mx-4 mb-4 bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">📅</span>
          <span className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Week in review</span>
        </div>
        <button onClick={onDismiss} className="text-gray-600 hover:text-gray-400 text-xl leading-none">×</button>
      </div>

      {/* Headline */}
      <div className="px-4 pb-3">
        <p className={`text-sm font-semibold ${effortColors[report.effort_rating] ?? 'text-white'}`}>{report.headline}</p>
      </div>

      {/* Stats row */}
      <div className="flex gap-2 px-4 pb-3">
        <div className="bg-gray-800 rounded-xl px-3 py-2 flex-1 text-center">
          <p className="text-white text-sm font-bold">{report.total_distance_km.toFixed(1)}km</p>
          <p className="text-gray-500 text-xs">distance</p>
        </div>
        <div className="bg-gray-800 rounded-xl px-3 py-2 flex-1 text-center">
          <p className="text-white text-sm font-bold">{report.sessions_completed}/{report.sessions_planned}</p>
          <p className="text-gray-500 text-xs">sessions</p>
        </div>
        {avgRecovery != null && (
          <div className="bg-gray-800 rounded-xl px-3 py-2 flex-1 text-center">
            <p className="text-white text-sm font-bold">{Math.round(avgRecovery)}%</p>
            <p className="text-gray-500 text-xs">recovery</p>
          </div>
        )}
      </div>

      {/* Tap to view */}
      <button
        onClick={() => router.push(`/report/${weekStart}`)}
        className="w-full px-4 py-3 border-t border-gray-800 text-blue-400 text-sm font-medium text-center hover:bg-gray-800 transition-colors"
      >
        View full report →
      </button>
    </div>
  );
}
