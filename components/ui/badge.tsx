import { cn } from '@/lib/cn';
import type { HTMLAttributes } from 'react';

type Tone = 'blue' | 'green' | 'orange' | 'red' | 'gray';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

const toneClasses: Record<Tone, string> = {
  blue: 'bg-[var(--color-sky-soft)] text-[var(--color-blue-dark)]',
  green: 'bg-emerald-50 text-emerald-700',
  orange: 'bg-orange-50 text-orange-700',
  red: 'bg-red-50 text-red-700',
  gray: 'bg-slate-100 text-slate-700',
};

export function Badge({ className, tone = 'gray', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}

export function dealTypeTone(dealType: 'SALE' | 'JEONSE' | 'WOLSE'): Tone {
  return dealType === 'SALE' ? 'blue' : dealType === 'JEONSE' ? 'green' : 'orange';
}

export function dealTypeLabel(dealType: 'SALE' | 'JEONSE' | 'WOLSE'): string {
  return dealType === 'SALE' ? '매매' : dealType === 'JEONSE' ? '전세' : '월세';
}
