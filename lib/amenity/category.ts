// lib/amenity/category.ts

export type AmenitySlug = 'convenience' | 'mart' | 'cafe' | 'market';

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
  getList(filter: AmenityListFilter, page: number): Promise<AmenityListResult>;
  getById(id: bigint): Promise<AmenityItem | null>;
  getLatLng(id: bigint): Promise<{ lat: number; lng: number } | null>;
  /** 카드 보조 라벨 (예: '대형마트', '상설시장') */
  inferRowSummary(row: AmenityItem): string | null;
  /** DETAIL 기본정보 그리드 행 */
  detailFields(item: AmenityItem): Array<{ label: string; value: string }>;
  /** 시군구 picker / 허브용 카운트 (groupBy 결과) */
  getCountsBySigungu(): Promise<Map<string, number>>;
}
