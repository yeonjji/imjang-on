import { Prisma } from '@prisma/client';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';

// kind → 테이블명. 값은 코드에 박힌 리터럴만 쓰이므로 Prisma.raw 보간이 안전하다.
// 카페·마트·편의점은 모두 Store 한 테이블을 쓰므로 kind도 'store' 하나로 합친다.
const MAP_ENTITY_TABLES = {
  property: 'Property',
  subscription: 'SubscriptionNotice',
  school: 'School',
  hospital: 'Hospital',
  pharmacy: 'Pharmacy',
  childcare: 'Childcare',
  park: 'Park',
  parking: 'Parking',
  charger: 'EvCharger',
  store: 'Store',
  market: 'TraditionalMarket',
} as const;

export type MapEntityKind = keyof typeof MAP_ENTITY_TABLES;

export function isMapEntityKind(value: string): value is MapEntityKind {
  return Object.prototype.hasOwnProperty.call(MAP_ENTITY_TABLES, value);
}

/** URL 세그먼트는 kind마다 타입이 달라 불투명 문자열로 받고 여기서 파싱한다. */
export function parseMapEntityId(raw: string): bigint | null {
  // 18자리까지만 허용: int8 최댓값(9223372036854775807, 19자리)을 넘지 않는 안전한 상한.
  if (!/^\d{1,18}$/.test(raw)) return null;
  return BigInt(raw);
}

async function queryLatLng(
  kind: MapEntityKind,
  id: bigint,
): Promise<{ lat: number; lng: number } | null> {
  const table = Prisma.raw(`"${MAP_ENTITY_TABLES[kind]}"`);
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM ${table} WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

/** 이미지 라우트가 요청마다 DB를 때리지 않도록 엔티티당 24시간 캐시한다. */
export function getMapEntityLatLng(
  kind: MapEntityKind,
  id: bigint,
): Promise<{ lat: number; lng: number } | null> {
  return unstable_cache(
    () => queryLatLng(kind, id),
    ['map-entity-latlng', kind, String(id)],
    { revalidate: 86_400 },
  )();
}
