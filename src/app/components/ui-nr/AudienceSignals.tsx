import { CircleHelp, HeartHandshake, Mars, Venus } from 'lucide-react';

export type AudienceCounts = {
  male: number;
  female: number;
  couple: number;
  unknown?: number;
};

export function AudienceSignals({
  counts,
  compact = false,
  includeUnknown = false,
  label = '投稿者区分の内訳',
}: {
  counts: AudienceCounts;
  compact?: boolean;
  includeUnknown?: boolean;
  label?: string;
}) {
  const items = [
    { key: 'male', label: '男性', value: counts.male, icon: Mars },
    { key: 'female', label: '女性', value: counts.female, icon: Venus },
    { key: 'couple', label: 'カップル', value: counts.couple, icon: HeartHandshake },
    ...(includeUnknown
      ? [{ key: 'unknown', label: '未判定', value: counts.unknown ?? 0, icon: CircleHelp }]
      : []),
  ];

  return (
    <div
      className="nr-audience-signals"
      data-compact={compact}
      data-unknown={includeUnknown}
      aria-label={`${label}: ${items.map((item) => `${item.label}${item.value}件`).join('、')}`}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.key} className="nr-audience-signal" data-tone={item.key}>
            <span className="nr-audience-signal-label">
              <i aria-hidden="true"><Icon size={compact ? 12 : 14} strokeWidth={2.2} /></i>
              {item.label}
            </span>
            <strong>{item.value}<small>件</small></strong>
          </div>
        );
      })}
    </div>
  );
}
