import type {
  NearbyStore, NearbyHospital, NearbyPharmacy, NearbyPark,
  NearbyTraditionalMarket, NearbyEvCharger, NearbyParking, NearbyChildcare,
} from '@/lib/amenity/nearby';
import { displayStoreName } from '@/lib/amenity/store-name';

/** 카테고리별 DB fetch 상한. 화면 cap(5)과 별개로, 이 수에 도달하면 개수 배지를 'N+'로 표기. */
export const INFRA_FETCH_LIMIT = 12;

export interface InfraItem {
  id: string;
  name: string;
  sub: string | null;
  distanceMeters: number;
  href: string | null;
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

// 화면 그룹 '편의·마트'는 편의점과 마트를 함께 묶지만, 상세 페이지는 슬러그가 다르다
// (/amenity/convenience vs /amenity/mart). 그룹핑용과 링크용 접두어를 분리해 둔다.
const CONVENIENCE_PREFIXES = ['G20405'];
const MART_ONLY_PREFIXES = ['G20404', 'G20402'];
const MART_PREFIXES = [...CONVENIENCE_PREFIXES, ...MART_ONLY_PREFIXES];
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
      items: mart.map((s) => ({ id: String(s.id), name: displayStoreName(s), sub: s.industryName ?? null, distanceMeters: s.distanceMeters, href: storeHref(s.industryCode, String(s.id)) })) },
    { key: 'cafe', label: '카페', icon: '☕', radiusLabel: '반경 500m 내',
      items: cafe.map((s) => ({ id: String(s.id), name: displayStoreName(s), sub: s.industryName ?? null, distanceMeters: s.distanceMeters, href: storeHref(s.industryCode, String(s.id)) })) },
    { key: 'hospital', label: '병원', icon: '🏥', radiusLabel: '반경 500m 내',
      items: raw.hospitals.map((h) => ({ id: String(h.id), name: h.name, sub: h.typeName ?? null, distanceMeters: h.distanceMeters, href: infraHref('hospital', String(h.id), h.sigunguCode) })) },
    { key: 'pharmacy', label: '약국', icon: '💊', radiusLabel: '반경 500m 내',
      items: raw.pharmacies.map((p) => ({ id: String(p.id), name: p.name, sub: p.address ?? null, distanceMeters: p.distanceMeters, href: infraHref('pharmacy', String(p.id), p.sigunguCode) })) },
    { key: 'park', label: '공원', icon: '🌳', radiusLabel: '반경 1km 내',
      items: raw.parks.map((p) => ({ id: String(p.id), name: p.name, sub: parkSub(p), distanceMeters: p.distanceMeters, href: infraHref('park', String(p.id)) })) },
    { key: 'market', label: '전통시장', icon: '🏬', radiusLabel: '반경 1km 내',
      items: raw.markets.map((m) => ({ id: String(m.id), name: m.name, sub: m.marketType ?? null, distanceMeters: m.distanceMeters, href: infraHref('market', String(m.id)) })) },
    { key: 'charger', label: '전기차 충전소', icon: '⚡', radiusLabel: '반경 500m 내',
      items: raw.chargers.map((c) => ({ id: String(c.id), name: c.name, sub: `${c.chargeSpeed} · ${c.chargerCount}기`, distanceMeters: c.distanceMeters, href: infraHref('charger', String(c.id)) })) },
    { key: 'parking', label: '주차장', icon: '🅿️', radiusLabel: '반경 500m 내',
      items: raw.parking.map((p) => ({ id: String(p.id), name: p.name, sub: parkingSub(p), distanceMeters: p.distanceMeters, href: infraHref('parking', String(p.id)) })) },
    { key: 'childcare', label: '어린이집', icon: '👶', radiusLabel: '반경 1km 내',
      items: (raw.childcare ?? []).map((c) => ({ id: String(c.id), name: c.name, sub: c.crType ?? null, distanceMeters: c.distanceMeters, href: infraHref('childcare', String(c.id), c.sigunguCode) })) },
    { key: 'etc', label: '기타 생활편의', icon: '🏪', radiusLabel: '반경 500m 내',
      items: etc.map((s) => ({ id: String(s.id), name: displayStoreName(s), sub: s.industryName ?? null, distanceMeters: s.distanceMeters, href: storeHref(s.industryCode, String(s.id)) })) },
  ];

  return cats
    .filter((c) => c.items.length > 0)
    .map((c) => ({
      ...c,
      capped: c.items.length >= INFRA_FETCH_LIMIT,
      // distanceMeters는 raw 쿼리에서 Prisma Decimal로 올 수 있어, 클라이언트 컴포넌트
      // 직렬화(Server→Client)를 위해 선언 타입(number)에 맞춰 정규화한다.
      items: c.items.map((it) => ({ ...it, distanceMeters: Number(it.distanceMeters) })),
    }));
}

/**
 * Store.industryCode → 그 업종을 실제로 서빙하는 /amenity 슬러그.
 * 각 어댑터의 목록·상세 게이트와 같은 접두어를 쓴다. 서빙하는 카테고리가 없으면 null.
 */
export function storeAmenitySlug(
  industryCode: string | null,
): 'convenience' | 'mart' | 'cafe' | null {
  const c = industryCode ?? '';
  if (CONVENIENCE_PREFIXES.some((p) => c.startsWith(p))) return 'convenience';
  if (MART_ONLY_PREFIXES.some((p) => c.startsWith(p))) return 'mart';
  if (CAFE_PREFIXES.some((p) => c.startsWith(p))) return 'cafe';
  return null;
}

/**
 * Store 항목의 상세 경로. 업종이 어느 카테고리에도 속하지 않으면(기타 업소·의료 Store)
 * 상세 페이지가 존재하지 않으므로 null → 비클릭.
 */
export function storeHref(industryCode: string | null, id: string): string | null {
  const slug = storeAmenitySlug(industryCode);
  return slug ? `/amenity/${slug}/${id}` : null;
}

/** Store 기반 카테고리는 industryCode로 슬러그가 갈리므로 storeHref를 쓴다. */
type NonStoreInfraKey = Exclude<InfraCategoryKey, 'store' | 'cafe' | 'etc'>;

/** 인프라 항목 → 해당 시설 상세 페이지 경로. sigunguCode가 필요한데 없으면 null(비클릭). */
export function infraHref(
  key: NonStoreInfraKey,
  id: string,
  sigunguCode?: string | null,
): string | null {
  switch (key) {
    case 'market':    return `/amenity/market/${id}`;
    case 'park':      return `/urban/park/${id}`;
    case 'parking':   return `/urban/parking/${id}`;
    case 'charger':   return `/urban/charger/${id}`;
    case 'hospital':  return sigunguCode ? `/medical/hospital/${sigunguCode}/${id}` : null;
    case 'pharmacy':  return sigunguCode ? `/medical/pharmacy/${sigunguCode}/${id}` : null;
    case 'childcare': return sigunguCode ? `/childcare/${sigunguCode}/${id}` : null;
  }
}
