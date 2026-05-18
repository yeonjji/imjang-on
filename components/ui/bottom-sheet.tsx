'use client';

import { Drawer } from 'vaul';
import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: ReactNode;
}

export function BottomSheet({ open, onOpenChange, title, children }: BottomSheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Drawer.Content
          className={cn(
            'fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-white p-6 shadow-[var(--shadow-soft)]',
          )}
        >
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[var(--color-line)]" />
          {title && (
            <Drawer.Title className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">{title}</Drawer.Title>
          )}
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
