'use client';

import { Drawer } from 'vaul';
import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function BottomSheet({ open, onOpenChange, title, children, footer }: BottomSheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Drawer.Content
          className={cn(
            'fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-white shadow-[var(--shadow-soft)]',
            'max-h-[85vh] flex flex-col',
          )}
        >
          <div className="mx-auto mt-3 mb-2 h-1.5 w-12 shrink-0 rounded-full bg-[var(--color-line)]" />
          {title && (
            <Drawer.Title className="shrink-0 px-6 pb-3 text-lg font-bold text-[var(--color-blue-dark)]">
              {title}
            </Drawer.Title>
          )}
          <div className="flex-1 overflow-y-auto px-6 pb-4">
            {children}
          </div>
          {footer && (
            <div className="shrink-0 border-t border-[var(--color-line)] px-6 py-4">
              {footer}
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
