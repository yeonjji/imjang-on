import type { ReactNode } from 'react';
import { parkingDef } from './adapters/parking';
import { chargerDef } from './adapters/charger';
import { parkDef } from './adapters/park';
import type { DataSourceId } from '@/lib/data-sources';

export type UrbanSlug = 'parking' | 'charger' | 'park';

/** 도시인프라 카테고리별 데이터 출처 */
export const URBAN_SOURCE: Record<UrbanSlug, DataSourceId> = {
  parking: 'mois-parking',
  charger: 'kepco-ev',
  park: 'mois-park',
};

export interface UrbanItem<TRow = unknown> {
  id: bigint;
  name: string;
  address: string;
  sigunguCode: string | null;
  raw: TRow;
}

export interface UrbanListFilter {
  sigunguCode?: string;
  sido?: string;
  q?: string;
  sub?: string;
  charge?: string;
  type?: string;
  pwd?: string;
  open24?: string;
}

export interface UrbanListResult<TRow = unknown> {
  rows: UrbanItem<TRow>[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface UrbanSubFilterOption { slug: string; label: string }
export interface UrbanSubFilterDef {
  paramKey: string;
  options: UrbanSubFilterOption[];
  defaultSlug: string;
  label?: string;
}

export interface UrbanCategoryDef<TRow = unknown> {
  slug: UrbanSlug;
  label: string;
  emoji: string;
  breadcrumbLabel: string;
  subFilters?: UrbanSubFilterDef;
  requiresSidoScope?: boolean;
  getRegionBreakdown(filter: UrbanListFilter): Promise<{ sigunguCode: string; count: number }[]>;
  getList(filter: UrbanListFilter, page: number): Promise<UrbanListResult<TRow>>;
  getById(id: bigint): Promise<UrbanItem<TRow> | null>;
  getLatLng(id: bigint): Promise<{ lat: number; lng: number } | null>;
  inferRowSummary(item: UrbanItem<TRow>): string | null;
  detailFields(item: UrbanItem<TRow>, ctx: { regionFullName: string }): Array<{ label: string; value: string }>;
  renderRichSections(item: UrbanItem<TRow>): ReactNode;
}

export const URBAN_SLUGS = ['parking', 'charger', 'park'] as const satisfies readonly UrbanSlug[];

export const URBAN_CATEGORIES: Record<UrbanSlug, UrbanCategoryDef> = {
  parking: parkingDef,
  charger: chargerDef,
  park: parkDef,
};

export function getUrbanCategoryDef(slug: string): UrbanCategoryDef | null {
  if ((URBAN_SLUGS as readonly string[]).includes(slug)) {
    return URBAN_CATEGORIES[slug as UrbanSlug];
  }
  return null;
}

export interface UrbanCategoryView {
  slug: UrbanSlug;
  label: string;
  emoji: string;
  breadcrumbLabel: string;
  subFilters?: UrbanSubFilterDef;
}

export function toUrbanCategoryView(def: UrbanCategoryDef): UrbanCategoryView {
  return {
    slug: def.slug,
    label: def.label,
    emoji: def.emoji,
    breadcrumbLabel: def.breadcrumbLabel,
    subFilters: def.subFilters,
  };
}
