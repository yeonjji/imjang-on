import { cn } from '@/lib/cn';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, active = false, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={active}
      className={cn(
        'rounded-full px-3 py-1.5 text-sm font-semibold transition',
        active
          ? 'bg-[var(--color-blue)] text-white'
          : 'bg-white text-[var(--color-muted)] border border-[var(--color-line)] hover:text-[var(--color-text)]',
        className,
      )}
      {...props}
    />
  ),
);
Chip.displayName = 'Chip';
