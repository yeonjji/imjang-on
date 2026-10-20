import { prisma } from '@/lib/db';
import { buildBuildingView, type BuildingPropertyType, type BuildingView } from '@/lib/insights/building-register';

const n = (v: { toNumber(): number } | null) => (v === null ? null : v.toNumber());

/** 상세 페이지 건축물 정보. 매칭이 확정된(status='matched') 단지만. */
export async function getBuildingRegisterView(
  propertyId: bigint,
  type: BuildingPropertyType,
  now: Date,
): Promise<BuildingView | null> {
  const r = await prisma.buildingRegister.findUnique({ where: { propertyId } });
  if (!r || r.status !== 'matched') return null;
  return buildBuildingView({ ...r, bcRat: n(r.bcRat), vlRat: n(r.vlRat) }, type, now);
}
