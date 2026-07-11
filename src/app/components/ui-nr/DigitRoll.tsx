import { motion } from 'motion/react';

const ease = [0.22, 1, 0.36, 1] as const;

/** 桁ごとにクリップして上方向へ差し上がる数値表示。 */
export function DigitRoll({ value, prefix = '', suffix = '', delay = 0, className = '' }: {
  value: number | string; prefix?: string; suffix?: string; delay?: number; className?: string;
}) {
  const s = typeof value === 'number' ? value.toLocaleString() : value;
  const chars = (prefix + s + suffix).split('');
  return (
    <span className={`nr-mono ${className}`} style={{ display: 'inline-flex' }}>
      {chars.map((c, i) => (
        <span key={i} style={{ display: 'inline-block', overflow: 'hidden', height: '1em', lineHeight: 1 }}>
          <motion.span
            style={{ display: 'inline-block' }}
            initial={{ y: '110%' }}
            animate={{ y: '0%' }}
            transition={{ duration: 0.7, ease, delay: delay + i * 0.05 }}
          >
            {c === ' ' ? ' ' : c}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
