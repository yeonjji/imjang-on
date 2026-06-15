import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';

/** 에러 페이지 공통 바로가기(실거래가·청약·생활정보). 404·500이 공유 */
export const ERROR_QUICK_LINKS = [
  { label: '실거래가', href: '/list' },
  { label: '청약', href: '/subscription' },
  { label: '생활정보', href: '/life' },
];

interface ErrorStateProps {
  /** "404" | "500" 등 조용한 라벨 배지. 생략 가능 */
  code?: string;
  title: string;
  description: string;
  /** 장식용 아이콘(라인 SVG). aria-hidden 처리됨 */
  icon?: ReactNode;
  /** 버튼/링크 등 액션. 페이지마다 주입 */
  actions: ReactNode;
  /** 주요 섹션 바로가기. 있을 때만 보조 링크 줄로 표기 */
  links?: ReadonlyArray<{ label: string; href: string }>;
  /** error.digest 등 지원용 식별자. 있을 때만 표기 */
  digest?: string;
}

export function ErrorState({ code, title, description, icon, actions, links, digest }: ErrorStateProps) {
  return (
    <main className="grid min-h-[70vh] place-items-center px-6 py-16">
      <Card className="w-full max-w-md px-8 py-10 text-center">
        {icon && (
          <div
            aria-hidden
            className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-[var(--color-sky-soft)] text-[var(--color-blue)]"
          >
            {icon}
          </div>
        )}
        {code && (
          <p className="mb-2 text-xs font-bold tracking-wide text-[var(--color-muted)]">{code}</p>
        )}
        <h1 className="text-2xl font-black text-[var(--color-blue-dark)]">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">{description}</p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {actions}
        </div>
        {links && links.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="inline-flex items-center justify-center rounded-full border border-[var(--color-line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-blue-dark)] transition hover:bg-[var(--color-soft)]"
              >
                {l.label}
              </Link>
            ))}
          </div>
        )}
        {digest && (
          <p className="mt-6 text-[11px] text-[var(--color-muted)]">오류 코드: {digest}</p>
        )}
      </Card>
    </main>
  );
}
