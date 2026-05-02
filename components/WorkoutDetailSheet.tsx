'use client';

import { useEffect } from 'react';
import { WorkoutInfo, WorkoutDetail, COLOR_BG, COLOR_TEXT } from '@/lib/training-plan';

interface Props {
  workout: WorkoutInfo;
  detail: WorkoutDetail;
  dateLabel: string;
  onClose: () => void;
  // New optional callbacks for manual actions:
  onMarkDone?: () => void;
  onEditWorkout?: () => void;
  onLogRestDay?: () => void;   // only shown when workout.type === 'rest'
}

export default function WorkoutDetailSheet({ workout, detail, dateLabel, onClose, onMarkDone, onEditWorkout, onLogRestDay }: Props) {
  // Close on backdrop click or Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const colorStrip = COLOR_BG[workout.color] ?? 'bg-gray-700';
  const colorText = COLOR_TEXT[workout.color] ?? 'text-gray-400';

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
        <div className="px-5 pt-2 pb-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-gray-500 text-xs mb-0.5">{dateLabel}</p>
              <h2 className="text-white text-xl font-bold leading-tight">{workout.label}</h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`text-xs font-medium ${colorText}`}>{detail.intensity}</span>
                <span className="text-gray-700">·</span>
                <span className="text-gray-400 text-xs">{detail.duration}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white text-2xl leading-none mt-0.5 flex-shrink-0 w-8 h-8 flex items-center justify-center"
              aria-label="Close"
            >×</button>
          </div>

          {/* Color accent bar */}
          <div className={`mt-3 h-1 rounded-full ${colorStrip} opacity-70`} />
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 space-y-5 pb-2">
          {/* Steps */}
          <div className="space-y-3">
            {detail.steps.map((step, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-9 h-9 rounded-xl bg-gray-800 flex items-center justify-center text-lg flex-shrink-0">
                  {step.icon}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-white text-sm font-semibold leading-tight">{step.title}</p>
                  <p className="text-gray-400 text-sm mt-0.5 leading-relaxed">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Key points */}
          {detail.keyPoints.length > 0 && (
            <div className="bg-gray-800/60 rounded-2xl p-4">
              <p className="text-gray-300 text-xs font-semibold uppercase tracking-widest mb-3">Key Points</p>
              <ul className="space-y-2">
                {detail.keyPoints.map((point, i) => (
                  <li key={i} className="flex gap-2">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${colorStrip}`} />
                    <span className="text-gray-300 text-sm leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          {(onMarkDone || onEditWorkout || onLogRestDay) && (
            <div className="pt-2 pb-1 space-y-2">
              {onMarkDone && workout.type !== 'rest' && (
                <button
                  onClick={() => { onMarkDone(); onClose(); }}
                  className="w-full py-3.5 rounded-2xl font-semibold text-sm text-white bg-green-700 active:scale-95 transition-transform"
                >
                  ✓ Mark as done
                </button>
              )}
              {onEditWorkout && workout.type !== 'rest' && (
                <button
                  onClick={() => { onEditWorkout(); onClose(); }}
                  className="w-full py-3.5 rounded-2xl font-semibold text-sm text-gray-300 bg-gray-800 border border-gray-700 active:scale-95 transition-transform"
                >
                  ✎ Edit what I did
                </button>
              )}
              {onLogRestDay && workout.type === 'rest' && (
                <button
                  onClick={() => { onLogRestDay(); onClose(); }}
                  className="w-full py-3.5 rounded-2xl font-semibold text-sm text-gray-300 bg-gray-800 border border-gray-700 active:scale-95 transition-transform"
                >
                  + Log activity on rest day
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
