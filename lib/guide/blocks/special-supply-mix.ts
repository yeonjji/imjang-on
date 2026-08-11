import { prisma } from '@/lib/db';

export interface SpecialSupplyRow { label: string; households: number }
export interface SpecialSupplyMixResult {
  rows: SpecialSupplyRow[];
  specialTotal: number;
  generalTotal: number;
  /** 집계 대상 공고의 최신 수집 시각 */
  asOf: Date | null;
}

interface Row {
  newlywed: bigint | null;
  multichild: bigint | null;
  firsthome: bigint | null;
  institution: bigint | null;
  oldparents: bigint | null;
  newborn: bigint | null;
  youth: bigint | null;
  etc: bigint | null;
  special_total: bigint | null;
  general_total: bigint | null;
  as_of: Date | null;
}

/**
 * 접수가 이미 시작된 공고만 센다. `receiptBegin`에는 미래 날짜가 들어 있어(실측 2026-08-31)
 * 거르지 않으면 "최근 12개월"이라는 설명과 어긋나고 기준일이 미래가 된다.
 */

/**
 * 최근 12개월 접수 공고의 특별공급 유형별 세대 수와 일반공급 총량.
 *
 * 특별공급 유형은 별도 컬럼이 없어 청약홈 원본 JSON에서 읽는다. 유형 합계가 특별공급 계에
 * 못 미치는 몫(이전기관종사자 등 이 표에 없는 유형)은 한 줄로 묶는다 — 실측 4,035세대.
 * 음수가 되면 넣지 않는다.
 */
export async function getSpecialSupplyMix(): Promise<SpecialSupplyMixResult> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      SUM((su."rawJson"::jsonb->>'NWWDS_HSHLDCO')::int)             AS newlywed,
      SUM((su."rawJson"::jsonb->>'MNYCH_HSHLDCO')::int)             AS multichild,
      SUM((su."rawJson"::jsonb->>'LFE_FRST_HSHLDCO')::int)          AS firsthome,
      SUM((su."rawJson"::jsonb->>'INSTT_RECOMEND_HSHLDCO')::int)    AS institution,
      SUM((su."rawJson"::jsonb->>'OLD_PARNTS_SUPORT_HSHLDCO')::int) AS oldparents,
      SUM((su."rawJson"::jsonb->>'NWBB_HSHLDCO')::int)              AS newborn,
      SUM((su."rawJson"::jsonb->>'YGMN_HSHLDCO')::int)              AS youth,
      SUM((su."rawJson"::jsonb->>'ETC_HSHLDCO')::int)               AS etc,
      SUM(su."specialSupply")                                       AS special_total,
      SUM(su."generalSupply")                                       AS general_total,
      MAX(n."updatedAt")                                            AS as_of
    FROM "SubscriptionUnit" su
    JOIN "SubscriptionNotice" n ON n.id = su."noticeId"
    WHERE n."receiptBegin" >= (CURRENT_DATE - INTERVAL '12 months')
      AND n."receiptBegin" <= CURRENT_DATE
      AND su."specialSupply" IS NOT NULL
  `;

  const r = rows[0];
  const specialTotal = Number(r?.special_total ?? 0);
  if (!r || specialTotal <= 0) return { rows: [], specialTotal: 0, generalTotal: 0, asOf: null };

  const named: SpecialSupplyRow[] = [
    { label: '신혼부부', households: Number(r.newlywed ?? 0) },
    { label: '다자녀가구', households: Number(r.multichild ?? 0) },
    { label: '생애최초', households: Number(r.firsthome ?? 0) },
    { label: '기관추천', households: Number(r.institution ?? 0) },
    { label: '노부모부양', households: Number(r.oldparents ?? 0) },
    { label: '신생아', households: Number(r.newborn ?? 0) },
    { label: '청년', households: Number(r.youth ?? 0) },
    { label: '기타', households: Number(r.etc ?? 0) },
  ]
    .filter((x) => x.households > 0)
    .sort((a, b) => b.households - a.households);

  const rest = specialTotal - named.reduce((s, x) => s + x.households, 0);
  if (rest > 0) named.push({ label: '이전기관종사자 등', households: rest });

  return {
    rows: named,
    specialTotal,
    generalTotal: Number(r.general_total ?? 0),
    asOf: r.as_of ?? null,
  };
}
