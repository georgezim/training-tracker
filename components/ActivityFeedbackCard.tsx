'use client';

interface Props {
  feedback: {
    summary: string;
    effort_rating: 'too_easy' | 'right' | 'too_hard';
    achilles_flag: boolean;
    tip: string;
  };
  onDismiss: () => void;
}

export default function ActivityFeedbackCard({ feedback, onDismiss }: Props) {
  const effortConfig = {
    too_easy: {
      label: 'Effort: Too easy',
      badgeClass: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700/40',
    },
    right: {
      label: 'Effort: Just right',
      badgeClass: 'bg-green-900/40 text-green-300 border border-green-700/40',
    },
    too_hard: {
      label: 'Effort: Too hard',
      badgeClass: 'bg-red-900/40 text-red-300 border border-red-700/40',
    },
  };

  const effortData = effortConfig[feedback.effort_rating];

  return (
    <div className="bg-gray-900 border border-gray-700/60 rounded-2xl p-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* Gemini sparkle icon */}
          <span className="text-blue-400 text-lg">✦</span>
          <span className="text-white font-semibold text-sm">Coach feedback</span>
        </div>
        <button
          onClick={onDismiss}
          className="text-gray-500 text-xl hover:text-gray-400 transition-colors"
          aria-label="Dismiss feedback"
        >
          ×
        </button>
      </div>

      {/* Summary text */}
      <p className="text-gray-300 text-sm leading-relaxed mt-3">
        {feedback.summary}
      </p>

      {/* Effort badge */}
      <div className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full mt-3 ${effortData.badgeClass}`}>
        {effortData.label}
      </div>

      {/* Achilles warning banner */}
      {feedback.achilles_flag && (
        <div className="bg-orange-950/60 border border-orange-700/40 rounded-xl px-3 py-2 mt-3">
          <p className="text-orange-300 text-xs font-semibold">
            ⚠️ Achilles load flag — monitor recovery tonight
          </p>
        </div>
      )}

      {/* Tip section */}
      <div className="bg-gray-800/60 rounded-xl px-3 py-2.5 mt-3">
        <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">Next time</p>
        <p className="text-gray-300 text-sm">{feedback.tip}</p>
      </div>
    </div>
  );
}
