// lib/amenity/category.ts

import type { DataSourceId } from '@/lib/data-sources';

export type AmenitySlug = 'convenience' | 'mart' | 'cafe' | 'market';

/** 상권·편의 카테고리별 데이터 출처 */
export const AMENITY_SOURCE: Record<AmenitySlug, DataSourceId> = {
  convenience: 'semas-store',
  mart: 'semas-store',
  cafe: 'semas-store',
  market: 'mois-market',
};

/**
 * 4종 카테고리가 공통으로 반환하는 row 모양.
 * Prisma 모델별 추가 필드(industryName/marketType 등)는 옵셔널.
 */
export interface AmenityItem {
  id: bigint;
  name: string;
  address: string;
  sigunguCode: string | null;
  industryCode?: string | null;
  industryName?: string | null;
  marketType?: string | null;
}

export interface AmenityListFilter {
  sigunguCode?: string;
  sido?: string;
  q?: string;
  /** def별 sub-filter 슬러그 (없으면 'all') */
  sub?: string;
}

export interface AmenityListResult {
  rows: AmenityItem[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface AmenitySubFilterOption<S extends string = string> {
  slug: S;
  label: string;
}

export interface AmenitySubFilterDef<S extends string = string> {
  paramKey: string; // URL 쿼리 키 (보통 'sub')
  options: AmenitySubFilterOption<S>[];
  defaultSlug: S; // 보통 'all'
}

export interface AmenityCategoryDef {
  slug: AmenitySlug;
  label: string;
  emoji: string;
  breadcrumbLabel: string;
  subFilters?: AmenitySubFilterDef;
  /**
   * LIST 진입 시 시도(sido)가 없으면 '서울'로 강제 redirect할지 여부.
   * 미지정·true: redirect (편의점/마트/카페처럼 전국 row가 수십만 단위인 경우).
   * false: 전국을 기본 스코프로 사용 (전통시장처럼 row가 수천 단위인 경우).
   */
  requiresSidoScope?: boolean;
  getList(filter: AmenityListFilter, page: number): Promise<AmenityListResult>;
  getRegionBreakdown(filter: AmenityListFilter): Promise<{ sigunguCode: string; count: number }[]>;
  getById(id: bigint): Promise<AmenityItem | null>;
  getLatLng(id: bigint): Promise<{ lat: number; lng: number } | null>;
  /** 카드 보조 라벨 (예: '대형마트', '상설시장') */
  inferRowSummary(row: AmenityItem): string | null;
  /** DETAIL 기본정보 그리드 행 */
  detailFields(item: AmenityItem): Array<{ label: string; value: string }>;
  /**
   * 시군구 picker / 허브용 카운트 (groupBy 결과).
   * sub-filter는 반영하지 않음 — 허브는 카테고리 전체 분포를 보여주는 게 목적.
   * 향후 sub-aware 카운트가 필요해지면 인수에 sub?: string 추가.
   */
  getCountsBySigungu(): Promise<Map<string, number>>;
}

// --- 레지스트리 ---
import { convenienceDef } from './adapters/convenience';
import { cafeDef } from './adapters/cafe';
import { martDef } from './adapters/mart';
import { marketDef } from './adapters/market';

export const AMENITY_SLUGS = ['convenience', 'mart', 'cafe', 'market'] as const satisfies readonly AmenitySlug[];

export const AMENITY_CATEGORIES: Record<AmenitySlug, AmenityCategoryDef> = {
  convenience: convenienceDef,
  mart: martDef,
  cafe: cafeDef,
  market: marketDef,
};

export function getCategoryDef(slug: string): AmenityCategoryDef | null {
  if ((AMENITY_SLUGS as readonly string[]).includes(slug)) {
    return AMENITY_CATEGORIES[slug as AmenitySlug];
  }
  return null;
}

/**
 * Client Component에 def를 넘길 때 사용하는 직렬화 가능한 뷰.
 * AmenityCategoryDef는 함수(getList 등)를 포함하므로 그대로 'use client' 경계를 넘길 수 없다.
 */
export interface AmenityCategoryView {
  slug: AmenitySlug;
  label: string;
  emoji: string;
  breadcrumbLabel: string;
  subFilters?: AmenitySubFilterDef;
}

export function toAmenityCategoryView(def: AmenityCategoryDef): AmenityCategoryView {
  return {
    slug: def.slug,
    label: def.label,
    emoji: def.emoji,
    breadcrumbLabel: def.breadcrumbLabel,
    subFilters: def.subFilters,
  };
}
