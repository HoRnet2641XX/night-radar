import { motion, type Variants } from 'motion/react';
import type { ReactNode } from 'react';

const ease = [0.22, 1, 0.36, 1] as const;

/** 単語単位のクリップ・リビール。タイトル用。 */
export function WordReveal({ text, delay = 0, className = '' }: { text: string; delay?: number; className?: string }) {
  const words = text.split(' ');
  return (
    <span className={className} style={{ display: 'inline-block' }}>
      {words.map((w, i) => (
        <span key={i} style={{ display: 'inline-block', overflow: 'hidden', paddingBottom: '0.12em', verticalAlign: 'bottom' }}>
          <motion.span
            style={{ display: 'inline-block' }}
            initial={false}
            animate={{ y: '0%' }}
            transition={{ duration: 0.9, ease, delay: delay + i * 0.06 }}
          >
            {w}{i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/** ソフトな上方向フェードイン（ブロック要素向け）。 */
export const softIn: Variants = {
  hidden: { opacity: 0, y: 10, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease } },
};

export function Stagger({ children, delay = 0, gap = 0.06 }: { children: ReactNode; delay?: number; gap?: number }) {
  return (
    <motion.div
      initial={false} animate="show"
      variants={{ show: { transition: { staggerChildren: gap, delayChildren: delay } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <motion.div className={className} variants={softIn}>{children}</motion.div>;
}
