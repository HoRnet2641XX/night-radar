import { useEffect, useState } from 'react';

export function CountUp({ to, duration = 900, prefix = '', suffix = '', decimals = 0 }: {
  to: number; duration?: number; prefix?: string; suffix?: string; decimals?: number;
}) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  const fmt = decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString();
  return <span className="nr-num">{prefix}{fmt}{suffix}</span>;
}
