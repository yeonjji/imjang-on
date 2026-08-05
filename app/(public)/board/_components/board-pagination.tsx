import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buildPager } from '@/lib/pagination';

/**
 * 게시판 목록 페이지네이션. components/ui/pagination과 같은 모양이지만 서버 컴포넌트라
 * 이동이 <button>+router.push가 아니라 <a>다 — 크롤러가 2페이지 이후를 따라갈 수 있고
 * JS 없이도 동작한다. 번호 창 계산은 공용 buildPager를 그대로 쓴다(끝단에서 반대쪽으로
 * 늘려주므로 1페이지에서도 창 크기만큼 번호가 나온다).
 *
 * 공용 컴포넌트의 모바일 '페이지 직접입력'은 클라이언트 상태가 필요해 여기선 제외.
 */
interface Props {
  current: number;
  totalPages: number;
  totalItems: number;
  perPage: number;
  hrefFor: (page: number) => string;
}

const STEP_BASE = 'flex h-11 items-center gap-1 rounded-xl border px-4 text-sm font-bold';
const STEP_ON = 'border-[var(--color-blue)] text-[var(--color-blue)] hover:bg-[var(--color-soft)]';
const STEP_OFF = 'border-[var(--color-line)] text-[var(--color-muted)] opacity-50';
const JUMP =
  'flex h-11 items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-3 text-xs font-semibold text-[var(--color-muted)] hover:bg-white';

export function BoardPagination({ current, totalPages, totalItems, perPage, hrefFor }: Props) {
  if (totalPages <= 1) return null;

  const pager = buildPager(current, totalPages);
  const start = (current - 1) * perPage + 1;
  const end = Math.min(current * perPage, totalItems);

  const prevLabel = (
    <>
      <ChevronLeft size={16} /> 이전
    </>
  );
  const nextLabel = (
    <>
      다음 <ChevronRight size={16} />
    </>
  );

  return (
    <nav className="py-3" aria-label="페이지네이션">
      <p className="mb-3 text-center text-xs text-[var(--color-muted)]">
        {totalItems.toLocaleString('ko-KR')}건 중{' '}
        <span className="font-semibold text-[var(--color-blue-dark)]">
          {start.toLocaleString('ko-KR')}–{end.toLocaleString('ko-KR')}
        </span>{' '}
        표시중
      </p>

      {/* 모바일: 이전 / 현재-전체 / 다음 */}
      <div className="flex w-full items-center justify-between gap-2 md:hidden">
        <Step href={current > 1 ? hrefFor(current - 1) : undefined} label="이전 페이지">
          {prevLabel}
        </Step>
        <span className="text-sm font-bold text-[var(--color-blue-dark)]">
          {current.toLocaleString('ko-KR')} / {totalPages.toLocaleString('ko-KR')}
        </span>
        <Step href={current < totalPages ? hrefFor(current + 1) : undefined} label="다음 페이지">
          {nextLabel}
        </Step>
      </div>

      {/* 데스크톱 */}
      <div className="hidden flex-wrap items-center justify-center gap-2 md:flex">
        {pager.first && (
          <Link href={hrefFor(1)} aria-label="처음 페이지로" className={JUMP}>
            ⟪ 처음
          </Link>
        )}
        {pager.prev10 != null && (
          <Link href={hrefFor(pager.prev10)} aria-label="10페이지 뒤로" className={JUMP}>
            ⟪ -10
          </Link>
        )}

        <Step href={current > 1 ? hrefFor(current - 1) : undefined} label="이전 페이지">
          {prevLabel}
        </Step>

        {pager.pages.map((p) => (
          <Link
            key={p}
            href={hrefFor(p)}
            aria-current={p === current ? 'page' : undefined}
            className={`flex h-11 min-w-[44px] items-center justify-center rounded-xl px-2 text-sm font-bold ${
              p === current
                ? 'bg-[var(--color-blue)] text-white'
                : 'text-[var(--color-muted)] hover:bg-[var(--color-soft)]'
            }`}
          >
            {p}
          </Link>
        ))}

        <Step href={current < totalPages ? hrefFor(current + 1) : undefined} label="다음 페이지">
          {nextLabel}
        </Step>

        {(pager.next10 != null || pager.last != null) && (
          <span className="mx-1 h-6 w-px bg-[var(--color-line)]" aria-hidden />
        )}
        {pager.next10 != null && (
          <Link href={hrefFor(pager.next10)} aria-label="10페이지 앞으로" className={JUMP}>
            +10 ⟫
          </Link>
        )}
        {pager.last != null && (
          <Link href={hrefFor(pager.last)} aria-label="마지막 페이지로" className={JUMP}>
            마지막 {totalPages.toLocaleString('ko-KR')} ⟫
          </Link>
        )}
      </div>
    </nav>
  );
}

/** href가 없으면(갈 곳 없음) 링크 대신 비활성 span — 자리는 지키되 크롤러가 따라가지 않는다. */
function Step({
  href,
  label,
  children,
}: {
  href?: string;
  label: string;
  children: React.ReactNode;
}) {
  if (!href) {
    return (
      <span aria-disabled="true" className={`${STEP_BASE} ${STEP_OFF}`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={`${STEP_BASE} ${STEP_ON}`}>
      {children}
    </Link>
  );
}
