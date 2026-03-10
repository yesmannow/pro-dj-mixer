'use client';

import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring, type MotionProps } from 'framer-motion';
import { clsx } from 'clsx';

interface MagneticButtonProps extends Omit<React.ComponentProps<typeof motion.button>, 'ref'>, MotionProps {
  strength?: number;
}

export function MagneticButton({ strength = 60, className, children, ...props }: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 240, damping: 18, mass: 0.5 });
  const springY = useSpring(y, { stiffness: 240, damping: 18, mass: 0.5 });

  const handlePointerMove = (event: React.PointerEvent) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < strength) {
      x.set((dx / strength) * 12);
      y.set((dy / strength) * 12);
    } else {
      x.set(0);
      y.set(0);
    }
  };

  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      ref={ref}
      style={{ x: springX, y: springY }}
      className={clsx('relative overflow-hidden transition-transform will-change-transform', className)}
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
      {...props}
    >
      {children}
    </motion.button>
  );
}
