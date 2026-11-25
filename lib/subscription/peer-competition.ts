import { cache } from 'react';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { buildResultsView } from '@/lib/insights/subscription-results';
import { GONE_SUBSCRIPTION_IDS } from '@/lib/subscription/gone-ids';
import { exclusiveAreaOf, isNewbuildEligible } from '@/lib/subscription/newbuild-compare';

/**
 * 청약 공고별 "같은 가격대 공고 경쟁률"(2026-11-25 시안 승인).
 * 같은 시도에서 이 공고 전 24개월 안의 APT 분양주택 공고 중 ㎡당 분양가가 ±20% 안인 공고의
 * 1순위 해당지역 경쟁률(상세 '청약 결과' 요약과 같은 값)을 모은다. 경쟁률은 지역 영향이 커서 시도로 묶는다.
 * 비교 공고가 5건 미만이면 저장하지 않는다(박스 숨김). 야간 ETL이 DashboardSnapshot `sub_cmp_<id>`에 둔다.
 */
export const PEER_KEY_PREFIX = 'sub_cmp_';
const keyFor = (id: bigint | string) => `${PEER_KEY_PREFIX}${id}`;

export const PEER_PRICE_BAND = 0.2;
export const PEER_MONTHS = 24;
export const MIN_PEERS = 5;
const TOP_N = 5;

export interface PeerNotice {
  id: string;
  name: string;
  sido: string;
  date: Date;
  /** 전용 ㎡당 분양가(만원) — 주택형별 최고 분양가 ÷ 전용면적의 중간값 */
  ppa: number;
  /** 1순위 해당지역 경쟁률. 결과 없음·해당지역 일부 배정 공고는 null */
  rate: number | null;
}

export interface PeerCompetitionSnapshot {
  sido: string;
  lo: number;
  hi: number;
  n: number;
  med: number;
  own: number | null;
  top: { id: string; name: string; ym: string; ppa: number; rate: number }[];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/** 조합원 취소분은 몇 세대만 다시 내놓는 공고라 경쟁률 성격이 달라 비교 대상에서 뺀다. */
export const isCancelResale = (name: string) => /취소분/.test(name);

export function noticePpa(units: { houseType: string | null; topAmount: number | null }[]): number | null {
  const xs: number[] = [];
  for (const u of units) {
    const sqm = exclusiveAreaOf(u.houseType);
    if (sqm != null && u.topAmount && u.topAmount > 0) xs.push(u.topAmount / sqm);
  }
  return xs.length ? median(xs) : null;
}

/** 상세 '청약 결과' 요약의 1순위 해당지역 경쟁률. 해당지역 일부 배정 공고는 요약이 null이라 여기서도 null. */
export function overallRate(competition: unknown, scores: unknown, special: unknown): number | null {
  const v = buildResultsView('APT', competition, scores, special);
  if (!v || v.kind !== 'apt' || v.summary.overall == null) return null;
  const n = Number(v.summary.overall);
  return Number.isFinite(n) ? n : null;
}

const ym = (d: Date) => {
  const k = new Date(d.getTime() + 9 * 3_600_000);
  return `${k.getUTCFullYear()}.${String(k.getUTCMonth() + 1).padStart(2, '0')}`;
};

export function computePeers(target: PeerNotice, all: PeerNotice[]): PeerCompetitionSnapshot | null {
  const from = new Date(target.date);
  from.setUTCMonth(from.getUTCMonth() - PEER_MONTHS);
  const lo = target.ppa * (1 - PEER_PRICE_BAND);
  const hi = target.ppa * (1 + PEER_PRICE_BAND);
  const peers = all.filter(
    (p): p is PeerNotice & { rate: number } =>
      p.id !== target.id &&
      p.sido === target.sido &&
      p.rate != null &&
      !isCancelResale(p.name) &&
      p.date < target.date &&
      p.date >= from &&
      p.ppa >= lo &&
      p.ppa <= hi,
  );
  if (peers.length < MIN_PEERS) return null;
  const top = [...peers]
    .sort((a, b) => Math.abs(a.ppa - target.ppa) - Math.abs(b.ppa - target.ppa))
    .slice(0, TOP_N)
    .map((p) => ({ id: p.id, name: p.name, ym: ym(p.date), ppa: round(p.ppa, 1), rate: p.rate }));
  return {
    sido: target.sido,
    lo: round(lo, 1),
    hi: round(hi, 1),
    n: peers.length,
    med: round(median(peers.map((p) => p.rate)), 2),
    own: target.rate,
    top,
  };
}

/** 비교 대상 공고 전체(APT 분양주택, 시도·㎡당 분양가가 있는 것)와 각 공고의 1순위 해당지역 경쟁률. */
export async function loadPeerNotices(): Promise<{ all: PeerNotice[]; eligible: number }> {
  const notices = (await prisma.subscriptionNotice.findMany({
    where: { category: 'APT', noticeDate: { not: null } },
    // 이 모델엔 `constructor` 컬럼이 있어 select 리터럴이 Object.prototype.constructor와 충돌한다(newbuild-compare.ts와 같은 캐스트).
    select: { id: true, name: true, category: true, rawJson: true, noticeDate: true } as Prisma.SubscriptionNoticeSelect,
  })) as unknown as Array<{ id: bigint; name: string; category: string; rawJson: unknown; noticeDate: Date }>;
  const eligible = notices.filter((n) => isNewbuildEligible(n) && !GONE_SUBSCRIPTION_IDS.has(String(n.id)));
  const ids = eligible.map((n) => n.id);

  const units = await prisma.subscriptionUnit.findMany({
    where: { noticeId: { in: ids } },
    select: { noticeId: true, houseType: true, topAmount: true },
  });
  const unitsBy = new Map<string, { houseType: string | null; topAmount: number | null }[]>();
  for (const u of units) {
    const k = String(u.noticeId);
    (unitsBy.get(k) ?? unitsBy.set(k, []).get(k)!).push(u);
  }
  const results = await prisma.subscriptionResult.findMany({
    where: { noticeId: { in: ids }, status: 'ok' },
    select: { noticeId: true, competition: true, scores: true, special: true },
  });
  const rateBy = new Map(results.map((r) => [String(r.noticeId), overallRate(r.competition, r.scores, r.special)]));

  const all: PeerNotice[] = [];
  for (const n of eligible) {
    const raw = n.rawJson && typeof n.rawJson === 'object' ? (n.rawJson as Record<string, unknown>) : {};
    const sido = typeof raw.SUBSCRPT_AREA_CODE_NM === 'string' ? raw.SUBSCRPT_AREA_CODE_NM.trim() : '';
    const ppa = noticePpa(unitsBy.get(String(n.id)) ?? []);
    if (!sido || ppa == null) continue;
    all.push({ id: String(n.id), name: n.name, sido, date: n.noticeDate, ppa, rate: rateBy.get(String(n.id)) ?? null });
  }
  return { all, eligible: eligible.length };
}

/** ETL: 대상 공고 전체를 다시 계산해 쓰고, 기준 미달로 빠진 공고의 옛 키는 지운다. 저장한 공고 수를 돌려준다. */
export async function refreshPeerCompetitionSnapshots(): Promise<{ written: number; eligible: number }> {
  const { all, eligible } = await loadPeerNotices();
  const snaps: [string, PeerCompetitionSnapshot][] = [];
  for (const t of all) {
    const s = computePeers(t, all);
    if (s) snaps.push([keyFor(t.id), s]);
  }
  if (snaps.length === 0) return { written: 0, eligible };
  for (let i = 0; i < snaps.length; i += 50) {
    await prisma.$transaction(
      snaps.slice(i, i + 50).map(([key, s]) => {
        const payload = s as unknown as Prisma.InputJsonValue;
        return prisma.dashboardSnapshot.upsert({ where: { key }, create: { key, payload }, update: { payload } });
      }),
    );
  }
  await prisma.dashboardSnapshot.deleteMany({
    where: { key: { startsWith: PEER_KEY_PREFIX, notIn: snaps.map(([k]) => k) } },
  });
  return { written: snaps.length, eligible };
}

export const readPeerCompetitionSnapshot = cache(async (noticeId: bigint): Promise<PeerCompetitionSnapshot | null> => {
  const row = await prisma.dashboardSnapshot.findUnique({ where: { key: keyFor(noticeId) } });
  return (row?.payload as unknown as PeerCompetitionSnapshot) ?? null;
});
