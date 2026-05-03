'use client';

import { metersToKm, mpsToMinPerKm } from '@/lib/strava';
import type { CachedActivity } from '@/lib/useStravaActivity';

export interface FeedbackInline {
  summary: string;
  effort_rating: 'too_easy' | 'right' | 'too_hard';
  injury_flag: boolean;
  tip: string;
}

interface Props {
  activity: CachedActivity;
  feedback?: FeedbackInline | null;
  plannedKm?: number;
}

function getSport(type: string) {
  if (/run|jog/i.test(type))              return { emoji: '🏃', bg: 'bg-blue-900/70',   badge: 'bg-blue-900/60 text-blue-300',     label: 'Run'  };
  if (/ride|cycling|bike/i.test(type))    return { emoji: '🚴', bg: 'bg-orange-900/70', badge: 'bg-orange-900/60 text-orange-300', label: 'Ride' };
  if (/swim/i.test(type))                 return { emoji: '🏊', bg: 'bg-teal-900/70',   badge: 'bg-teal-900/60 text-teal-300',     label: 'Swim' };
  if (/weight|gym|crossfit|workout|strength/i.test(type))
                                          return { emoji: '🏋️', bg: 'bg-purple-900/70', badge: 'bg-purple-900/60 text-purple-300', label: 'Gym'  };
  return                                         { emoji: '⚡', bg: 'bg-gray-800',       badge: 'bg-gray-800 text-gray-400',        label: type   };
}

const effortMap = {
  too_easy: { label: 'Effort: too easy', cls: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700/40' },
  right:    { label: 'Effort: right',    cls: 'bg-green-900/40 text-green-300 border border-green-700/40'   },
  too_hard: { label: 'Effort: too hard', cls: 'bg-red-900/40 text-red-300 border border-red-700/40'         },
};

export default function StravaActivityCard({ activity, feedback, plannedKm }: Props) {
  const sport   = getSport(activity.sport_type);
  const km      = parseFloat(metersToKm(activity.distance_m));
  const mins    = Math.round(activity.moving_time_s / 60);
  const timeStr = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}min` : `${mins}min`;
  const diff    = plannedKm != null ? km - plannedKm : null;
  const diffStr = diff != null ? (diff >= 0 ? `+${diff.toFixed(1)}km` : `${diff.toFixed(1)}km`) : null;
  const effort  = feedback ? (effortMap[feedback.effort_rating] ?? effortMap.right) : null;

  return (
    <div className="bg-gray-900/80 border border-gray-700/50 rounded-2xl overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${sport.bg}`}>
          {sport.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-white font-semibold text-sm leading-tight truncate">{activity.name}</p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${sport.badge}`}>
              {sport.label}
            </span>
          </div>
          <p className="text-gray-500 text-xs mt-0.5">
            {activity.start_time ? `${activity.start_time} · ` : ''}Strava
            {diffStr && (
              <span className={diff != null && diff >= -1 && diff <= 1 ? ' text-green-400' : ' text-yellow-400'}>
                {' · '}{diffStr}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 border-t border-gray-800/80">
        <div className="px-4 py-2.5 border-r border-gray-800/80">
          <p className="text-gray-500 text-xs mb-0.5">Distance</p>
          <p className="text-white text-sm font-bold">{km.toFixed(1)}km</p>
        </div>
        <div className="px-4 py-2.5 border-r border-gray-800/80">
          <p className="text-gray-500 text-xs mb-0.5">Time</p>
          <p className="text-white text-sm font-bold">{timeStr}</p>
        </div>
        <div className="px-4 py-2.5">
          <p className="text-gray-500 text-xs mb-0.5">
            {activity.avg_heartrate ? 'Avg HR' : 'Pace'}
          </p>
          <p className="text-white text-sm font-bold">
            {activity.avg_heartrate
              ? `${Math.round(activity.avg_heartrate)}bpm`
              : mpsToMinPerKm(activity.avg_speed_ms)}
          </p>
        </div>
      </div>

      {/* ── Inline coach feedback ── */}
      {feedback && effort && (
        <div className="px-4 py-3 border-t border-gray-800/80">
          <p className="text-blue-400 text-xs font-semibold mb-1.5">Coach feedback</p>
          <p className="text-gray-300 text-sm leading-relaxed">{feedback.summary}</p>
          <span className={`inline-block mt-2 text-xs font-medium px-2.5 py-1 rounded-full ${effort.cls}`}>
            {effort.label}
          </span>
          {feedback.injury_flag && (
            <div className="mt-2 bg-orange-950/60 border border-orange-700/40 rounded-xl px-3 py-2">
              <p className="text-orange-300 text-xs font-semibold">⚠️ High injury load — monitor recovery tonight</p>
            </div>
          )}
        </div>
      )}

      {/* ── Strava footer link ── */}
      <div className="border-t border-gray-800/80">
        <a
          href={activity.strava_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between px-4 py-2"
        >
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#FC4C02">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
            </svg>
            <span className="text-[#FC4C02] text-xs font-semibold uppercase tracking-wide">Strava</span>
          </div>
          <span className="text-gray-600 text-xs">View →</span>
        </a>
      </div>

    </div>
  );
}
