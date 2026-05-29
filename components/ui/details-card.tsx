'use client';
import type { ReactNode } from 'react';

interface Props {
  id?: string;
  title: string;
  summary?: string;
  defaultOpenMobile?: boolean;
  children: ReactNode;
}

/**
 * Mobile: native <details>로 접힘/펼침 (defaultOpenMobile=false면 닫힘).
 * Desktop(md:): summary는 제목만 보이는 정적 헤더가 되고, 본문 div는 항상 표시.
 *   - md:[&>div]:!block: 본문 div를 항상 display:block (open 상태와 무관)
 *   - md:[&>summary]:pointer-events-none: 클릭으로 토글되는 동작 차단
 *   - md:[&>summary]:cursor-default: 호버 시 손가락 커서 제거
 *   - 셰브론은 md:hidden으로 숨김
 */
export function DetailsCard({ id, title, summary, defaultOpenMobile = false, children }: Props) {
  return (
    <details
      id={id}
      open={defaultOpenMobile}
      className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] md:p-7"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 md:cursor-default md:pointer-events-none">
        <h2 className="text-base font-bold text-[var(--color-blue-dark)] md:text-lg">{title}</h2>
        {summary && <span className="truncate text-xs text-[var(--color-muted)] md:hidden">{summary}</span>}
        <span aria-hidden className="text-[var(--color-muted)] transition-transform [details[open]_&]:rotate-180 md:hidden">▾</span>
      </summary>
      <div className="mt-4 md:!block hidden [details[open]_&]:block">{children}</div>
    </details>
  );
}
