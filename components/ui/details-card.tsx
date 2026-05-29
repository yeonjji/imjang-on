'use client';
import type { ReactNode } from 'react';

interface Props {
  id?: string;
  title: string;
  /** 닫혀 있을 때 보일 한 줄 요약 (선택) */
  summary?: string;
  /** 모바일에서 기본 펼침 여부 (기본 false: 닫힘) */
  defaultOpenMobile?: boolean;
  children: ReactNode;
}

/**
 * 모바일: <details>로 접힘/펼침 (defaultOpenMobile=false면 닫힌 상태로 시작).
 * 데스크톱(md:): summary 숨기고 본문만 그대로 노출 — 항상 펼쳐 보임.
 */
export function DetailsCard({ id, title, summary, defaultOpenMobile = false, children }: Props) {
  return (
    <details
      id={id}
      open={defaultOpenMobile}
      className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] md:p-7 md:[&]:!open md:open"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 md:cursor-default">
        <h2 className="text-base font-bold text-[var(--color-blue-dark)] md:text-lg">{title}</h2>
        {summary && <span className="truncate text-xs text-[var(--color-muted)] md:hidden">{summary}</span>}
        <span aria-hidden className="text-[var(--color-muted)] transition-transform [details[open]_&]:rotate-180 md:hidden">▾</span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}
