import { cache } from 'react';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { validDealSql } from '@/lib/transaction/valid-deal';
import { areaBand, type AreaBandKey } from '@/lib/apt-region/compare';

/**
 * 청약 공고별 "분양가 ÷ 주변 신축 시세". 반경 2km 안 준공 10년 이내 아파트의 공고 전 12개월 매매와
 * 주택형별로 같은 면적대(전용 ㎡당)끼리 비교한다(가이드 「분양가는 주변 시세보다 정말 쌀까」와 같은 방법).
 *
 * 비교 기간이 공고일 기준으로 고정돼 결과가 거의 변하지 않는다. 그래서 야간 ETL이 공고마다 한 번 계산해
 * DashboardSnapshot `sub_nb_<noticeId>`에 두고, 늦게 신고되는 거래를 위해 공고 후 60일까지만 다시 계산한다.
 * 상세 페이지는 그 1행만 읽는다.
 */
export const NEWBUILD_KEY_PREFIX = 'sub_nb_';
const keyFor = (id: bigint | string) => `${NEWBUILD_KEY_PREFIX}${id}`;

export const NEWBUILD_RADIUS_M = 2000;
export const NEWBUILD_MAX_AGE_YEARS = 10;
/** 주택형 행·공고 전체 비교의 최소 주변 거래 수(2026-11-20 결정). */
export const MIN_NEARBY = 10;
const RECOMPUTE_DAYS = 60;

export interface NewbuildBand { n: number; med: number }
export interface NewbuildComplex { name: string; builtYear: number; distanceM: number; n: number; med: number }
export interface NewbuildSnapshot {
  n: number;
  complexes: number;
  bands: Partial<Record<AreaBandKey, NewbuildBand>>;
  top: NewbuildComplex[];
}

/**
 * 비교 대상 공고: APT 분양주택만. 임대·신혼희망타운·토지임대부는 분양가 구조가 달라 배율이 왜곡된다
 * (토지임대부는 땅값이 빠져 0.4배 수준으로 나온다, 2026-11-18 실측).
 */
export function isNewbuildEligible(n: { category: string; name: string; rawJson: unknown }): boolean {
  if (n.category !== 'APT') return false;
  const r = n.rawJson && typeof n.rawJson === 'object' ? (n.rawJson as Record<string, unknown>) : {};
  if (r.RENT_SECD_NM !== '분양주택') return false;
  return !/신혼희망타운|토지임대부/.test(n.name);
}

/** 주택형 "084.7415A" → 전용 84.7415㎡. 숫자로 시작하지 않으면 null. */
export function exclusiveAreaOf(houseType: string | null): number | null {
  const m = /^0*(\d+(?:\.\d+)?)/.exec(houseType ?? '');
  const v = m ? Number(m[1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export async function computeNewbuild(noticeId: bigint): Promise<NewbuildSnapshot | null> {
  const rows = await prisma.$queryRaw<
    Array<{ pid: bigint; name: string; built: number; dist: number; ppa: number; sqm: number }>
  >`
    WITH n AS (SELECT location, "noticeDate" AS nd FROM "SubscriptionNotice" WHERE id = ${noticeId} AND location IS NOT NULL AND "noticeDate" IS NOT NULL)
    SELECT p.id AS pid, p.name, p."builtYear" AS built,
      ST_Distance(p.location, n.location)::float8 AS dist,
      t."dealAmount"::float8 / t."exclusiveArea"::float8 AS ppa,
      t."exclusiveArea"::float8 AS sqm
    FROM n
    JOIN "Property" p ON p."propertyType" = 'APARTMENT' AND p."redirectToId" IS NULL AND p.location IS NOT NULL
      AND ST_DWithin(p.location, n.location, ${NEWBUILD_RADIUS_M})
      AND p."builtYear" >= EXTRACT(YEAR FROM n.nd)::int - ${NEWBUILD_MAX_AGE_YEARS}
    JOIN "Transaction" t ON t."propertyId" = p.id AND t."dealType" = 'SALE'
      AND t."contractDate" >= n.nd - INTERVAL '12 months' AND t."contractDate" < n.nd
      AND t."dealAmount" > 0 AND t."exclusiveArea" > 0 AND ${validDealSql('t')}
  `;
  if (rows.length === 0) return null;

  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const byBand = new Map<AreaBandKey, number[]>();
  const byComplex = new Map<string, { name: string; built: number; dist: number; ppas: number[] }>();
  for (const r of rows) {
    const b = areaBand(r.sqm);
    (byBand.get(b) ?? byBand.set(b, []).get(b)!).push(r.ppa);
    const k = String(r.pid);
    const c = byComplex.get(k) ?? { name: r.name, built: r.built, dist: r.dist, ppas: [] };
    c.ppas.push(r.ppa);
    byComplex.set(k, c);
  }
  const bands: NewbuildSnapshot['bands'] = {};
  for (const [b, xs] of byBand) bands[b] = { n: xs.length, med: round1(median(xs)) };
  const top = [...byComplex.values()]
    .sort((a, b) => b.ppas.length - a.ppas.length)
    .slice(0, 4)
    .map((c) => ({ name: c.name, builtYear: c.built, distanceM: Math.round(c.dist), n: c.ppas.length, med: round1(median(c.ppas)) }));
  return { n: rows.length, complexes: byComplex.size, bands, top };
}

/**
 * ETL: 대상 공고 중 스냅샷이 없거나 공고 후 60일 이내인 것만 계산한다. 계산한 공고 수를 돌려준다.
 * 주변 거래가 0건이면 빈 결과를 저장하지 않는다(다음 실행에서 다시 본다 — 60일이 지나면 멈춘다).
 */
export async function refreshNewbuildSnapshots(): Promise<{ computed: number; eligible: number }> {
  const notices = await prisma.subscriptionNotice.findMany({
    where: { category: 'APT', noticeDate: { not: null } },
    // 이 모델엔 `constructor` 컬럼이 있어 select 리터럴이 Object.prototype.constructor와 충돌한다(sitemap/sources.ts와 같은 캐스트).
    select: { id: true, name: true, category: true, rawJson: true, noticeDate: true } as Prisma.SubscriptionNoticeSelect,
  }) as unknown as Array<{ id: bigint; name: string; category: string; rawJson: unknown; noticeDate: Date | null }>;
  const eligible = notices.filter(isNewbuildEligible);
  const existing = new Set(
    (await prisma.dashboardSnapshot.findMany({ where: { key: { startsWith: NEWBUILD_KEY_PREFIX } }, select: { key: true } })).map((r) => r.key),
  );
  const fresh = Date.now() - RECOMPUTE_DAYS * 86_400_000;
  let computed = 0;
  for (const n of eligible) {
    const recent = n.noticeDate!.getTime() >= fresh;
    if (existing.has(keyFor(n.id)) && !recent) continue;
    const snap = await computeNewbuild(n.id);
    if (!snap) continue;
    const payload = snap as unknown as Prisma.InputJsonValue;
    await prisma.dashboardSnapshot.upsert({
      where: { key: keyFor(n.id) },
      create: { key: keyFor(n.id), payload },
      update: { payload },
    });
    computed++;
  }
  return { computed, eligible: eligible.length };
}

export const readNewbuildSnapshot = cache(async (noticeId: bigint): Promise<NewbuildSnapshot | null> => {
  const row = await prisma.dashboardSnapshot.findUnique({ where: { key: keyFor(noticeId) } });
  return (row?.payload as unknown as NewbuildSnapshot) ?? null;
});

export interface NewbuildUnitRow { houseType: string; ppa: number; nearbyMed: number; nearbyN: number; ratio: number }
export interface NewbuildView {
  n: number;
  complexes: number;
  minRatio: number;
  maxRatio: number;
  rows: NewbuildUnitRow[];
  top: NewbuildComplex[];
}

/** 주택형별 비교표. 같은 면적대 주변 거래가 MIN_NEARBY건 미만인 주택형은 빼고, 남는 행이 없으면 null. */
export function newbuildView(
  units: { houseType: string | null; topAmount: number | null }[],
  snap: NewbuildSnapshot | null,
): NewbuildView | null {
  if (!snap || snap.n < MIN_NEARBY) return null;
  const rows: NewbuildUnitRow[] = [];
  for (const u of units) {
    const sqm = exclusiveAreaOf(u.houseType);
    if (sqm == null || !u.topAmount || u.topAmount <= 0) continue;
    const b = snap.bands[areaBand(sqm)];
    if (!b || b.n < MIN_NEARBY) continue;
    const ppa = u.topAmount / sqm;
    rows.push({ houseType: u.houseType!, ppa, nearbyMed: b.med, nearbyN: b.n, ratio: ppa / b.med });
  }
  if (!rows.length) return null;
  const ratios = rows.map((r) => r.ratio);
  return { n: snap.n, complexes: snap.complexes, minRatio: Math.min(...ratios), maxRatio: Math.max(...ratios), rows, top: snap.top };
}
