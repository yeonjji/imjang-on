import { sidoPrefix } from '@/lib/region';
import { getTopPropertiesByVolume } from '@/lib/property';
import {
  getWeeklySubscriptions,
  flattenWeeklyBoard,
  type WeeklyBoard,
  type WeeklyBoardItem,
} from '@/lib/subscription';
import { PropertyType } from '@prisma/client';

export interface ResolvedRegionScope {
  /** regionTags 중 실제 시도(단축명)만. 비어 있으면 전국. */
  specificSidos: string[];
  /** 헤더 라벨. 예: '강원', '경남·울산', '서울 외', '전국'. */
  label: string;
}

const MAX_LABEL_SIDOS = 2;

export function resolveLoanRegionScope(regionTags: string[]): ResolvedRegionScope {
  const specificSidos = regionTags.filter((t) => sidoPrefix(t) !== undefined);
  const label =
    specificSidos.length === 0
      ? '전국'
      : specificSidos.length > MAX_LABEL_SIDOS
        ? `${specificSidos[0]} 외`
        : specificSidos.join('·');
  return { specificSidos, label };
}

/** getTopPropertiesByVolume가 반환하는 단지(지역 포함) 형태. */
export type DiscoveryProperty = Awaited<ReturnType<typeof getTopPropertiesByVolume>>[number];

export interface LoanDiscoveryRegionScope {
  label: string;
  isNationwide: boolean;
  /** "실거래가 더 보기" 링크용 첫 시도 단축명. 전국이면 null. */
  sido: string | null;
}

export interface LoanDiscovery {
  regionScope: LoanDiscoveryRegionScope;
  properties: DiscoveryProperty[];
  weeklySubscriptions: WeeklyBoardItem[];
}

/** 아파트·오피스텔·빌라(다세대) 전체. */
const DISCOVERY_TYPES: PropertyType[] = [
  PropertyType.APARTMENT,
  PropertyType.OFFICETEL,
  PropertyType.ROW_HOUSE,
  PropertyType.MULTIPLEX,
];
const MAX_PROPERTIES = 4;

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error('[loan-discovery] fetch failed, using fallback', err);
    return fallback;
  }
}

export async function getLoanDiscovery(product: { regionTags: string[] }): Promise<LoanDiscovery> {
  const resolved = resolveLoanRegionScope(product.regionTags);

  // 지역 상품이면 그 시도의 거래량 상위 단지를 먼저 시도한다.
  let properties: DiscoveryProperty[] = [];
  if (resolved.specificSidos.length > 0) {
    const sidoPrefixes = resolved.specificSidos
      .map((s) => sidoPrefix(s))
      .filter((p): p is string => p !== undefined);
    properties = await safe(
      getTopPropertiesByVolume({ types: DISCOVERY_TYPES, sidoPrefixes, limit: MAX_PROPERTIES }),
      [],
    );
  }

  // 그 시도에 표시할 단지가 없으면(또는 전국 상품) 전국 상위로 폴백.
  let regionScope: LoanDiscoveryRegionScope;
  if (properties.length > 0) {
    regionScope = { label: resolved.label, isNationwide: false, sido: resolved.specificSidos[0] };
  } else {
    properties = await safe(
      getTopPropertiesByVolume({ types: DISCOVERY_TYPES, limit: MAX_PROPERTIES }),
      [],
    );
    regionScope = { label: '전국', isNationwide: true, sido: null };
  }

  const board = await safe<WeeklyBoard | null>(getWeeklySubscriptions(), null);
  const weeklySubscriptions = board ? flattenWeeklyBoard(board, 4) : [];

  return { regionScope, properties, weeklySubscriptions };
}
