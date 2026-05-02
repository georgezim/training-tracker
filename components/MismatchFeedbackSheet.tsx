'use client';

import { useEffect, useState } from 'react';
import { PlannedSession, StravaMatch } from '@/lib/reconcile';

interface Props {
  planned: PlannedSession;
  actual: StravaMatch;
  onSubmit: (tags: string[], notes: string) => void;
  onClose: () => void;
}

const TAG_OPTIONS: { id: string; label: string }[] = [
  { id: 'felt_tired', label: 'Felt tired' },
  { id: 'achilles_pain', label: 'Achilles pain' },
  { id: 'weather', label: 'Weather' },
  { id: 'time_crunch', label: 'Time crunch' },
  { id: 'felt_good_went_longer', label: 'Felt good, went longer' },
  { id: 'changed_plans', label: 'Changed plans' },
  { id: 'equipment_issue', label: 'Equipment issue' },
];

export default function MismatchFeedbackSheet({ planned, actual, onSubmit, onClose }: Props) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggleTag(id: string) {
    setSelectedTags(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  }

  async function handleSubmit() {
    if (selectedTags.length === 0 || loading) return;
    setLoading(true);
    await onSubmit(selectedTags, notes);
    setLoading(false);
  }

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
          <h2 className="text-white text-xl font-bold leading-tight">Your session was different</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-2xl leading-none flex-shrink-0 w-8 h-8 flex items-center justify-center"
            aria-label="Close"
          >×</button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 space-y-5 pb-2">

          {/* Side-by-side comparison */}
          <div className="grid grid-cols-2 gap-3">
            {/* Planned card */}
            <div className="bg-gray-800 rounded-2xl p-3">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">Planned</p>
              <p className="text-white text-sm font-bold">{planned.type.toUpperCase()}</p>
              {planned.distance_km != null && (
                <p className="text-gray-400 text-xs mt-0.5">{planned.distance_km.toFixed(2)} km</p>
              )}
              {planned.duration_min != null && (
                <p className="text-gray-400 text-xs mt-0.5">{planned.duration_min.toFixed(0)} min</p>
              )}
            </div>

            {/* Actual card */}
            <div className="bg-gray-800 rounded-2xl p-3">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">Actual</p>
              <p className="text-white text-sm font-bold">{actual.sport_type}</p>
              <p className="text-gray-400 text-xs mt-0.5">{actual.distance_km.toFixed(2)} km</p>
              <p className="text-gray-400 text-xs mt-0.5">{actual.moving_time_min.toFixed(0)} min</p>
            </div>
          </div>

          {/* Tag chips */}
          <div>
            <p className="text-gray-300 text-xs font-semibold uppercase tracking-widest mb-3">What happened?</p>
            <div className="flex flex-wrap gap-2">
              {TAG_OPTIONS.map(tag => {
                const active = selectedTags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      active
                        ? 'bg-blue-700 text-white border-blue-600'
                        : 'bg-gray-800 text-gray-400 border-gray-700'
                    }`}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes textarea */}
          <div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value.slice(0, 300))}
              placeholder="Anything else? (optional)"
              rows={3}
              className="w-full bg-gray-800 text-white placeholder-gray-500 rounded-2xl px-4 py-3 text-sm resize-none border border-gray-700 focus:outline-none focus:border-blue-600"
            />
            <p className="text-gray-600 text-xs text-right mt-1">{notes.length}/300</p>
          </div>

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={selectedTags.length === 0 || loading}
            className={`w-full py-3.5 rounded-2xl text-sm font-semibold transition-opacity ${
              selectedTags.length === 0 || loading
                ? 'bg-blue-600 text-white opacity-40 cursor-not-allowed'
                : 'bg-blue-600 text-white opacity-100'
            }`}
          >
            {loading ? 'Saving…' : 'Save & get feedback'}
          </button>
        </div>
      </div>
    </>
  );
}
