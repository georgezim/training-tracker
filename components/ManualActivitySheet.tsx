'use client';

import { useEffect, useState } from 'react';
import { PlannedSession } from '@/lib/reconcile';

export interface ManualActivityData {
  type: string;           // 'run', 'bike', 'gym', 'swim', 'other'
  distance_km?: number;
  duration_min?: number;
  perceived_effort: 'easy' | 'moderate' | 'hard';
  notes?: string;
}

interface Props {
  mode: 'mark_done' | 'edit' | 'rest_day_log';
  planned?: PlannedSession;
  onSubmit: (data: ManualActivityData) => void;
  onClose: () => void;
}

const ACTIVITY_TYPES = [
  { value: 'run', label: 'Run 🏃' },
  { value: 'bike', label: 'Bike 🚴' },
  { value: 'gym', label: 'Gym 💪' },
  { value: 'swim', label: 'Swim 🏊' },
  { value: 'other', label: 'Other ⚡' },
];

const EFFORT_OPTIONS: { value: 'easy' | 'moderate' | 'hard'; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'hard', label: 'Hard' },
];

export default function ManualActivitySheet({ mode, planned, onSubmit, onClose }: Props) {
  const [activityType, setActivityType] = useState<string>(
    planned?.type && planned.type !== 'rest' ? planned.type : 'run'
  );
  const [distanceKm, setDistanceKm] = useState<string>(
    planned?.distance_km != null ? String(planned.distance_km) : ''
  );
  const [durationMin, setDurationMin] = useState<string>(
    planned?.duration_min != null ? String(planned.duration_min) : ''
  );
  const [effort, setEffort] = useState<'easy' | 'moderate' | 'hard'>('moderate');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleSubmit() {
    const data: ManualActivityData = {
      type: activityType,
      perceived_effort: effort,
    };
    const dist = parseFloat(distanceKm);
    if (!isNaN(dist) && dist > 0) data.distance_km = dist;
    const dur = parseFloat(durationMin);
    if (!isNaN(dur) && dur > 0) data.duration_min = dur;
    if (notes.trim()) data.notes = notes.trim();
    onSubmit(data);
  }

  const header =
    mode === 'mark_done'
      ? 'Mark as completed'
      : mode === 'edit'
      ? 'Edit your session'
      : 'Log unplanned activity';

  const submitLabel =
    mode === 'mark_done'
      ? 'Mark as done ✓'
      : mode === 'edit'
      ? 'Save session'
      : 'Log activity';

  const showActivityType = mode === 'edit' || mode === 'rest_day_log';
  const showDistanceDuration = mode === 'edit' || mode === 'rest_day_log';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 rounded-t-3xl max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-700" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-4 flex-shrink-0 flex items-center justify-between">
          <h2 className="text-white text-xl font-bold">{header}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 space-y-5 pb-4">

          {/* Planned workout summary (mark_done only) */}
          {mode === 'mark_done' && planned && (
            <div className="bg-gray-800 rounded-2xl p-4">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-1">
                Planned workout
              </p>
              <p className="text-white text-sm font-medium">{planned.description}</p>
              {(planned.distance_km != null || planned.duration_min != null) && (
                <div className="flex gap-3 mt-2">
                  {planned.distance_km != null && (
                    <span className="text-gray-400 text-xs">{planned.distance_km} km</span>
                  )}
                  {planned.duration_min != null && (
                    <span className="text-gray-400 text-xs">{planned.duration_min} min</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Activity type selector */}
          {showActivityType && (
            <div>
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">
                Activity type
              </p>
              <div className="flex flex-wrap gap-2">
                {ACTIVITY_TYPES.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setActivityType(value)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      activityType === value
                        ? 'bg-blue-700 text-white border-blue-600'
                        : 'bg-gray-800 text-gray-400 border-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Distance + Duration */}
          {showDistanceDuration && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-gray-400 text-xs font-semibold uppercase tracking-widest block mb-1.5">
                  Distance (km)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  placeholder="Optional"
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-xl px-3 py-2.5 text-sm border border-gray-700 outline-none focus:border-blue-600 placeholder:text-gray-600"
                />
              </div>
              <div className="flex-1">
                <label className="text-gray-400 text-xs font-semibold uppercase tracking-widest block mb-1.5">
                  Duration (min)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  placeholder="Optional"
                  value={durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-xl px-3 py-2.5 text-sm border border-gray-700 outline-none focus:border-blue-600 placeholder:text-gray-600"
                />
              </div>
            </div>
          )}

          {/* Perceived effort */}
          <div>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">
              Perceived effort
            </p>
            <div className="flex gap-2">
              {EFFORT_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setEffort(value)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    effort === value
                      ? 'bg-blue-700 text-white border-blue-600'
                      : 'bg-gray-800 text-gray-400 border-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-gray-400 text-xs font-semibold uppercase tracking-widest block mb-1.5">
              Notes (optional)
            </label>
            <textarea
              rows={3}
              placeholder="How did it go?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-xl px-3 py-2.5 text-sm border border-gray-700 outline-none focus:border-blue-600 placeholder:text-gray-600 resize-none"
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            className="bg-blue-600 text-white w-full py-4 rounded-2xl font-bold text-base hover:bg-blue-500 transition-colors"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </>
  );
}
