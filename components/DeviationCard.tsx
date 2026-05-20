'use client';

import { FeedbackInline } from '@/components/StravaActivityCard';

export interface DeviationCardProps {
  variant: 'rest_day' | 'mismatch';
  // Activity identity
  activityName: string;
  source: 'strava' | 'manual';
  stravaId?: number;
  activityTimeLabel?: string;
  // Metrics
  distanceKm?: number;
  durationMin?: number;
  avgHr?: number;
  perceivedEffort?: 'easy' | 'moderate' | 'hard';
  // Planned vs actual pills
  plannedLabel: string;
  actualLabel: string;
  // Coach feedback
  feedback?: FeedbackInline | null;
  feedbackLoading?: boolean;
}

const EFFORT_BADGE: Record<string, { label: string; cls: string }> = {
  too_easy: { label: 'Effort: too easy', cls: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700/40' },
  right:    { label: 'Effort: right',    cls: 'bg-green-900/40 text-green-300 border border-green-700/40' },
  too_hard: { label: 'Effort: too hard', cls: 'bg-red-900/40 text-red-300 border border-red-700/40' },
};

export default function DeviationCard({
  variant,
  activityName,
  source,
  activityTimeLabel,
  distanceKm,
  durationMin,
  avgHr,
  perceivedEffort,
  plannedLabel,
  actualLabel,
  feedback,
  feedbackLoading,
}: DeviationCardProps) {
  const isRestDay = variant === 'rest_day';

  const border      = isRestDay ? 'border-orange-700/40'  : 'border-yellow-700/40';
  const bg          = isRestDay ? 'bg-orange-950/20'       : 'bg-yellow-950/10';
  const divider     = isRestDay ? 'border-orange-800/20'   : 'border-yellow-800/20';
  const headerBorder = isRestDay ? 'border-orange-800/30'  : 'border-yellow-800/30';
  const headerIconBg = isRestDay ? 'bg-orange-900/60'      : 'bg-yellow-900/60';
  const statusText  = isRestDay ? 'text-orange-300'        : 'text-yellow-400';
  const statusLabel = isRestDay ? 'Rest day — you trained anyway' : 'Different from plan';
  const emoji       = isRestDay ? '💪' : '⚡';
  const actualPillCls = isRestDay
    ? 'bg-orange-900/50 text-orange-300'
    : 'bg-yellow-900/50 text-yellow-300';

  const sourceLabel = activityTimeLabel
    ? `${source === 'strava' ? 'Strava' : 'Manual'} · ${activityTimeLabel}`
    : source === 'strava' ? 'Strava' : 'Manual entry';

  // Build up to 3 stats
  const stats: { label: string; value: string }[] = [];
  if (distanceKm != null) stats.push({ label: 'Distance', value: `${distanceKm.toFixed(1)}km` });
  if (durationMin != null) stats.push({ label: 'Time', value: `${Math.round(durationMin)}min` });
  if (avgHr != null) {
    stats.push({ label: 'Avg HR', value: `${Math.round(avgHr)}bpm` });
  } else if (perceivedEffort != null) {
    const effortLabels = { easy: 'Easy', moderate: 'Moderate', hard: 'Hard' };
    stats.push({ label: 'Effort', value: effortLabels[perceivedEffort] });
  }
  while (stats.length < 3) stats.push({ label: '', value: '' });
  const displayStats = stats.slice(0, 3);

  const effortBadge = feedback ? (EFFORT_BADGE[feedback.effort_rating] ?? EFFORT_BADGE.right) : null;

  return (
    <div className={`rounded-2xl overflow-hidden border ${border} ${bg}`}>

      {/* ── Header ── */}
      <div className={`px-4 py-3 flex items-center gap-3 border-b ${headerBorder}`}>
        <div className={`w-10 h-10 rounded-full ${headerIconBg} flex items-center justify-center text-xl flex-shrink-0`}>
          {emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`${statusText} text-xs font-semibold uppercase tracking-widest`}>{statusLabel}</p>
          <p className="text-white font-bold text-base leading-tight mt-0.5 truncate">{activityName}</p>
          <p className="text-gray-500 text-xs mt-0.5">{sourceLabel}</p>
        </div>
        {source === 'strava' && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#FC4C02" className="flex-shrink-0">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
          </svg>
        )}
      </div>

      {/* ── Stats grid ── */}
      {displayStats.some(s => s.value) && (
        <div className={`grid grid-cols-3 border-b ${divider}`}>
          {displayStats.map((s, i) => (
            <div key={i} className={`px-4 py-2.5 ${i < 2 ? `border-r ${divider}` : ''}`}>
              {s.value && (
                <>
                  <p className="text-gray-500 text-xs mb-0.5">{s.label}</p>
                  <p className="text-white text-sm font-bold">{s.value}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Planned → actual pill ── */}
      <div className={`px-4 py-2.5 border-b ${divider} flex items-center gap-2 flex-wrap`}>
        <span className="text-gray-600 text-xs">Planned:</span>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
          {plannedLabel}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${actualPillCls}`}>
          {actualLabel}
        </span>
      </div>

      {/* ── Coach feedback ── */}
      <div className="px-4 py-3">
        <p className="text-blue-400 text-xs font-semibold mb-1.5">Coach feedback</p>
        {feedbackLoading && !feedback && (
          <p className="text-gray-500 text-xs italic">Analysing your session…</p>
        )}
        {feedback && (
          <>
            <p className="text-gray-300 text-sm leading-relaxed">{feedback.summary}</p>
            {feedback.tip && (
              <p className="text-gray-500 text-xs mt-1.5 leading-relaxed">{feedback.tip}</p>
            )}
            {effortBadge && (
              <span className={`inline-block mt-2 text-xs font-medium px-2.5 py-1 rounded-full ${effortBadge.cls}`}>
                {effortBadge.label}
              </span>
            )}
          </>
        )}
        {!feedbackLoading && !feedback && (
          <p className="text-gray-600 text-xs italic">Feedback will appear once your session is analysed.</p>
        )}
      </div>

    </div>
  );
}
