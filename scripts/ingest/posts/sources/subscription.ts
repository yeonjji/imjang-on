import { Prisma } from '@prisma/client';
import type { SubscriptionCategory } from '@prisma/client';
import { prisma } from '@/lib/db';
import { SITE_URL } from '@/lib/site';
import { categoryLabel, deriveStatus, getWeekRange } from '@/lib/subscription';
import { kstDateISO } from '../keys';
import type { BoardCandidate } from '../candidate';

/** FIRST_PARTY 청약 후보: 우리 청약 DB(청약홈·LH) 집계로 "현재 청약 일정" 글 1건을 만든다. */
export const SUBSCRIPTION_SOURCE_NAME = '임장ON 청약 집계(원자료: 청약홈·LH)';
export const MIN_NOTICES = 3; // 이보다 적으면 기사화할 substance 부족 → 후보 생성 안 함

export interface DigestNotice {
  name: string;
  regionName: string | null;
  address: string | null;
  category: SubscriptionCategory;
  totalSupply: number | null;
  receiptBegin: Date | null;
  receiptEnd: Date | null;
  winnerDate: Date | null;
  moveInYm: string | null;
}

function fmtDate(d: Date | null): string {
  if (!d) return '미정';
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}

function fmtMoveIn(ym: string | null): string {
  if (!ym || ym.length !== 6) return '미정';
  return `${ym.slice(0, 4)}년 ${ym.slice(4, 6)}월`;
}

function regionShort(address: string | null, regionName: string | null): string {
  if (address) {
    const gu = (address.match(/[가-힣]+[시군구]/g) ?? []).find((t) => /[구군]$/.test(t));
    if (gu) return gu;
  }
  return regionName ?? '지역 미상';
}

/** 순수: 공고 목록 → 기사 생성용 사실 digest. MIN_NOTICES 미만이면 null. */
export function buildSubscriptionDigest(
  rows: DigestNotice[],
  today: Date,
): { title: string; bodyText: string } | null {
  if (rows.length < MIN_NOTICES) return null;

  const lines = rows.map((r, i) => {
    const st = deriveStatus(r.receiptBegin, r.receiptEnd, today);
    const statusLabel = st.status === 'OPEN' ? '현재 접수 중' : st.status === 'UPCOMING' ? '접수 예정' : '마감';
    const supply = r.totalSupply != null ? `총 ${r.totalSupply.toLocaleString('ko-KR')}세대` : '공급 세대 미정';
    const region = regionShort(r.address, r.regionName);
    return (
      `${i + 1}. ${r.name}(${region})은 ${categoryLabel(r.category)} 유형으로 ${supply}를 공급한다. ` +
      `청약 접수는 ${fmtDate(r.receiptBegin)}부터 ${fmtDate(r.receiptEnd)}까지이며 ${statusLabel}이다. ` +
      `당첨자는 ${fmtDate(r.winnerDate)}에 발표되고, 입주 예정 시기는 ${fmtMoveIn(r.moveInYm)}이다.`
    );
  });

  const todayLabel = `${today.getUTCFullYear()}년 ${today.getUTCMonth() + 1}월 ${today.getUTCDate()}일`;
  const bodyText =
    `임장ON이 청약홈과 LH 사전청약 공고를 집계한 자료다. ${todayLabel} 기준으로 ` +
    `현재 접수 중이거나 접수 예정인 청약은 모두 ${rows.length}건이다.\n\n` +
    lines.join('\n\n');

  return { title: `현재 청약 일정 정리 (${rows.length}개 단지)`, bodyText };
}

// SubscriptionNotice에 `constructor`(시공사) 필드가 있어 Prisma select 타입이 깨짐 → lib/subscription.ts와 동일하게 raw 사용.
interface RawRow {
  name: string;
  region_name: string | null;
  address: string | null;
  category: SubscriptionCategory;
  total_supply: number | null;
  receipt_begin: Date | null;
  receipt_end: Date | null;
  winner_date: Date | null;
  move_in_ym: string | null;
}

/** 운영 DB에서 접수 중·예정 공고를 모아 FIRST_PARTY 후보(0~1건) 생성. */
export async function collectSubscriptionCandidates(today: Date): Promise<BoardCandidate[]> {
  const raw = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT n.name,
           n."regionName" AS region_name,
           n.address,
           n.category,
           n."totalSupply" AS total_supply,
           n."receiptBegin" AS receipt_begin,
           n."receiptEnd" AS receipt_end,
           n."winnerDate" AS winner_date,
           n."moveInYm" AS move_in_ym
    FROM "SubscriptionNotice" n
    WHERE n."receiptEnd" >= CURRENT_DATE OR n."receiptBegin" > CURRENT_DATE
    ORDER BY n."receiptBegin" ASC NULLS LAST, n.id ASC
    LIMIT 12
  `);
  const rows: DigestNotice[] = raw.map((r) => ({
    name: r.name,
    regionName: r.region_name,
    address: r.address,
    category: r.category,
    totalSupply: r.total_supply,
    receiptBegin: r.receipt_begin,
    receiptEnd: r.receipt_end,
    winnerDate: r.winner_date,
    moveInYm: r.move_in_ym,
  }));

  const digest = buildSubscriptionDigest(rows, today);
  if (!digest) return [];

  const weekStartISO = kstDateISO(getWeekRange(today).weekStart);
  return [
    {
      sourceKey: 'fp:subscription',
      agency: SUBSCRIPTION_SOURCE_NAME,
      title: digest.title,
      link: `${SITE_URL}/subscription`,
      pubDate: today,
      bodyText: digest.bodyText,
      dedupeKey: `fp:subscription:${weekStartISO}`, // 주 1회 cadence
    },
  ];
}
