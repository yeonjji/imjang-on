// 주차장 상세의 계산값: 같은 시군구 공영주차장과의 요금 비교.
// 기본시간이 곳마다 달라(5·10·30·60분, 1440분=1일 요금) 30분 기준으로 환산하고, 이상치 때문에 중앙값을 쓴다.
import { prisma } from '@/lib/db';

const MIN_COMPARABLES = 3;

export function per30(basicTime: number | null, basicCharge: number | null): number | null {
  if (!basicTime || !basicCharge || basicTime < 5 || basicTime > 120 || basicCharge <= 0) return null;
  return Math.round((basicCharge * 30) / basicTime);
}

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export interface ParkingFeeComparison {
  own30: number | null;
  median30: number | null;
  count30: number;
  ownMonthly: number | null;
  medianMonthly: number | null;
  countMonthly: number;
}

type FeeRow = { address: string; basicTime: number | null; basicCharge: number | null; monthCmmtkt: number | null };

/** 비교할 자기 요금(30분 환산·월정기). 접두어가 없거나 그룹 밖이거나 둘 다 없으면 null. */
function ownFees(r: FeeRow, addrPrefix: string | null): { prefix: string; own30: number | null; ownMonthly: number | null } | null {
  if (!addrPrefix || addrPrefix === '__NO_MATCH__') return null;
  // 이 주차장이 비교 그룹(같은 '시도 시군구') 안에 있을 때만 비교한다(park-context와 같은 이유).
  if (!r.address.startsWith(`${addrPrefix} `)) return null;
  const own30 = per30(r.basicTime, r.basicCharge);
  const ownMonthly = r.monthCmmtkt && r.monthCmmtkt > 0 ? r.monthCmmtkt : null;
  if (own30 === null && ownMonthly === null) return null;
  return { prefix: addrPrefix, own30, ownMonthly };
}

export async function getParkingFeeComparison(
  r: { address: string; basicTime: number | null; basicCharge: number | null; monthCmmtkt: number | null },
  addrPrefix: string | null,
): Promise<ParkingFeeComparison | null> {
  const own = ownFees(r, addrPrefix);
  if (!own) return null;
  const { own30, ownMonthly } = own;

  const rows = await prisma.$queryRaw<{ basicTime: number | null; basicCharge: number | null; monthCmmtkt: number | null }[]>`
    SELECT "basicTime", "basicCharge", "monthCmmtkt" FROM "Parking"
    WHERE "prkplceSe" = '공영' AND address LIKE ${`${addrPrefix} %`}
  `;
  const fees = rows.map((x) => per30(x.basicTime, x.basicCharge)).filter((v): v is number => v !== null);
  const months = rows.map((x) => x.monthCmmtkt).filter((v): v is number => !!v && v > 0);
  return {
    own30,
    median30: fees.length >= MIN_COMPARABLES ? median(fees) : null,
    count30: fees.length,
    ownMonthly,
    medianMonthly: months.length >= MIN_COMPARABLES ? median(months) : null,
    countMonthly: months.length,
  };
}

export interface ParkingFeeComparables { count30: number; countMonthly: number }

/**
 * 목록 점수 배치용: 접두어 안 공영주차장의 비교 가능 표본 수만 한 번에 센다. 주차장마다 getParkingFeeComparison을
 * 부르면 같은 지역 공영주차장 전체를 주차장 수만큼 다시 읽는다(운영 첫 weekly에서 DB CPU 3분+ 점유).
 */
export async function parkingFeeComparables(addrPrefix: string): Promise<ParkingFeeComparables> {
  const rows = await prisma.$queryRaw<{ basicTime: number | null; basicCharge: number | null; monthCmmtkt: number | null }[]>`
    SELECT "basicTime", "basicCharge", "monthCmmtkt" FROM "Parking"
    WHERE "prkplceSe" = '공영' AND address LIKE ${`${addrPrefix} %`}
  `;
  return {
    count30: rows.filter((x) => per30(x.basicTime, x.basicCharge) !== null).length,
    countMonthly: rows.filter((x) => !!x.monthCmmtkt && x.monthCmmtkt > 0).length,
  };
}

/** 상세에 '요금, 주변과 비교하면' 카드가 보이는가 — feeCompareShown(getParkingFeeComparison(...))과 같다. */
export function parkingFeeCompareShown(r: FeeRow, addrPrefix: string | null, comps: ParkingFeeComparables): boolean {
  const own = ownFees(r, addrPrefix);
  if (!own) return false;
  return (own.own30 !== null && comps.count30 >= MIN_COMPARABLES) || (own.ownMonthly !== null && comps.countMonthly >= MIN_COMPARABLES);
}
