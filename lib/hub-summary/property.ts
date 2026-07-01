import { prisma } from '@/lib/db';
import { Prisma, type PropertyType } from '@prisma/client';
import { sidoFromPrefix } from '@/lib/region';
import type { HubSummaryData } from './types';

export async function getPropertyHubStats(
  types: PropertyType[],
  categoryLabel: string,
): Promise<HubSummaryData | null> {
  try {
    const typeList = Prisma.join(types.map((t) => Prisma.sql`${t}::"PropertyType"`));
    const rows = await prisma.$queryRaw<Array<{ sido_code: string; cnt: number }>>`
      SELECT substring("sigunguCode" from 1 for 2) AS sido_code, COUNT(*)::int AS cnt
      FROM "Property"
      WHERE "propertyType" IN (${typeList})
        AND "txCount12m" > 0
        AND "sigunguCode" IS NOT NULL
      GROUP BY 1
      ORDER BY cnt DESC
    `;
    const mapped = rows
      .map((r) => ({ name: sidoFromPrefix(r.sido_code) ?? r.sido_code, count: r.cnt }))
      .filter((r) => r.count > 0);
    const total = mapped.reduce((s, r) => s + r.count, 0);
    if (total <= 0) return null;
    const top = mapped.slice(0, 3);
    const top3 = top.reduce((s, r) => s + r.count, 0);
    return {
      kind: 'property',
      categoryLabel,
      scopeLabel: '전국',
      scopeLevel: 'nation',
      total,
      topRegions: top,
      concentrationPct: Math.round((top3 / total) * 100),
    };
  } catch (e) {
    console.error('getPropertyHubStats failed', e);
    return null;
  }
}
