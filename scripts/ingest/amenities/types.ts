// scripts/ingest/amenities/types.ts

export interface NormalizedEvCharger {
  sourceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  chargeSpeed: string;     // "급속" | "완속"
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

export type AmenitySourceKey = 'ev-charger' | 'traditional-market' | 'store';

export const AMENITY_INGEST_SOURCE: Record<AmenitySourceKey, string> = {
  'ev-charger': 'amenity-ev-charger',
  'traditional-market': 'amenity-traditional-market',
  'store': 'amenity-store',
};
