import type {
  NearbyStore, NearbyHospital, NearbyPharmacy, NearbyPark,
  NearbyTraditionalMarket, NearbyEvCharger, NearbyParking, NearbyChildcare,
} from '@/lib/amenity/nearby';

/** 카테고리별 DB fetch 상한. 화면 cap(5)과 별개로, 이 수에 도달하면 개수 배지를 'N+'로 표기. */
export const INFRA_FETCH_LIMIT = 12;

export interface InfraItem {
  id: string;
  name: string;
  sub: string | null;
  distanceMeters: number;
}

export type InfraCategoryKey =
  | 'store' | 'cafe' | 'hospital' | 'pharmacy' | 'park'
  | 'market' | 'charger' | 'parking' | 'childcare' | 'etc';

export interface InfraCategory {
  key: InfraCategoryKey;
  label: string;
  icon: string;
  radiusLabel: string;
  items: InfraItem[];
  capped: boolean;
}

export interface RawInfra {
  stores: NearbyStore[];
  hospitals: NearbyHospital[];
  pharmacies: NearbyPharmacy[];
  parks: NearbyPark[];
  markets: NearbyTraditionalMarket[];
  chargers: NearbyEvCharger[];
  parking: NearbyParking[];
  childcare?: NearbyChildcare[];
}

const MART_PREFIXES = ['G20405', 'G20404', 'G20402'];
const CAFE_PREFIXES = ['I21201'];
// 병원(Q101)·의원/한의원(Q102)·약국(G21501)은 전용 카테고리(병원/약국)로 노출되므로 기타에서 제외.
const MEDICAL_PREFIXES = ['Q101', 'Q102', 'G21501'];

export function classifyStore(industryCode: string | null): 'mart' | 'cafe' | 'medical' | 'etc' {
  const c = industryCode ?? '';
  if (MART_PREFIXES.some((p) => c.startsWith(p))) return 'mart';
  if (CAFE_PREFIXES.some((p) => c.startsWith(p))) return 'cafe';
  if (MEDICAL_PREFIXES.some((p) => c.startsWith(p))) return 'medical';
  return 'etc';
}

function parkSub(p: NearbyPark): string | null {
  if (p.parkType && p.area) return `${p.parkType} · ${Math.round(p.area).toLocaleString()}㎡`;
  return p.parkType ?? null;
}

function parkingSub(p: NearbyParking): string | null {
  const parts = [p.prkplceSe, p.prkcmprt ? `${p.prkcmprt}면` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export function buildInfraCategories(raw: RawInfra): InfraCategory[] {
  const mart = raw.stores.filter((s) => classifyStore(s.industryCode) === 'mart');
  const cafe = raw.stores.filter((s) => classifyStore(s.industryCode) === 'cafe');
  // 'medical' Store는 의도적으로 제외 — 병원/약국은 Hospital/Pharmacy 전용 카테고리로 노출됨.
  const etc = raw.stores.filter((s) => classifyStore(s.industryCode) === 'etc');

  const cats: Omit<InfraCategory, 'capped'>[] = [
    { key: 'store', label: '편의·마트', icon: '🛒', radiusLabel: '반경 500m 내',
      items: mart.map((s) => ({ id: String(s.id), name: s.name, sub: s.industryName ?? null, distanceMeters: s.distanceMeters })) },
    { key: 'cafe', label: '카페', icon: '☕', radiusLabel: '반경 500m 내',
      items: cafe.map((s) => ({ id: String(s.id), name: s.name, sub: s.industryName ?? null, distanceMeters: s.distanceMeters })) },
    { key: 'hospital', label: '병원', icon: '🏥', radiusLabel: '반경 500m 내',
      items: raw.hospitals.map((h) => ({ id: String(h.id), name: h.name, sub: h.typeName ?? null, distanceMeters: h.distanceMeters })) },
    { key: 'pharmacy', label: '약국', icon: '💊', radiusLabel: '반경 500m 내',
      items: raw.pharmacies.map((p) => ({ id: String(p.id), name: p.name, sub: p.address ?? null, distanceMeters: p.distanceMeters })) },
    { key: 'park', label: '공원', icon: '🌳', radiusLabel: '반경 1km 내',
      items: raw.parks.map((p) => ({ id: String(p.id), name: p.name, sub: parkSub(p), distanceMeters: p.distanceMeters })) },
    { key: 'market', label: '전통시장', icon: '🏬', radiusLabel: '반경 1km 내',
      items: raw.markets.map((m) => ({ id: String(m.id), name: m.name, sub: m.marketType ?? null, distanceMeters: m.distanceMeters })) },
    { key: 'charger', label: '전기차 충전소', icon: '⚡', radiusLabel: '반경 500m 내',
      items: raw.chargers.map((c) => ({ id: String(c.id), name: c.name, sub: `${c.chargeSpeed} · ${c.chargerCount}기`, distanceMeters: c.distanceMeters })) },
    { key: 'parking', label: '주차장', icon: '🅿️', radiusLabel: '반경 500m 내',
      items: raw.parking.map((p) => ({ id: String(p.id), name: p.name, sub: parkingSub(p), distanceMeters: p.distanceMeters })) },
    { key: 'childcare', label: '어린이집', icon: '👶', radiusLabel: '반경 1km 내',
      items: (raw.childcare ?? []).map((c) => ({ id: String(c.id), name: c.name, sub: c.crType ?? null, distanceMeters: c.distanceMeters })) },
    { key: 'etc', label: '기타 생활편의', icon: '🏪', radiusLabel: '반경 500m 내',
      items: etc.map((s) => ({ id: String(s.id), name: s.name, sub: s.industryName ?? null, distanceMeters: s.distanceMeters })) },
  ];

  return cats
    .filter((c) => c.items.length > 0)
    .map((c) => ({ ...c, capped: c.items.length >= INFRA_FETCH_LIMIT }));
}
