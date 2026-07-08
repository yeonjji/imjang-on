import Link from 'next/link';
import { FINANCE_ITEMS } from './finance-menu';

interface Props {
  /** 현재 리스트의 정확한 path(쿼리 제외). 예: '/finance', '/jeonse-guarantee' */
  currentHref: string;
}

/**
 * 금융정보 리스트 페이지(서민금융 · 전세보증) 상단의 형제 탭 바.
 * 생활편의 SiblingTabs와 동일한 밑줄식 스타일. 두 항목 모두 상시 노출이라
 * SoonModal·live 분기 없이 Link/span만 렌더한다.
 */
export function FinanceTabs({ currentHref }: Props) {
  return (
    <div
      data-testid="finance-tabs"
      className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-4 shadow-[var(--shadow-soft)]"
    >
      <nav aria-label="금융정보 카테고리" className="flex gap-6 overflow-x-auto overflow-y-hidden">
        {FINANCE_ITEMS.map((item) => {
          const active = item.href === currentHref;
          const base = '-mb-px py-3 text-sm whitespace-nowrap';
          const cls = active
            ? `${base} border-b-2 border-[var(--color-blue)] text-[var(--color-blue-dark)] font-extrabold`
            : `${base} border-b-2 border-transparent text-[var(--color-muted)] font-semibold hover:text-[var(--color-blue-dark)]`;
          if (active) {
            return (
              <span key={item.href} aria-current="page" className={cls}>
                {item.tabLabel}
              </span>
            );
          }
          return (
            <Link key={item.href} href={item.href} className={cls}>
              {item.tabLabel}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
