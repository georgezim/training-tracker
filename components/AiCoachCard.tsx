'use client';

interface AiCoach {
  title: string;
  description: string;
}

interface Props {
  coach: AiCoach;
  onDismiss: () => void;
}

export default function AiCoachCard({ coach, onDismiss }: Props) {
  return (
    <div className="bg-indigo-950/50 border border-indigo-700/40 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-indigo-400">✦</span>
          <span className="text-indigo-300 text-xs font-semibold uppercase tracking-wide">AI Coach</span>
        </div>
        <button onClick={onDismiss} className="text-indigo-600 hover:text-indigo-400 text-xl leading-none">×</button>
      </div>
      <p className="text-white text-sm font-semibold leading-tight">{coach.title}</p>
      <p className="text-indigo-200/80 text-sm mt-1 leading-relaxed">{coach.description}</p>
    </div>
  );
}
