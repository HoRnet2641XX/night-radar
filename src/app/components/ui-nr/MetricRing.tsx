export function MetricRing({ value, max = 100, label, sub, valueSuffix = '', size = 64, color = 'var(--nr-accent)' }: {
  value: number; max?: number; label: string; sub?: string; valueSuffix?: string; size?: number; color?: string;
}) {
  const p = Math.max(0, Math.min(100, (value / max) * 100));
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const dash = (p / 100) * c;
  return (
    <div className="flex items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="4" fill="none" />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            stroke={color} strokeWidth="4" fill="none" strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            style={{ filter: `drop-shadow(0 0 6px ${color}80)`, transition: 'stroke-dasharray .8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="nr-num text-[15px]" style={{ color: 'var(--nr-text-hi)' }}>{value}{valueSuffix}</span>
        </div>
      </div>
      <div className="flex flex-col">
        <span className="text-[12px]" style={{ color: 'var(--nr-text-mid)' }}>{label}</span>
        {sub && <span className="text-[12px]" style={{ color: 'var(--nr-text-mid)' }}>{sub}</span>}
      </div>
    </div>
  );
}
