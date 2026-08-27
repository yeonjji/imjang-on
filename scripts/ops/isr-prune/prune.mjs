// ISR 캐시 축출 — 컨테이너 안에서 node로 직접 실행된다(tsx 없음, 의존성 0).
// 설계: docs/superpowers/specs/2026-08-27-isr-cache-eviction-design.md

/**
 * 어떤 페이지를 지울지 정한다. 파일시스템을 건드리지 않는 순수 함수라 테스트가 쉽다.
 *
 * 정렬 기준은 atime이지만 루트가 relatime 마운트라 사실상 '생성 후 첫 접근'이고,
 * 엄밀한 LRU가 아니라 FIFO에 가깝다(설계 문서 §2.3). 목표가 핫 페이지 보호가 아니라
 * 총량 상한이므로 그대로 채택한다.
 */
export function planEviction({ pages, protectedBytes, maxBytes }) {
  // atime 동률에서 순서가 흔들리면 재실행 결과가 달라져 검증이 불가능해진다. key로 고정한다.
  const ordered = [...pages].sort((a, b) => a.atimeMs - b.atimeMs || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  let remaining = protectedBytes + pages.reduce((sum, p) => sum + p.bytes, 0);
  const deleteKeys = [];
  let freed = 0;

  for (const page of ordered) {
    if (remaining <= maxBytes) break;
    deleteKeys.push(page.key);
    freed += page.bytes;
    remaining -= page.bytes;
  }

  return { deleteKeys, freedBytes: freed, remainingBytes: remaining };
}
