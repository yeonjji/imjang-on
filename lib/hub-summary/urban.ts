import { prisma } from '@/lib/db';
import { getUrbanCategoryDef } from '@/lib/urban/category';
import type { UrbanListFilter } from '@/lib/urban/category';
import { getUrbanList } from '@/lib/urban/list';
import type { HubSummaryData } from './types';

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
      return { kind: 'amenity', categoryLabel, scopeLabel, scopeLevel: 'sigungu', total, topRegions: [] };
    }

    const groups = (await def.getRegionBreakdown(filter)).sort((a, b) => b.count - a.count);
    const total = groups.reduce((s, g) => s + g.count, 0);
    if (total <= 0) return null;

    // 분포가 비었으면(코드 미보유) 총계 문장만 → sido 스코프이되 topRegions=[]로 폴백
    if (groups.length < 3) {
      return { kind: 'amenity', categoryLabel, scopeLabel, scopeLevel: 'sido', total, topRegions: [] };
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
    };
  } catch (e) {
    console.error(`getUrbanHubSummary(${slug}) failed`, e);
    return null;
  }
}
