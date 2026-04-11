'use client';

import { useEffect, useState } from 'react';
import { supabase, CompletedSession } from '@/lib/supabase';
import {
  getWorkoutForDate,
  getDaysInCurrentWeek,
  getWeekNumber,
  getPhase,
  PHASE_NAMES,
  dateToString,
  COLOR_BG,
  COLOR_TEXT,
} from '@/lib/training-plan';
import BottomNav from '@/components/BottomNav';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WeekPage() {
  const today = new Date();
  const todayStr = dateToString(today);
  const days = getDaysInCurrentWeek(today);
  const week = getWeekNumber(today);
  const phase = getPhase(week);

  const [sessions, setSessions] = useState<CompletedSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (days.length === 0) return;
    const startStr = dateToString(days[0]);
    const endStr = dateToString(days[6]);
    supabase
      .from('completed_sessions')
      .select('*')
      .gte('date', startStr)
      .lte('date', endStr)
      .then(({ data }) => {
        if (data) setSessions(data as CompletedSession[]);
        setLoading(false);
      });
  }, [todayStr]);

  return (
    <div className="min-h-screen bg-gray-950" style={{ paddingBottom: '5.5rem' }}>
      {/* ── Header ── */}
      <header
        className="bg-[#1B2A4A] px-4 pb-5"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 2.5rem)' }}
      >
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between">
            <h1 className="text-white text-xl font-bold">This Week</h1>
            {week > 0 && week <= 31 && (
              <span className="text-blue-300 text-xs font-medium bg-blue-900/40 px-2 py-1 rounded-full">
                W{week} / 31
              </span>
            )}
          </div>
          {week > 0 && week <= 31 && (
            <p className="text-blue-300/80 text-sm mt-0.5">{PHASE_NAMES[phase]}</p>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-2">
        {/* Legend */}
        <div className="flex gap-3 px-1 pb-1 overflow-x-auto scrollbar-hide">
          {[
            { color: 'blue',   label: 'Run' },
            { color: 'purple', label: 'Gym' },
            { color: 'orange', label: 'Bike' },
            { color: 'gray',   label: 'Rest' },
            { color: 'red',    label: 'Race' },
          ].map(({ color, label }) => (
            <div key={color} className="flex items-center gap-1.5 flex-shrink-0">
              <span className={`w-2.5 h-2.5 rounded-full ${COLOR_BG[color]}`} />
              <span className="text-gray-500 text-xs">{label}</span>
            </div>
          ))}
        </div>

        {days.map((day, i) => {
          const dayStr = dateToString(day);
          const workout = getWorkoutForDate(day);
          const isToday = dayStr === todayStr;
          const isPast = day.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
          const completed = sessions.some(
            (s) => s.date === dayStr && s.session_type === workout.type
          );
          const colorStrip = COLOR_BG[workout.color] ?? 'bg-gray-700';
          const colorText = COLOR_TEXT[workout.color] ?? 'text-gray-500';

          return (
            <div
              key={dayStr}
              className={`rounded-xl p-4 flex items-center gap-3 transition-all ${
                isToday
                  ? 'bg-gray-800 ring-1 ring-white/20'
                  : 'bg-gray-900'
              }`}
            >
              {/* Day label */}
              <div className="w-10 flex-shrink-0 text-center">
                <p className={`text-xs font-semibold ${isToday ? 'text-white' : 'text-gray-500'}`}>
                  {DAY_NAMES[i]}
                </p>
                <p className={`text-base font-bold leading-tight ${isToday ? 'text-white' : 'text-gray-400'}`}>
                  {day.getDate()}
                </p>
              </div>

              {/* Color strip */}
              <div className={`w-1 self-stretch rounded-full opacity-80 flex-shrink-0 ${colorStrip}`} />

              {/* Workout info */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${isToday ? 'text-white' : 'text-gray-100'}`}>
                  {workout.label}
                </p>
                <p className={`text-xs truncate mt-0.5 ${colorText}`}>
                  {workout.description.length > 55
                    ? workout.description.slice(0, 55) + '…'
                    : workout.description}
                </p>
              </div>

              {/* Status indicator */}
              <div className="flex-shrink-0 flex flex-col items-center gap-1">
                {workout.type !== 'rest' && (
                  <div
                    className={`w-3 h-3 rounded-full border ${
                      completed
                        ? 'bg-green-500 border-green-400'
                        : isPast
                        ? 'bg-gray-700 border-gray-600'
                        : 'bg-transparent border-gray-600'
                    }`}
                  />
                )}
                {isToday && (
                  <span className="text-blue-400 text-xs font-bold">NOW</span>
                )}
              </div>
            </div>
          );
        })}

        {/* Weekly summary */}
        {!loading && (
          <div className="bg-gray-900 rounded-xl p-4 mt-2">
            <div className="flex items-center justify-between">
              <p className="text-gray-400 text-sm">Sessions completed</p>
              <p className="text-white font-bold text-sm">
                {sessions.length} /{' '}
                {days.filter((d) => getWorkoutForDate(d).type !== 'rest').length}
              </p>
            </div>
          </div>
        )}
      </main>

      <BottomNav active="week" />
    </div>
  );
}
