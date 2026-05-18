import { cn } from '@/lib/cn';
import { forwardRef, type InputHTMLAttributes } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-xl border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-blue)] focus:ring-2 focus:ring-[var(--color-sky-soft)]',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
