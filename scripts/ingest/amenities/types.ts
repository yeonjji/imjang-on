// scripts/ingest/amenities/types.ts

export interface NormalizedEvCharger {
  sourceId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
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
  lat: number | null;
  lng: number | null;
  marketType: string | null;
}

export interface NormalizedStore {
  sourceId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  industryCode: string | null;
  industryName: string | null;
  sigunguCode: string;
}

export interface NormalizedPark {
  sourceId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  parkType: string | null;
  area: number | null;
}

export interface NormalizedSchool {
  sourceId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  schoolKind: string | null;
  foundType: string | null;
  coeduType: string | null;
  region: string | null;
  eduOffice: string | null;
  tel: string | null;
  homepage: string | null;
}

export type AmenitySourceKey =
  | 'ev-charger'
  | 'traditional-market'
  | 'store'
  | 'park'
  | 'school';

export const AMENITY_INGEST_SOURCE: Record<AmenitySourceKey, string> = {
  'ev-charger': 'amenity-ev-charger',
  'traditional-market': 'amenity-traditional-market',
  'store': 'amenity-store',
  'park': 'amenity-park',
  'school': 'amenity-school',
};
