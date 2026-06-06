import type { NoticeWithUnits, ExistingNotice } from './types';

// notice.contentHash 와 DB 기존 contentHash 를 비교해 신규/변경분만 골라낸다.
// 각 item.notice.contentHash 는 호출 전에 채워져 있어야 한다.
export function diffByHash(
  items: NoticeWithUnits[],
  existing: Map<string, ExistingNotice>,
): { changed: NoticeWithUnits[]; skipped: number } {
  const changed: NoticeWithUnits[] = [];
  let skipped = 0;
  for (const item of items) {
    const prev = existing.get(item.notice.sourceKey);
    if (prev && prev.contentHash != null && prev.contentHash === item.notice.contentHash) {
      skipped++;
    } else {
      changed.push(item);
    }
  }
  return { changed, skipped };
}
