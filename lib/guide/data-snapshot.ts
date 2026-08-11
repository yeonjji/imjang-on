import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

/**
 * 실거래(`Transaction` 7.6M행)에 기대는 블록만 스냅샷을 쓴다.
 * 가벼운 블록 4종(`lib/guide/blocks/*.ts`)은 렌더 시 직접 조회한다.
 */
export const HEAVY_BLOCK_KEYS = [
  'area-price',
  'floor-premium',
  'price-trend-24m',
  'subway-premium',
  'ltv-by-region',
] as const;

export type HeavyBlockKey = (typeof HEAVY_BLOCK_KEYS)[number];

/** `area-price` → `guide_area_price`. `DashboardSnapshot.key`는 VarChar(40)이고 홈 키와 섞이면 안 된다. */
export function guideSnapshotKey(block: HeavyBlockKey): string {
  return `guide_${block.replace(/-/g, '_')}`;
}

export const GUIDE_SNAPSHOT_KEYS = HEAVY_BLOCK_KEYS.map(guideSnapshotKey);

/** ETL에서 호출: 계산된 payload를 스냅샷 테이블에 올린다. */
export async function writeGuideSnapshot(block: HeavyBlockKey, payload: unknown): Promise<void> {
  const key = guideSnapshotKey(block);
  // Prisma의 Json 입력 타입은 인터페이스를 직접 받지 못하므로 InputJsonValue로 캐스팅한다.
  const json = payload as unknown as Prisma.InputJsonValue;
  await prisma.dashboardSnapshot.upsert({
    where: { key },
    create: { key, payload: json },
    update: { payload: json },
  });
}

/** 렌더에서 호출: 사전계산된 스냅샷을 즉시 읽는다. 없으면 null → 블록은 아무것도 그리지 않는다. */
export async function readGuideSnapshot<T>(block: HeavyBlockKey): Promise<T | null> {
  const row = await prisma.dashboardSnapshot.findUnique({ where: { key: guideSnapshotKey(block) } });
  return (row?.payload as unknown as T) ?? null;
}
