import { useId } from 'react';

export function Sparkline({ data, w = 120, h = 32, color = 'var(--nr-accent)' }: {
  data: number[]; w?: number; h?: number; color?: string;
}) {
  const reactId = useId();
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  const areaPts = `0,${h} ${pts} ${w},${h}`;
  const id = `sp-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-auto w-full max-w-full overflow-visible"
      style={{ maxWidth: w }}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPts} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${color}70)` }} />
    </svg>
  );
}
