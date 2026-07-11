import { Activity } from 'lucide-react';

export function Ticker({ items }: { items: { name: string; signal: number; area: string }[] }) {
  const visible = items.filter((item) => item.signal > 0).slice(0, 8);
  if (!visible.length) return null;
  const doubled = [...visible, ...visible];
  return (
    <div aria-hidden="true" className="relative overflow-hidden py-2.5 nr-marquee-mask" style={{
      borderTop: '1px solid var(--nr-border)',
      borderBottom: '1px solid var(--nr-border)',
    }}>
      <div className="nr-marquee-track">
        {doubled.map((it, i) => {
          return (
            <div key={`${it.name}-${i}`} className="flex items-center gap-3 text-[11px] whitespace-nowrap nr-mono">
              <span style={{ color: 'var(--nr-text-low)' }}>{it.area}</span>
              <span style={{ color: 'var(--nr-text-hi)' }}>{it.name}</span>
              <span className="flex items-center gap-1" style={{ color: it.signal > 0 ? 'var(--nr-accent-soft)' : 'var(--nr-text-low)' }}>
                <Activity size={10} />女性・初回・複数 {it.signal}件
              </span>
              <span style={{ color: 'var(--nr-border-hi)' }}>—</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
