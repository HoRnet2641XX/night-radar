import { motion } from 'motion/react';

const ease = [0.22, 1, 0.36, 1] as const;

export function RadarChart({ values, labels, size = 320, color = 'var(--nr-accent)' }: {
  values: number[]; labels: string[]; size?: number; color?: string;
}) {
  const cx = size / 2, cy = size / 2;
  const R = size / 2 - 40;
  const n = values.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const point = (v: number, i: number) => {
    const r = (v / 100) * R;
    return [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r] as const;
  };
  const rings = [0.25, 0.5, 0.75, 1];
  const shape = values.map((v, i) => point(v, i).join(',')).join(' ');
  return (
    <svg width={size} height={size} className="overflow-visible">
      <defs>
        <radialGradient id="radar-fill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.42" />
          <stop offset="100%" stopColor={color} stopOpacity="0.04" />
        </radialGradient>
      </defs>
      {rings.map((f, i) => (
        <motion.circle key={i} cx={cx} cy={cy} r={R * f} fill="none" stroke="rgba(255,255,255,0.06)"
          initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.9, ease, delay: 0.05 + i * 0.08 }}
        />
      ))}
      {values.map((_, i) => {
        const [x, y] = point(100, i);
        return (
          <motion.line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.06)"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease, delay: 0.15 + i * 0.04 }}
          />
        );
      })}
      <motion.polygon
        points={shape}
        fill="url(#radar-fill)" stroke={color} strokeWidth="1.5"
        style={{ filter: `drop-shadow(0 0 12px ${color}90)` }}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.1, ease, delay: 0.5 }}
      />
      {values.map((v, i) => {
        const [x, y] = point(v, i);
        return (
          <motion.circle key={i} cx={x} cy={y} r="3" fill={color}
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
            initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease, delay: 0.85 + i * 0.07 }}
          />
        );
      })}
      {labels.map((l, i) => {
        const [x, y] = point(118, i);
        return (
          <motion.text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fontSize="12" fill="rgba(235,240,255,0.72)"
            style={{ fontFamily: 'var(--font-sans)', letterSpacing: 0 }}
            initial={{ opacity: 0, y: y + 6 }} animate={{ opacity: 1, y }}
            transition={{ duration: 0.7, ease, delay: 1.0 + i * 0.05 }}
          >
            {l}
          </motion.text>
        );
      })}
    </svg>
  );
}
