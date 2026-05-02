'use client';

interface ZoneTest {
  id: string;
  test_type: 'maf' | 'threshold' | 'cooper';
  test_date: string;
  distance_m?: number;
  avg_heartrate?: number;
  avg_pace_ms?: number;
  lthr?: number;
  estimated_vo2max?: number;
  zones?: import('@/lib/zones').ZoneBoundaries;
  notes?: string;
}

interface Props {
  test: ZoneTest;
  previous?: ZoneTest | null;
}

const TYPE_LABELS: Record<string, string> = {
  maf: 'MAF Test',
  threshold: 'Threshold Test',
  cooper: 'Cooper Test',
};

function mpsToMinPerKm(mps: number): string {
  const secPerKm = 1000 / mps;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${sec.toString().padStart(2, '0')}/km`;
}

export default function ZoneTestCard({ test, previous }: Props) {
  const date = new Date(test.test_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-white font-semibold text-sm">{TYPE_LABELS[test.test_type]}</p>
          <p className="text-gray-500 text-xs mt-0.5">{date}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {test.avg_heartrate && (
          <div className="bg-gray-800 rounded-xl px-3 py-2">
            <p className="text-gray-500 text-xs mb-1">Avg HR</p>
            <p className="text-white text-sm font-bold">{Math.round(test.avg_heartrate)} bpm</p>
          </div>
        )}
        {test.avg_pace_ms && (
          <div className="bg-gray-800 rounded-xl px-3 py-2">
            <p className="text-gray-500 text-xs mb-1">Avg Pace</p>
            <p className="text-white text-sm font-bold">{mpsToMinPerKm(test.avg_pace_ms)}</p>
            {previous?.avg_pace_ms && (() => {
              const diff = test.avg_pace_ms! - previous.avg_pace_ms!;
              const faster = diff < 0;
              return <p className={`text-xs mt-0.5 ${faster ? 'text-green-400' : 'text-red-400'}`}>{faster ? '▲' : '▼'} {Math.abs(diff * 1000 / test.avg_pace_ms! / previous.avg_pace_ms!).toFixed(0)}s/km</p>;
            })()}
          </div>
        )}
        {test.lthr && (
          <div className="bg-gray-800 rounded-xl px-3 py-2">
            <p className="text-gray-500 text-xs mb-1">LTHR</p>
            <p className="text-white text-sm font-bold">{Math.round(test.lthr)} bpm</p>
          </div>
        )}
        {test.estimated_vo2max != null && (
          <div className="bg-gray-800 rounded-xl px-3 py-2">
            <p className="text-gray-500 text-xs mb-1">VO2max est.</p>
            <p className="text-white text-sm font-bold">{test.estimated_vo2max}</p>
            {previous?.estimated_vo2max != null && (
              <p className={`text-xs mt-0.5 ${test.estimated_vo2max > previous.estimated_vo2max ? 'text-green-400' : 'text-red-400'}`}>
                {test.estimated_vo2max > previous.estimated_vo2max ? '+' : ''}{(test.estimated_vo2max - previous.estimated_vo2max).toFixed(1)}
              </p>
            )}
          </div>
        )}
        {test.distance_m && (
          <div className="bg-gray-800 rounded-xl px-3 py-2">
            <p className="text-gray-500 text-xs mb-1">Distance</p>
            <p className="text-white text-sm font-bold">{(test.distance_m / 1000).toFixed(2)}km</p>
          </div>
        )}
      </div>

      {test.notes && (
        <p className="text-gray-500 text-xs mt-3 leading-relaxed">{test.notes}</p>
      )}
    </div>
  );
}
