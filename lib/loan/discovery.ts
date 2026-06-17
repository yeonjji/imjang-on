import { sidoPrefix, getPopularSigungusBySido, type PopularRegion } from '@/lib/region';
import { readHomeSnapshot } from '@/lib/dashboard-snapshot';
import {
  getWeeklySubscriptions,
  flattenWeeklyBoard,
  type WeeklyBoard,
  type WeeklyBoardItem,
} from '@/lib/subscription';

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

export interface LoanDiscoveryRegionScope {
  label: string;
  isNationwide: boolean;
  /** "실거래가 더 보기" 링크용 첫 시도 단축명. 전국이면 null. */
  sido: string | null;
}

export interface LoanDiscovery {
  regionScope: LoanDiscoveryRegionScope;
  popularRegions: PopularRegion[];
  weeklySubscriptions: WeeklyBoardItem[];
}

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

  let popularRegions: PopularRegion[] = [];
  if (resolved.specificSidos.length > 0) {
    popularRegions = await safe(getPopularSigungusBySido(resolved.specificSidos, 6), []);
  }

  let regionScope: LoanDiscoveryRegionScope;
  if (popularRegions.length > 0) {
    regionScope = { label: resolved.label, isNationwide: false, sido: resolved.specificSidos[0] };
  } else {
    const snapshot = await safe(readHomeSnapshot(), { briefing: null, popularRegions: [] });
    popularRegions = snapshot.popularRegions.slice(0, 6);
    regionScope = { label: '전국', isNationwide: true, sido: null };
  }

  const board = await safe<WeeklyBoard | null>(getWeeklySubscriptions(), null);
  const weeklySubscriptions = board ? flattenWeeklyBoard(board, 4) : [];

  return { regionScope, popularRegions, weeklySubscriptions };
}
