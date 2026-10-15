import { prisma } from '@/lib/db';
import {
  buildMaintenanceView,
  parseManageArea,
  type MaintenanceMonth,
  type MaintenanceView,
} from '@/lib/insights/maintenance-cost';

const num = (v: bigint | null) => (v === null ? null : Number(v));

/** 아파트 상세 관리비 섹션. 연결된 K-apt 단지가 없거나 데이터가 없으면 null. */
export async function getMaintenanceCostView(
  propertyId: bigint,
  sigunguName: string | null,
): Promise<MaintenanceView | null> {
  const complex = await prisma.aptComplex.findUnique({
    where: { propertyId },
    select: { kaptCode: true, households: true, heatType: true, rawJson: true, sigunguCode: true },
  });
  if (!complex) return null;

  const rows = await prisma.aptMaintenanceCost.findMany({
    where: { kaptCode: complex.kaptCode, complete: true },
    orderBy: { yearMonth: 'desc' },
    take: 24,
  });
  const months: MaintenanceMonth[] = rows.map((r) => ({
    yearMonth: r.yearMonth,
    labor: num(r.labor), cleaning: num(r.cleaning), guard: num(r.guard), disinfection: num(r.disinfection),
    elevator: num(r.elevator), homeNetwork: num(r.homeNetwork), consignFee: num(r.consignFee),
    repairs: num(r.repairs), commonEtc: num(r.commonEtc), commonTotal: num(r.commonTotal),
    heat: num(r.heat), hotWater: num(r.hotWater), gas: num(r.gas), electricity: num(r.electricity),
    water: num(r.water), individualEtc: num(r.individualEtc),
    ltrLevy: num(r.ltrLevy), ltrBalance: num(r.ltrBalance),
    ltrRate: r.ltrRate === null ? null : Number(r.ltrRate),
    fetchedAt: r.fetchedAt,
  }));

  const latestYm = months.find((m) => m.commonTotal !== null && m.commonTotal > 0)?.yearMonth;
  const stat = latestYm
    ? await prisma.aptMaintenanceCostStat.findUnique({
        where: { sigunguCode_yearMonth: { sigunguCode: complex.sigunguCode, yearMonth: latestYm } },
        select: { medianCommonPerM2: true, sampleCount: true },
      })
    : null;

  return buildMaintenanceView(
    months,
    {
      households: complex.households,
      heatType: complex.heatType,
      manageArea: parseManageArea(complex.rawJson),
      sigunguName,
    },
    stat,
  );
}
