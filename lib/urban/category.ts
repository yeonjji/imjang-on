import type { ReactNode } from 'react';
import { parkingDef } from './adapters/parking';

export type UrbanSlug = 'parking';

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
}

export interface UrbanCategoryDef<TRow = unknown> {
  slug: UrbanSlug;
  label: string;
  emoji: string;
  breadcrumbLabel: string;
  subFilters?: UrbanSubFilterDef;
  requiresSidoScope?: boolean;
  getList(filter: UrbanListFilter, page: number): Promise<UrbanListResult<TRow>>;
  getById(id: bigint): Promise<UrbanItem<TRow> | null>;
  getLatLng(id: bigint): Promise<{ lat: number; lng: number } | null>;
  inferRowSummary(item: UrbanItem<TRow>): string | null;
  detailFields(item: UrbanItem<TRow>, ctx: { regionFullName: string }): Array<{ label: string; value: string }>;
  renderRichSections(item: UrbanItem<TRow>): ReactNode;
}

export const URBAN_SLUGS = ['parking'] as const satisfies readonly UrbanSlug[];

export const URBAN_CATEGORIES: Record<UrbanSlug, UrbanCategoryDef> = {
  parking: parkingDef,
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
