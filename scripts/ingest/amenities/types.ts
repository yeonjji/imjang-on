// scripts/ingest/amenities/types.ts

export interface NormalizedEvCharger {
  sourceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  chargeSpeed: string;
  chargerCount: number;
  operatorName: string | null;
}

export interface NormalizedTraditionalMarket {
  sourceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  marketType: string | null;
}

export interface NormalizedStore {
  sourceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  industryCode: string | null;
  industryName: string | null;
  sigunguCode: string;
}

export interface NormalizedSchool {
  sourceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  schoolLevel: string;       // "초등학교" | "중학교" | "고등학교"
  schoolType: string | null; // "국립" | "공립" | "사립"
}

export interface NormalizedPark {
  sourceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  parkType: string | null;
  area: number | null;
}

export type AmenitySourceKey =
  | 'ev-charger'
  | 'traditional-market'
  | 'store'
  | 'school'
  | 'park';

export const AMENITY_INGEST_SOURCE: Record<AmenitySourceKey, string> = {
  'ev-charger': 'amenity-ev-charger',
  'traditional-market': 'amenity-traditional-market',
  'store': 'amenity-store',
  'school': 'amenity-school',
  'park': 'amenity-park',
};
