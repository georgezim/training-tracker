'use client';

import { metersToKm, secondsToDuration, mpsToMinPerKm } from '@/lib/strava';

interface CachedActivity {
  strava_id: number;
  activity_date: string;
  name: string;
  sport_type: string;
  distance_m: number;
  moving_time_s: number;
  elevation_m: number;
  avg_heartrate?: number;
  max_heartrate?: number;
  avg_speed_ms: number;
  strava_url: string;
}

interface Props {
  activity: CachedActivity;
  plannedKm?: number; // for comparison
}

export default function StravaActivityCard({ activity, plannedKm }: Props) {
  const km = parseFloat(metersToKm(activity.distance_m));
  const diff = plannedKm ? km - plannedKm : null;
  const diffStr = diff !== null
    ? (diff >= 0 ? `+${diff.toFixed(1)}km` : `${diff.toFixed(1)}km`)
    : null;
  const diffColor = diff === null ? '' : diff >= -1 ? 'text-green-400' : 'text-yellow-400';

  return (
    <div className="bg-[#FC4C021A] border border-[#FC4C02]/30 rounded-2xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* Strava orange flame */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#FC4C02">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
          </svg>
          <span className="text-[#FC4C02] text-xs font-bold uppercase tracking-wide">Strava</span>
        </div>
        <a
          href={activity.strava_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 text-xs hover:text-gray-300 transition-colors"
        >
          View →
        </a>
      </div>

      <p className="text-white text-sm font-semibold mb-3 leading-tight">{activity.name}</p>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-gray-900/60 rounded-xl px-3 py-2">
          <p className="text-gray-500 text-xs leading-none mb-1">Distance</p>
          <p className="text-white text-sm font-bold leading-none">{km.toFixed(2)}km</p>
          {diffStr && (
            <p className={`text-xs mt-0.5 font-medium ${diffColor}`}>{diffStr}</p>
          )}
        </div>

        <div className="bg-gray-900/60 rounded-xl px-3 py-2">
          <p className="text-gray-500 text-xs leading-none mb-1">Time</p>
          <p className="text-white text-sm font-bold leading-none">{secondsToDuration(activity.moving_time_s)}</p>
        </div>

        <div className="bg-gray-900/60 rounded-xl px-3 py-2">
          <p className="text-gray-500 text-xs leading-none mb-1">Pace</p>
          <p className="text-white text-sm font-bold leading-none">{mpsToMinPerKm(activity.avg_speed_ms)}</p>
        </div>

        {activity.avg_heartrate && (
          <div className="bg-gray-900/60 rounded-xl px-3 py-2">
            <p className="text-gray-500 text-xs leading-none mb-1">Avg HR</p>
            <p className="text-white text-sm font-bold leading-none">{Math.round(activity.avg_heartrate)} bpm</p>
          </div>
        )}

        {activity.max_heartrate && (
          <div className="bg-gray-900/60 rounded-xl px-3 py-2">
            <p className="text-gray-500 text-xs leading-none mb-1">Max HR</p>
            <p className="text-white text-sm font-bold leading-none">{Math.round(activity.max_heartrate)} bpm</p>
          </div>
        )}

        {activity.elevation_m > 0 && (
          <div className="bg-gray-900/60 rounded-xl px-3 py-2">
            <p className="text-gray-500 text-xs leading-none mb-1">Elevation</p>
            <p className="text-white text-sm font-bold leading-none">{Math.round(activity.elevation_m)}m</p>
          </div>
        )}
      </div>
    </div>
  );
}
