'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { metersToKm, secondsToDuration, mpsToMinPerKm, isRunActivity, isRideActivity, isGymActivity } from '@/lib/strava';
import BottomNav from '@/components/BottomNav';

interface Activity {
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

type Filter = 'all' | 'run' | 'ride' | 'gym';

function sportIcon(sport_type: string) {
  if (isRunActivity(sport_type)) return '🏃';
  if (isRideActivity(sport_type)) return '🚴';
  if (isGymActivity(sport_type)) return '🏋️';
  return '⚡';
}

function sportColor(sport_type: string) {
  if (isRunActivity(sport_type)) return 'text-blue-400 bg-blue-900/30';
  if (isRideActivity(sport_type)) return 'text-orange-400 bg-orange-900/30';
  if (isGymActivity(sport_type)) return 'text-purple-400 bg-purple-900/30';
  return 'text-gray-400 bg-gray-800';
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function SessionsPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  async function loadFromCache() {
    const { data } = await supabase
      .from('strava_activities')
      .select('*')
      .order('activity_date', { ascending: false })
      .limit(500);
    if (data) setActivities(data as Activity[]);
  }

  useEffect(() => {
    async function init() {
      const res = await fetch('/api/strava/status');
      const { connected: isConnected, activityCount } = await res.json();
      setConnected(isConnected);

      if (isConnected && activityCount > 0) {
        await loadFromCache();
      }
      setLoading(false);
    }
    init();
  }, []);

  async function syncNow() {
    setSyncing(true);
    await fetch('/api/strava/activities?full=1');
    await loadFromCache();
    setSyncing(false);
  }

  const filtered = activities.filter((a) => {
    if (filter === 'run') return isRunActivity(a.sport_type);
    if (filter === 'ride') return isRideActivity(a.sport_type);
    if (filter === 'gym') return isGymActivity(a.sport_type);
    return true;
  });

  // Totals
  const totalKm = filtered.filter(a => a.distance_m > 0).reduce((s, a) => s + a.distance_m / 1000, 0);
  const totalTime = filtered.reduce((s, a) => s + a.moving_time_s, 0);

  return (
    <div className="min-h-screen bg-gray-950" style={{ paddingBottom: '5.5rem' }}>
      <header
        className="bg-[#1B2A4A] px-4 pb-5"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 2.5rem)' }}
      >
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between">
            <h1 className="text-white text-xl font-bold">Training Sessions</h1>
            {connected && (
              <button
                onClick={syncNow}
                disabled={syncing}
                className="flex items-center gap-1.5 text-blue-300 text-xs font-medium bg-blue-900/40 px-3 py-1.5 rounded-full active:scale-95 transition-transform disabled:opacity-60"
              >
                {syncing ? (
                  <>
                    <span className="w-3 h-3 border-2 border-blue-300/40 border-t-blue-300 rounded-full animate-spin inline-block" />
                    Syncing…
                  </>
                ) : (
                  <>↻ Sync Strava</>
                )}
              </button>
            )}
          </div>
          {connected === false && !loading && (
            <p className="text-blue-300/70 text-sm mt-1">Go to Home and connect Strava to import your sessions</p>
          )}
          {connected && activities.length === 0 && !loading && (
            <p className="text-blue-300/70 text-sm mt-1">Tap "Sync Strava" to import your full history</p>
          )}
          {connected && activities.length > 0 && (
            <p className="text-green-400/70 text-sm mt-1">✓ Strava connected · {activities.length} activities</p>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-3">
        {/* Filter pills */}
        <div className="flex gap-2">
          {(['all', 'run', 'ride', 'gym'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400'
              }`}
            >
              {f === 'all' ? 'All' : f === 'run' ? '🏃 Runs' : f === 'ride' ? '🚴 Rides' : '🏋️ Gym'}
            </button>
          ))}
        </div>

        {/* Summary bar */}
        {filtered.length > 0 && (
          <div className="bg-gray-900 rounded-xl px-4 py-3 flex gap-6">
            <div>
              <p className="text-gray-500 text-xs">Sessions</p>
              <p className="text-white font-bold">{filtered.length}</p>
            </div>
            {totalKm > 0 && (
              <div>
                <p className="text-gray-500 text-xs">Distance</p>
                <p className="text-white font-bold">{totalKm.toFixed(0)} km</p>
              </div>
            )}
            <div>
              <p className="text-gray-500 text-xs">Time</p>
              <p className="text-white font-bold">{secondsToDuration(totalTime)}</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center py-12 text-gray-600">Loading…</div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">
              {connected ? 'No sessions found. Tap Sync to import from Strava.' : 'Connect Strava on Home tab to see your sessions.'}
            </p>
          </div>
        )}

        {/* Activity list */}
        {filtered.map((a) => {
          const km = parseFloat(metersToKm(a.distance_m));
          const colorCls = sportColor(a.sport_type);
          return (
            <a
              key={a.strava_id}
              href={a.strava_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-gray-900 rounded-xl p-4 active:scale-[0.98] transition-transform"
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${colorCls}`}>
                  {sportIcon(a.sport_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-white text-sm font-semibold truncate">{a.name}</p>
                    <span className="text-gray-500 text-xs flex-shrink-0">{formatDate(a.activity_date)}</span>
                  </div>
                  <div className="flex gap-3 mt-1.5 flex-wrap">
                    {a.distance_m > 0 && (
                      <span className="text-gray-300 text-xs">{km.toFixed(2)} km</span>
                    )}
                    <span className="text-gray-400 text-xs">{secondsToDuration(a.moving_time_s)}</span>
                    {a.distance_m > 0 && a.avg_speed_ms > 0 && (
                      <span className="text-gray-500 text-xs">{mpsToMinPerKm(a.avg_speed_ms)}</span>
                    )}
                    {a.avg_heartrate && (
                      <span className="text-red-400/70 text-xs">{Math.round(a.avg_heartrate)} bpm</span>
                    )}
                    {a.elevation_m > 5 && (
                      <span className="text-gray-500 text-xs">↑{Math.round(a.elevation_m)}m</span>
                    )}
                  </div>
                </div>
              </div>
            </a>
          );
        })}
      </main>

      <BottomNav active="sessions" />
    </div>
  );
}
