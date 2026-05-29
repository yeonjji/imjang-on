'use client';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

interface Props {
  id?: string;
  title: string;
  summary?: string;
  defaultOpenMobile?: boolean;
  children: ReactNode;
}

/**
 * Mobile: native <details>로 접힘/펼침 (defaultOpenMobile=false면 닫힘).
 * Desktop(md:): useEffect로 open=true 강제 + summary pointer-events-none → 정적 헤더.
 *
 * CSS-only로 데스크톱 항상 펼침을 만들려는 시도(`md:!block` 등)는 Tailwind 컴파일
 * 우선순위 문제로 작동하지 않았다. JS로 open 속성을 직접 토글하는 게 가장 신뢰성 있음.
 */
export function DetailsCard({ id, title, summary, defaultOpenMobile = false, children }: Props) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const apply = () => {
      if (ref.current) ref.current.open = mq.matches ? true : defaultOpenMobile;
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [defaultOpenMobile]);

  return (
    <details
      ref={ref}
      id={id}
      open={defaultOpenMobile}
      className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] md:p-7"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 md:cursor-default md:pointer-events-none">
        <h2 className="text-base font-bold text-[var(--color-blue-dark)] md:text-lg">{title}</h2>
        {summary && <span className="truncate text-xs text-[var(--color-muted)] md:hidden">{summary}</span>}
        <span aria-hidden className="text-[var(--color-muted)] transition-transform [details[open]_&]:rotate-180 md:hidden">▾</span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}
