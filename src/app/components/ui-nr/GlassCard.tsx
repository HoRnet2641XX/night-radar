import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef, type KeyboardEventHandler } from 'react';

type Props = HTMLMotionProps<'div'> & { interactive?: boolean };

export const GlassCard = forwardRef<HTMLDivElement, Props>(function GlassCard(
  { className = '', interactive, children, onKeyDown, role, tabIndex, ...rest }, ref
) {
  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || !interactive) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.currentTarget.click();
    }
  };

  return (
    <motion.div
      ref={ref}
      role={interactive ? role ?? 'button' : role}
      tabIndex={interactive ? tabIndex ?? 0 : tabIndex}
      onKeyDown={handleKeyDown}
      className={`nr-glass ${interactive ? 'nr-glass-hover cursor-pointer' : ''} rounded-2xl ${className}`}
      whileHover={interactive ? { y: -2 } : undefined}
      transition={{ type: 'spring', stiffness: 280, damping: 24 }}
      {...rest}
    >
      {children}
    </motion.div>
  );
});
