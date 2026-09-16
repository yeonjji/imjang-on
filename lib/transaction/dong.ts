import type { DealType, PropertyType } from '@prisma/client';
import { prisma } from '@/lib/db';

export interface DongTransaction {
  id: string;
  contractDate: string; // 'YYYY-MM-DD'
  propertyId: string;
  propertyName: string;
  propertyType: PropertyType;
  exclusiveArea: number;
  floor: number | null;
  dealType: DealType;
  dealAmount: number | null;
  deposit: number | null;
  monthlyRent: number | null;
}

/**
 * Property에서 읍·면·동·리를 얻는다.
 *
 * Property에 umd 컬럼은 없다. 대신 address가 `umd + ' ' + jibun`으로 조립되므로
 * (lib/property.ts:93) 마지막 토큰만 떼면 실거래 Transaction.umd와 같은 형식이 된다.
 * 실측 표본 3,000건 중 2,970건(99.0%) 일치.
 *
 * scripts/ingest/apt-complex/match.ts의 dongOfAddress()를 쓰면 안 된다 — 그 함수는
 * **앞** 토큰을 뽑아 '고촌읍 신곡리 100' → '고촌읍'을 반환하는데, 실거래 umd는
 * '고촌읍 신곡리'라 지방에서 어긋난다.
 */
export function umdOfProperty(address: string): string {
  return address.trim().replace(/\s+\S+$/, '');
}

export async function getDongTransactions(opts: {
  sigunguCode: string;
  umd: string;
  dealType?: DealType;
  propertyType?: PropertyType;
  excludePropertyId?: bigint;
  limit?: number;
}): Promise<DongTransaction[]> {
  const { sigunguCode, umd, dealType, propertyType, excludePropertyId, limit = 8 } = opts;

  // regionCode는 법정동이 아니라 시군구 코드에 0을 채운 값이다(스펙 §3.1).
  // 이렇게 넘겨야 [regionCode, contractDate desc] 인덱스를 탄다.
  const regionCode = `${sigunguCode}00000`;

  const rows = await prisma.transaction.findMany({
    where: {
      regionCode,
      umd,
      // 해제 신고된 거래를 '최근 거래'로 보여주지 않는다.
      cancelDate: null,
      ...(dealType ? { dealType } : {}),
      ...(propertyType ? { propertyType } : {}),
      // 조회 단계에서 제외한다. 가져온 뒤 거르면 앞 N건이 전부 자기 건물일 때
      // 다른 거래를 놓친다.
      ...(excludePropertyId ? { propertyId: { not: excludePropertyId } } : {}),
    },
    // 같은 계약일 안에서 순서가 흔들리지 않게 id로 잇는다(저장소 관례).
    orderBy: [{ contractDate: 'desc' }, { id: 'desc' }],
    take: limit,
    select: {
      id: true,
      contractDate: true,
      propertyId: true,
      propertyType: true,
      exclusiveArea: true,
      floor: true,
      dealType: true,
      dealAmount: true,
      deposit: true,
      monthlyRent: true,
      property: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: String(r.id),
    contractDate: r.contractDate.toISOString().slice(0, 10),
    propertyId: String(r.propertyId),
    propertyName: r.property.name,
    propertyType: r.propertyType,
    exclusiveArea: Number(r.exclusiveArea),
    floor: r.floor,
    dealType: r.dealType,
    dealAmount: r.dealAmount,
    deposit: r.deposit,
    monthlyRent: r.monthlyRent,
  }));
}
