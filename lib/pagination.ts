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
