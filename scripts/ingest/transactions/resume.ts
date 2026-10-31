import type { Mode } from '@/scripts/ingest/types';

// 서버는 UTC로 동작. 오늘 0시(KST)에 해당하는 UTC 시각을 구한다.
// KST = UTC+9 이므로, KST 날짜의 자정은 UTC로는 그 전날 15:00.
export function kstMidnightUtc(now: Date): Date {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600 * 1000);
}

// daily: 오늘(KST) 완료분만 doneKeys 대상으로 조회 → 같은 날 패스끼리만 resume.
//        날짜가 바뀌면 어제 완료분은 제외되어 전체 재처리(self-heal).
// recheck: 최근 windowDays일 안에 완료한 범위를 건너뛴다. 매일 --limit만큼 돌려 주기(7일·30일) 안에 전체를 한 번 훑는다.
// backfill: 제한 없음(누적 완료분 전체 스킵).
export function doneRunFilter(mode: Mode, now: Date, windowDays = 7): { finishedAt?: { gte: Date } } {
  if (mode === 'backfill') return {};
  if (mode === 'recheck') return { finishedAt: { gte: new Date(now.getTime() - windowDays * 86_400_000) } };
  return { finishedAt: { gte: kstMidnightUtc(now) } };
}

export function buildDoneKeys(doneRuns: Array<{ source: string; targetKey: string }>): Set<string> {
  return new Set(doneRuns.map((r) => `${r.source}:${r.targetKey}`));
}
