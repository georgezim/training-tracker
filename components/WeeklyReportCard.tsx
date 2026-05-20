'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface UpcomingRace {
  name: string;
  date: string;
  distance: string;
  weeks_away: number;
}

interface HistoryEntry {
  weekStart: string;
  distanceKm: number | null;
  sessionsCompleted: number | null;
  sessionsPlanned: number | null;
  effortRating: string | null;
}

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
  nearest_race_name?: string | null;
  nearest_race_date?: string | null;
  nearest_race_weeks?: number | null;
  upcoming_races?: UpcomingRace[];
  history_summary?: HistoryEntry[];
}

interface Props {
  report: WeeklyReport;
  weekStart: string;
  weekEnd?: string;
  avgRecovery?: number | null;
}

const effortBadgeClasses = {
  excellent: 'bg-green-900/60 text-green-400',
  good:      'bg-blue-900/60 text-blue-400',
  fair:      'bg-yellow-900/60 text-yellow-400',
  poor:      'bg-red-900/60 text-red-400',
};

const effortLabel = {
  excellent: 'Excellent week',
  good:      'Good week',
  fair:      'Fair week',
  poor:      'Tough week',
};

export default function WeeklyReportCard({ report, weekStart, weekEnd: _weekEnd, avgRecovery }: Props) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('dromos_report_collapsed') === '1';
  });

  return (
    <div className="bg-gray-900/80 border border-gray-700/50 rounded-2xl overflow-hidden">

      {/* ── Header row (always visible) ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-base">📅</span>
          <span className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Previous week review</span>
        </div>
        <button
          onClick={() => {
            const next = !collapsed;
            setCollapsed(next);
            localStorage.setItem('dromos_report_collapsed', next ? '1' : '0');
          }}
          className="text-gray-600 text-xs font-medium"
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>

      {/* ── Expanded content ── */}
      {!collapsed && (
        <>
          {/* Effort badge + headline */}
          <div className="px-4 pt-3 pb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${effortBadgeClasses[report.effort_rating] ?? effortBadgeClasses.good}`}>
              {effortLabel[report.effort_rating] ?? 'Previous week review'}
            </span>
            <p className="text-white text-sm font-semibold mt-2 leading-snug">{report.headline}</p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 px-4 py-3">
            {[
              { value: `${report.total_distance_km?.toFixed(1) ?? '—'}km`, label: 'distance' },
              { value: `${report.sessions_completed ?? '—'}/${report.sessions_planned ?? '—'}`, label: 'sessions' },
              { value: avgRecovery != null ? `${Math.round(avgRecovery)}%` : '—', label: 'recovery' },
            ].map(({ value, label }) => (
              <div key={label} className="bg-gray-800 rounded-xl px-2 py-2.5 text-center">
                <p className="text-white text-sm font-bold">{value}</p>
                <p className="text-gray-500 text-xs mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Volume trend bars (≥ 2 history entries) */}
          {report.history_summary && report.history_summary.length >= 2 && (() => {
            const bars = [...report.history_summary, {
              weekStart,
              distanceKm: report.total_distance_km,
              sessionsCompleted: report.sessions_completed,
              sessionsPlanned: report.sessions_planned,
              effortRating: report.effort_rating,
            }].slice(-6);

            const maxKm = Math.max(...bars.map(b => b.distanceKm ?? 0), 1);
            const prevKm = report.history_summary[report.history_summary.length - 1]?.distanceKm ?? null;
            const delta = prevKm != null ? report.total_distance_km - prevKm : null;

            return (
              <div className="px-4 pb-3 border-t border-gray-800 pt-3">
                <p className="text-gray-600 text-xs font-semibold uppercase tracking-wider mb-2">
                  Volume — last {bars.length} weeks
                </p>
                <div className="flex items-end gap-1.5 h-9">
                  {bars.map((b, i) => {
                    const isCurrent = i === bars.length - 1;
                    const heightPct = b.distanceKm != null ? Math.max((b.distanceKm / maxKm) * 100, 8) : 8;
                    return (
                      <div key={b.weekStart} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className={`w-full rounded-sm ${isCurrent ? 'bg-blue-500' : 'bg-blue-900/50'}`}
                          style={{ height: `${heightPct}%` }}
                        />
                        <span className={`text-[9px] ${isCurrent ? 'text-blue-400 font-semibold' : 'text-gray-700'}`}>
                          {isCurrent ? 'Now' : `W${i + 1}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {delta != null && (
                  <p className="text-xs text-gray-500 mt-1.5">
                    <span className={delta >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}km
                    </span>
                    {' '}vs last week
                  </p>
                )}
              </div>
            );
          })()}

          {/* Race pipeline (Option A — nearest primary, others secondary) */}
          {report.upcoming_races && report.upcoming_races.length > 0 ? (() => {
            const nearest = report.upcoming_races![0];
            const rest = report.upcoming_races!.slice(1);
            const progressPct = nearest.weeks_away != null
              ? Math.max(0, Math.min(100, Math.round((1 - nearest.weeks_away / 24) * 100)))
              : 0;

            return (
              <div className="px-4 pb-3 border-t border-gray-800 pt-3">
                <p className="text-gray-600 text-xs font-semibold uppercase tracking-wider mb-2">Race pipeline</p>

                <div className="bg-blue-950/40 border border-blue-800/30 rounded-xl p-3 mb-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white text-xs font-semibold">{nearest.name}</span>
                    <span className="text-blue-400 text-xs font-semibold bg-blue-900/50 px-2 py-0.5 rounded-full">
                      {nearest.weeks_away}w away
                    </span>
                  </div>
                  <div className="h-1 bg-gray-800 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${progressPct}%` }} />
                  </div>
                  <p className="text-blue-400/80 text-xs leading-relaxed">{report.goal_progress}</p>
                </div>

                {rest.map(race => (
                  <div key={race.date} className="flex items-center justify-between py-2 border-t border-gray-800/60">
                    <div>
                      <span className="text-gray-400 text-xs font-medium">{race.name}</span>
                      <span className="text-gray-700 text-xs ml-1.5">{race.distance}</span>
                    </div>
                    <span className="text-gray-600 text-xs">{race.weeks_away} weeks</span>
                  </div>
                ))}
              </div>
            );
          })() : report.goal_progress ? (
            <div className="px-4 pb-3 pt-3 border-t border-gray-800">
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Progress</p>
              <p className="text-gray-400 text-sm leading-relaxed">{report.goal_progress}</p>
            </div>
          ) : null}

          {/* View full report */}
          <button
            onClick={() => router.push(`/report/${weekStart}`)}
            className="w-full px-4 py-3 border-t border-gray-800 text-blue-400 text-sm font-medium text-center"
          >
            View full report →
          </button>
        </>
      )}

    </div>
  );
}
