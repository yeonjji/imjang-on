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

export interface NormalizedEvChargerUnit {
  sourceId: string;        // statId-chgerId
  stationSourceId: string; // statId
  chgerId: string;
  chgerType: string;
  isFast: boolean;
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
  | 'park';

export const AMENITY_INGEST_SOURCE: Record<AmenitySourceKey, string> = {
  'ev-charger': 'amenity-ev-charger',
  'traditional-market': 'amenity-traditional-market',
  'store': 'amenity-store',
  'park': 'amenity-park',
};
