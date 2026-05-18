'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

export interface DropdownItem {
  label: string;
  href?: string;
  onSelect?: () => void;
  icon?: ReactNode;
}

export function Dropdown({
  label,
  items,
  align = 'start',
}: {
  label: ReactNode;
  items: DropdownItem[];
  align?: 'start' | 'end' | 'center';
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)]">
        {label}
        <ChevronDown size={14} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={8}
          className={cn(
            'z-50 min-w-[180px] rounded-2xl bg-white p-1.5 shadow-[var(--shadow-soft)]',
            'border border-[var(--color-line)]',
          )}
        >
          {items.map((item, i) => (
            <DropdownMenu.Item
              key={i}
              onSelect={item.onSelect}
              asChild={!!item.href}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none hover:bg-[var(--color-soft)]"
            >
              {item.href ? (
                <a href={item.href}>
                  {item.icon}
                  {item.label}
                </a>
              ) : (
                <span>
                  {item.icon}
                  {item.label}
                </span>
              )}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
