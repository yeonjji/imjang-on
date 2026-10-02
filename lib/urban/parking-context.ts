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

export async function getParkingFeeComparison(
  r: { basicTime: number | null; basicCharge: number | null; monthCmmtkt: number | null },
  addrPrefix: string | null,
): Promise<ParkingFeeComparison | null> {
  if (!addrPrefix || addrPrefix === '__NO_MATCH__') return null;
  const own30 = per30(r.basicTime, r.basicCharge);
  const ownMonthly = r.monthCmmtkt && r.monthCmmtkt > 0 ? r.monthCmmtkt : null;
  if (own30 === null && ownMonthly === null) return null;

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
