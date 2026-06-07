import { PropertyType } from '@prisma/client';
import type { DealFilter, AreaRange, SortOption } from '@/lib/property';

const TYPE_MAP: Record<string, PropertyType[]> = {
  apt: [PropertyType.APARTMENT],
  officetel: [PropertyType.OFFICETEL],
  villa: [PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX],
  all: [PropertyType.APARTMENT, PropertyType.OFFICETEL, PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX],
};

export interface ListSearchParams {
  type?: string;
  deal?: string;
  price_min?: string;
  price_max?: string;
  area?: string;
  sort?: string;
  region?: string;
  sido?: string;
  q?: string;
  page?: string;
  station?: string;
}

export interface ParsedListParams {
  types: PropertyType[];
  deal: DealFilter;
  priceMin?: number;
  priceMax?: number;
  areaRange?: AreaRange;
  sort: SortOption;
  sigunguCode?: string;
  sido?: string;
  q?: string;
  page: number;
  stationId?: string;
}

export function parseListParams(sp: ListSearchParams): ParsedListParams {
  const typeSlug = sp.type ?? 'all';
  return {
    types: TYPE_MAP[typeSlug] ?? TYPE_MAP.all,
    deal: (sp.deal ?? 'all') as DealFilter,
    priceMin: sp.price_min ? Number(sp.price_min) : undefined,
    priceMax: sp.price_max ? Number(sp.price_max) : undefined,
    areaRange: sp.area as AreaRange | undefined,
    sort: (sp.sort ?? 'recent') as SortOption,
    sigunguCode: sp.region,
    sido: sp.sido,
    q: sp.q?.trim() || undefined,
    page: Math.max(1, Number(sp.page ?? '1')),
    stationId: sp.station || undefined,
  };
}
