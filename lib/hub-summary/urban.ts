import { prisma } from '@/lib/db';
import { getUrbanCategoryDef } from '@/lib/urban/category';
import type { UrbanListFilter } from '@/lib/urban/category';
import { getUrbanList } from '@/lib/urban/list';
import type { HubSummaryData } from './types';

// Parking/Park/EvCharger 모델에 sigunguCode 컬럼이 없어 주소 기반 필터만 가능.
// 스코프 한정이 어렵기 때문에 전국 집계로 처리하고 문장에 "전국 기준" 명시.
async function urbanHighlights(slug: string, filter: UrbanListFilter): Promise<string[] | undefined> {
  void filter; // 주소 기반 필터는 현재 미구현 — 전국 집계로 대체
  try {
    const nf = (n: number) => n.toLocaleString('ko-KR');

    if (slug === 'parking') {
      const rows = await prisma.parking.groupBy({ by: ['prkplceSe'], _count: { _all: true } });
      const total = rows.reduce((s, r) => s + r._count._all, 0);
      const pub = rows.find((r) => r.prkplceSe && r.prkplceSe.includes('공영'))?._count._all ?? 0;
      if (total > 0 && pub > 0) {
        return [`전국 기준, 공영 주차장이 약 ${Math.round((pub / total) * 100)}% 비중입니다.`];
      }
      return undefined;
    }

    if (slug === 'charger') {
      const rows = await prisma.evCharger.groupBy({
        by: ['chargeSpeed'],
        _count: { _all: true },
        _sum: { chargerCount: true },
      });
      const total = rows.reduce((s, r) => s + r._count._all, 0);
      const fast = rows.find((r) => r.chargeSpeed && r.chargeSpeed.includes('급속'))?._count._all ?? 0;
      const units = rows.reduce((s, r) => s + (r._sum.chargerCount ?? 0), 0);
      if (total > 0) {
        return [`전국 기준, 급속 충전소가 약 ${Math.round((fast / total) * 100)}%, 총 충전기는 ${nf(units)}기입니다.`];
      }
      return undefined;
    }

    if (slug === 'park') {
      const [kinds, agg] = await Promise.all([
        prisma.park.groupBy({ by: ['parkType'], where: { parkType: { not: null } }, _count: { _all: true } }),
        prisma.park.aggregate({ where: { area: { gt: 0 } }, _avg: { area: true } }),
      ]);
      const top = kinds
        .map((k) => ({ n: k.parkType as string, c: k._count._all }))
        .sort((a, b) => b.c - a.c)
        .slice(0, 3);
      const out: string[] = [];
      if (top.length) {
        out.push(`전국 기준, 유형별로는 ${top.map((k) => `${k.n} ${nf(k.c)}곳`).join('·')} 등이 있습니다.`);
      }
      if (agg._avg.area != null) {
        out.push(`전국 기준, 평균 면적은 약 ${nf(Math.round(agg._avg.area))}㎡입니다.`);
      }
      return out.length ? out : undefined;
    }

    return undefined;
  } catch (e) {
    console.error(`urbanHighlights(${slug}) failed`, e);
    return undefined;
  }
}

export async function getUrbanHubSummary(
  slug: string,
  categoryLabel: string,
  filter: UrbanListFilter,
  scopeLabel: string,
): Promise<HubSummaryData | null> {
  try {
    const def = getUrbanCategoryDef(slug);
    if (!def) return null;

    // 시군구 스코프: 하위 분포 없음 → 총계만
    if (filter.sigunguCode) {
      const { total } = await getUrbanList(slug, filter, 1);
      if (total <= 0) return null;
      return {
        kind: 'amenity', categoryLabel, scopeLabel, scopeLevel: 'sigungu', total, topRegions: [],
        highlights: await urbanHighlights(slug, filter),
      };
    }

    const groups = (await def.getRegionBreakdown(filter)).sort((a, b) => b.count - a.count);

    // 분포 데이터 없음(모델에 sigunguCode 컬럼 미보유) → 실제 총계로 sido 요약만 반환
    if (groups.length === 0) {
      const { total: realTotal } = await getUrbanList(slug, filter, 1);
      if (realTotal <= 0) return null;
      return {
        kind: 'amenity', categoryLabel, scopeLabel, scopeLevel: 'sido', total: realTotal, topRegions: [],
        highlights: await urbanHighlights(slug, filter),
      };
    }

    const total = groups.reduce((s, g) => s + g.count, 0);
    if (total <= 0) return null;

    // 분포가 비었으면(코드 미보유) 총계 문장만 → sido 스코프이되 topRegions=[]로 폴백
    if (groups.length < 3) {
      return {
        kind: 'amenity', categoryLabel, scopeLabel, scopeLevel: 'sido', total, topRegions: [],
        highlights: await urbanHighlights(slug, filter),
      };
    }

    const top = groups.slice(0, 3);
    const regions = await prisma.region.findMany({
      where: { sigunguCode: { in: top.map((t) => t.sigunguCode) }, level: 2, isAbolished: false },
      select: { sigunguCode: true, sigungu: true },
    });
    const nameOf = (code: string) => regions.find((r) => r.sigunguCode === code)?.sigungu ?? code;
    const top3 = top.reduce((s, g) => s + g.count, 0);
    return {
      kind: 'amenity', categoryLabel, scopeLabel, scopeLevel: 'sido', total,
      topRegions: top.map((g) => ({ name: nameOf(g.sigunguCode), count: g.count })),
      concentrationPct: Math.round((top3 / total) * 100),
      highlights: await urbanHighlights(slug, filter),
    };
  } catch (e) {
    console.error(`getUrbanHubSummary(${slug}) failed`, e);
    return null;
  }
}
