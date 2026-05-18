import { cn } from '@/lib/cn';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-[var(--color-blue)] text-white hover:bg-[var(--color-blue-dark)]',
  secondary: 'bg-white text-[var(--color-blue-dark)] border border-[var(--color-line)] hover:bg-[var(--color-soft)]',
  ghost: 'bg-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm font-semibold',
  md: 'px-4 py-2.5 text-sm font-bold',
  lg: 'px-5 py-3 text-base font-bold',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
