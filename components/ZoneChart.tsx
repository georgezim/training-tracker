'use client';

import { ZoneBoundaries } from '@/lib/zones';

interface Props {
  zones: ZoneBoundaries;
}

const ZONE_CONFIG = [
  { label: 'Zone 1', name: 'Recovery', color: 'bg-blue-500', key: 'z1' },
  { label: 'Zone 2', name: 'Aerobic', color: 'bg-green-500', key: 'z2' },
  { label: 'Zone 3', name: 'Tempo', color: 'bg-yellow-500', key: 'z3' },
  { label: 'Zone 4', name: 'Threshold', color: 'bg-orange-500', key: 'z4' },
  { label: 'Zone 5', name: 'VO2max', color: 'bg-red-500', key: 'z5' },
];

export default function ZoneChart({ zones }: Props) {
  const rows = [
    { ...ZONE_CONFIG[0], range: `< ${zones.z1_max} bpm` },
    { ...ZONE_CONFIG[1], range: `${zones.z1_max}–${zones.z2_max} bpm` },
    { ...ZONE_CONFIG[2], range: `${zones.z2_max}–${zones.z3_max} bpm` },
    { ...ZONE_CONFIG[3], range: `${zones.z3_max}–${zones.z4_max} bpm` },
    { ...ZONE_CONFIG[4], range: `≥ ${zones.z5_min} bpm` },
  ];

  return (
    <div className="space-y-2">
      {rows.map(z => (
        <div key={z.key} className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${z.color} flex-shrink-0`} />
          <div className="flex-1 flex items-center justify-between bg-gray-900 rounded-xl px-3 py-2">
            <div>
              <span className="text-white text-xs font-semibold">{z.label}</span>
              <span className="text-gray-500 text-xs ml-2">{z.name}</span>
            </div>
            <span className="text-gray-400 text-xs font-mono">{z.range}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
