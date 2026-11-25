import { cache } from 'react';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { validDealSql } from '@/lib/transaction/valid-deal';
import { MIN_REGION_SAMPLE, QUANTILE_STEPS, type AptRegionSnapshot, type AreaBandKey, type RegionBand } from './compare';

/**
 * 시군구별 아파트 매매 ㎡당 가격 분포 스냅샷. 일일 실거래 ingest 뒤 ETL이 계산하고(run-etl.sh transactions-daily),
 * 상세 페이지는 자기 시군구 1행만 읽는다 — 요청 경로에서 지역 집계를 하지 않는다.
 *
 * 키는 `apt_rs_<Transaction.sigunguCode>`. Property.sigunguCode와 그 단지 거래의 sigunguCode는
 * 운영 실측 100% 일치(2026-11-20, 38,985단지)라 상세는 Property.sigunguCode로 바로 찾는다.
 *
 * 일반구가 있는 시(수원·고양·화성 등 39개 구 코드)는 Region에 구 단위 행이 없어 이름을 붙일 수 없다.
 * 그래서 시 코드(LEFT(code,4)||'0')로 묶어 시 전체를 하나로 집계하고, 같은 값을 그 시의 모든 구 코드 키에
 * 펼쳐 쓴다(lib/subscription/median-snapshot.ts와 같은 방식). 화면 이름도 시 이름이다.
 */
export const APT_REGION_KEY_PREFIX = 'apt_rs_';
const keyFor = (code: string) => `${APT_REGION_KEY_PREFIX}${code}`;

const QUANTILES = Prisma.raw(`ARRAY[${QUANTILE_STEPS.join(',')}]::float8[]`);
const round1 = (v: number) => Math.round(v * 10) / 10;

// 거래가 있는 시군구 코드 → 집계 그룹(일반구는 시 코드)·라벨. 세 집계가 같은 그룹 정의를 쓴다.
const GROUP_CTE = Prisma.sql`
    codes AS (
      SELECT DISTINCT "sigunguCode" AS code FROM "Transaction"
      WHERE "propertyType" = 'APARTMENT' AND "contractDate" >= (CURRENT_DATE - INTERVAL '24 months')
    ),
    -- 세종은 구가 없어 동들이 level 2로 들어가 있다(같은 코드에 이름이 여럿). 그럴 땐 시도 이름을 쓴다 —
    -- 아니면 '합강동' 같은 동 이름이 시 전체 집계의 이름으로 붙는다(2026-11-20 실측).
    l2 AS (
      SELECT "sigunguCode" AS code,
        CASE WHEN COUNT(DISTINCT sigungu) > 1 THEN MIN(sido) ELSE MIN(sigungu) END AS sigungu
      FROM "Region"
      WHERE level = 2 AND "isAbolished" = false AND "sigunguCode" IS NOT NULL AND sigungu IS NOT NULL
      GROUP BY "sigunguCode"
    ),
    grp AS (
      SELECT c.code, COALESCE(a.code, b.code) AS grp, COALESCE(a.sigungu, b.sigungu) AS label
      FROM codes c
      LEFT JOIN l2 a ON a.code = c.code
      LEFT JOIN l2 b ON a.code IS NULL AND b.code = LEFT(c.code, 4) || '0'
      WHERE COALESCE(a.code, b.code) IS NOT NULL
    )`;

// 면적대·연식대 경계는 compare.ts(areaBand·ageBand)와 같아야 한다.
const BAND_SQL = Prisma.raw(`CASE WHEN t."exclusiveArea" < 60 THEN 1 WHEN t."exclusiveArea" < 85 THEN 2
             WHEN t."exclusiveArea" < 102 THEN 3 WHEN t."exclusiveArea" < 135 THEN 4 ELSE 5 END`);
const AGE_SQL = Prisma.raw(`CASE WHEN p."builtYear" IS NULL THEN NULL
             WHEN EXTRACT(YEAR FROM CURRENT_DATE)::int - p."builtYear" <= 5 THEN 1
             WHEN EXTRACT(YEAR FROM CURRENT_DATE)::int - p."builtYear" <= 10 THEN 2
             WHEN EXTRACT(YEAR FROM CURRENT_DATE)::int - p."builtYear" <= 20 THEN 3
             WHEN EXTRACT(YEAR FROM CURRENT_DATE)::int - p."builtYear" <= 30 THEN 4 ELSE 5 END`);

export async function computeAptRegionSnapshots(): Promise<Record<string, AptRegionSnapshot>> {
  const rows = await prisma.$queryRaw<
    Array<{ grp: string; label: string; members: string[]; band: number; n12: bigint; nprev: bigint; q: number[] | null; med_prev: number | null }>
  >`
    WITH ${GROUP_CTE},
    base AS (
      SELECT g.grp,
        t."dealAmount"::float8 / t."exclusiveArea"::float8 AS ppa,
        t."contractDate" >= (CURRENT_DATE - INTERVAL '12 months') AS recent,
        ${BAND_SQL} AS band
      FROM "Transaction" t
      JOIN grp g ON g.code = t."sigunguCode"
      WHERE t."propertyType" = 'APARTMENT' AND t."dealType" = 'SALE'
        AND t."contractDate" >= (CURRENT_DATE - INTERVAL '24 months')
        AND t."dealAmount" > 0 AND t."exclusiveArea" > 0 AND ${validDealSql('t')}
    ),
    agg AS (
      SELECT grp, band,
        COUNT(*) FILTER (WHERE recent) AS n12,
        COUNT(*) FILTER (WHERE NOT recent) AS nprev,
        percentile_cont(${QUANTILES}) WITHIN GROUP (ORDER BY ppa) FILTER (WHERE recent) AS q,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY ppa) FILTER (WHERE NOT recent) AS med_prev
      FROM base GROUP BY grp, band
    )
    SELECT a.grp, (SELECT label FROM grp WHERE grp.grp = a.grp LIMIT 1) AS label,
      (SELECT array_agg(code) FROM grp WHERE grp.grp = a.grp) AS members,
      a.band, a.n12, a.nprev, a.q, a.med_prev
    FROM agg a
  `;

  // 같은 면적대 × 연식대 최근 12개월 ㎡당 중간값(주변 단지 비교 기준선). 표본 미달 칸은 버린다.
  const ageRows = await prisma.$queryRaw<Array<{ grp: string; band: number; age: number; n12: bigint; med: number }>>`
    WITH ${GROUP_CTE}
    SELECT g.grp, ${BAND_SQL} AS band, ${AGE_SQL} AS age,
      COUNT(*) AS n12,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY t."dealAmount"::float8 / t."exclusiveArea"::float8) AS med
    FROM "Transaction" t
    JOIN grp g ON g.code = t."sigunguCode"
    JOIN "Property" p ON p.id = t."propertyId"
    WHERE t."propertyType" = 'APARTMENT' AND t."dealType" = 'SALE'
      AND t."contractDate" >= (CURRENT_DATE - INTERVAL '12 months')
      AND t."dealAmount" > 0 AND t."exclusiveArea" > 0 AND p."builtYear" IS NOT NULL AND ${validDealSql('t')}
    GROUP BY 1, 2, 3
    HAVING COUNT(*) >= ${MIN_REGION_SAMPLE}
  `;

  // 최근 12개월 아파트 전월세 계약 지표(갱신 블록).
  const rentRows = await prisma.$queryRaw<
    Array<{ grp: string; rent: bigint; wolse: bigint; renew: bigint; rr: bigint; jr_n: bigint; jr_inc: number | null }>
  >`
    WITH ${GROUP_CTE}
    SELECT g.grp,
      COUNT(*) AS rent,
      COUNT(*) FILTER (WHERE t."dealType" = 'WOLSE') AS wolse,
      COUNT(*) FILTER (WHERE t."contractType" = '갱신') AS renew,
      COUNT(*) FILTER (WHERE t."useRRRight" IS TRUE) AS rr,
      COUNT(*) FILTER (WHERE t."contractType" = '갱신' AND t."dealType" = 'JEONSE' AND t."preDeposit" > 0 AND t.deposit > 0) AS jr_n,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY (t.deposit - t."preDeposit")::float8 / t."preDeposit")
        FILTER (WHERE t."contractType" = '갱신' AND t."dealType" = 'JEONSE' AND t."preDeposit" > 0 AND t.deposit > 0) * 100 AS jr_inc
    FROM "Transaction" t
    JOIN grp g ON g.code = t."sigunguCode"
    WHERE t."propertyType" = 'APARTMENT' AND t."dealType" IN ('JEONSE', 'WOLSE')
      AND t."contractDate" >= (CURRENT_DATE - INTERVAL '12 months') AND ${validDealSql('t')}
    GROUP BY g.grp
  `;

  const groups = new Map<string, { snap: AptRegionSnapshot; members: string[] }>();
  for (const r of rows) {
    let g = groups.get(r.grp);
    if (!g) {
      g = { snap: { label: r.label, sale12: 0, salePrev: 0, bands: {} }, members: r.members };
      groups.set(r.grp, g);
    }
    const n12 = Number(r.n12);
    const nPrev = Number(r.nprev);
    g.snap.sale12 += n12;
    g.snap.salePrev += nPrev;
    const band: RegionBand = {
      n12,
      nPrev,
      q: n12 >= MIN_REGION_SAMPLE && r.q ? r.q.map(round1) : null,
      medPrev: nPrev >= MIN_REGION_SAMPLE && r.med_prev != null ? round1(r.med_prev) : null,
    };
    g.snap.bands[r.band as AreaBandKey] = band;
  }
  for (const r of ageRows) {
    const b = groups.get(r.grp)?.snap.bands[r.band as AreaBandKey];
    if (!b || r.age == null) continue;
    (b.age ??= {})[r.age as 1 | 2 | 3 | 4 | 5] = { n12: Number(r.n12), med: round1(r.med) };
  }
  for (const r of rentRows) {
    const g = groups.get(r.grp);
    if (!g) continue;
    g.snap.rent = {
      rent: Number(r.rent),
      wolse: Number(r.wolse),
      renew: Number(r.renew),
      rrUsed: Number(r.rr),
      jeonseRenewN: Number(r.jr_n),
      jeonseRenewIncPct: r.jr_inc != null ? round1(r.jr_inc) : null,
    };
  }

  const out: Record<string, AptRegionSnapshot> = {};
  for (const { snap, members } of groups.values()) for (const code of members) out[code] = snap;
  return out;
}

/**
 * 계산 결과를 시군구별 키로 쓰고, 이번 결과에 없는 옛 키는 지운다. 반영된 키 개수를 돌려준다.
 * 빈 결과는 상류 장애일 수 있어 아무것도 쓰거나 지우지 않는다(호출부가 실패로 처리).
 */
export async function writeAptRegionSnapshots(): Promise<number> {
  const snaps = await computeAptRegionSnapshots();
  const codes = Object.keys(snaps);
  if (codes.length === 0) return 0;
  for (let i = 0; i < codes.length; i += 50) {
    await prisma.$transaction(
      codes.slice(i, i + 50).map((code) => {
        const payload = snaps[code] as unknown as Prisma.InputJsonValue;
        return prisma.dashboardSnapshot.upsert({
          where: { key: keyFor(code) },
          create: { key: keyFor(code), payload },
          update: { payload },
        });
      }),
    );
  }
  await prisma.dashboardSnapshot.deleteMany({
    where: { key: { startsWith: APT_REGION_KEY_PREFIX, notIn: codes.map(keyFor) } },
  });
  return codes.length;
}

/** 상세 페이지에서 호출(요청당 1회로 dedupe). 없으면 null → 지역 비교를 그리지 않는다. */
export const readAptRegionSnapshot = cache(async (sigunguCode: string | null): Promise<AptRegionSnapshot | null> => {
  if (!sigunguCode) return null;
  const row = await prisma.dashboardSnapshot.findUnique({ where: { key: keyFor(sigunguCode) } });
  return (row?.payload as unknown as AptRegionSnapshot) ?? null;
});
