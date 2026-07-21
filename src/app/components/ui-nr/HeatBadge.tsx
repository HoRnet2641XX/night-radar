import { heatLabelForRank } from '@/lib/heat-labels';

export function HeatBadge({ rank, large = false }: { rank: number; large?: boolean }) {
  const heat = heatLabelForRank(rank);

  if (!heat) return null;

  return (
    <span
      className="nr-heat-label"
      data-level={heat.key}
      data-size={large ? 'large' : 'default'}
      title={heat.description}
      aria-label={`来店の熱さ: ${heat.label}`}
    >
      <span aria-hidden="true">{heat.emoji}</span>
      <strong>{heat.label}</strong>
    </span>
  );
}
