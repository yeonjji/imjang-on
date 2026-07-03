export interface Pager {
  /** 연속된 페이지 번호 윈도우 (최대 windowSize개) */
  pages: number[];
  /** 윈도우에 1페이지가 없을 때 "처음" 버튼 노출 */
  first: boolean;
  /** "-10" 버튼 타깃 (없으면 null) */
  prev10: number | null;
  /** "+10" 버튼 타깃 (없으면 null) */
  next10: number | null;
  /** "마지막" 버튼 타깃 (없으면 null) */
  last: number | null;
}

export function buildPager(current: number, total: number, windowSize = 5): Pager {
  const size = Math.min(windowSize, total);
  let startPage = Math.max(1, current - Math.floor(size / 2));
  const endPage = Math.min(total, startPage + size - 1);
  startPage = Math.max(1, endPage - size + 1);
  const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

  const hasQuickJump = total > windowSize;
  const hasForward = hasQuickJump && current < total;

  return {
    pages,
    first: pages[0] > 1,
    prev10: current > 11 ? Math.max(1, current - 10) : null,
    next10: hasForward ? Math.min(total, current + 10) : null,
    last: hasForward ? total : null,
  };
}

export interface PageResult<T> {
  pageItems: T[];
  total: number;
  totalPages: number;
  safePage: number;
}

/** 배열을 page 단위로 자른다. page는 [1, totalPages]로 클램프(safePage). */
export function paginate<T>(items: T[], page: number, perPage: number): PageResult<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const raw = Number.isFinite(page) ? Math.floor(page) : 1;
  const safePage = Math.min(Math.max(1, raw), totalPages);
  const startIdx = (safePage - 1) * perPage;
  return { pageItems: items.slice(startIdx, startIdx + perPage), total, totalPages, safePage };
}

/** location.search에서 page를 읽는다. 정수 ≥1만 유효, 나머지는 1. */
export function parsePageParam(search: string): number {
  const raw = new URLSearchParams(search).get('page');
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
