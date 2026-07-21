import { CircleHelp, HeartHandshake, Mars, Venus } from 'lucide-react';
import { summarizeAudience, type AudienceCounts } from '../data/audience';

export type { AudienceCounts } from '../data/audience';

export function AudienceSignals({
  counts,
  compact = false,
  includeUnknown = false,
  total,
  showFemaleRate = false,
  label = '投稿者区分の内訳',
}: {
  counts: AudienceCounts;
  compact?: boolean;
  includeUnknown?: boolean;
  total?: number;
  showFemaleRate?: boolean;
  label?: string;
}) {
  const summary = summarizeAudience(counts, total);
  const items = [
    { key: 'male', label: '男性', value: summary.counts.male, icon: Mars },
    { key: 'female', label: '女性', value: summary.counts.female, icon: Venus },
    { key: 'couple', label: 'カップル', value: summary.counts.couple, icon: HeartHandshake },
    ...(includeUnknown
      ? [{ key: 'unknown', label: '未判定', value: summary.counts.unknown, icon: CircleHelp }]
      : []),
  ];

  const ariaSummary = showFemaleRate
    ? `、全${summary.total}件に占める女性率${summary.femaleRate}%`
    : '';

  return (
    <div
      className="nr-audience-signals"
      data-compact={compact}
      data-unknown={includeUnknown}
      data-has-summary={total !== undefined}
      data-consistent={summary.isConsistent}
      aria-label={`${label}: ${items.map((item) => `${item.label}${item.value}件`).join('、')}${ariaSummary}`}
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
      {total !== undefined && (
        <div className="nr-audience-summary">
          <span>
            区分判定
            <strong>{summary.classified}<small> / {summary.total}件</small></strong>
          </span>
          {showFemaleRate && (
            <span data-tone="female-rate">
              <i aria-hidden="true">💗</i>
              女性率
              <strong>{summary.femaleRate}%</strong>
              <small>全投稿基準</small>
            </span>
          )}
          {!summary.isConsistent && <em>区分集計を確認中</em>}
        </div>
      )}
    </div>
  );
}
