import { prisma } from '@/lib/db';
import { sidoFromPrefix } from '@/lib/region';
import { Prisma } from '@prisma/client';
import type { HubSummaryData } from './types';

const nf = (n: number) => n.toLocaleString('ko-KR');

export async function getSchoolHubSummary(region?: string): Promise<HubSummaryData | null> {
  try {
    const where: Prisma.SchoolWhereInput = region ? { sigunguCode: region } : { sigunguCode: { not: null } };

    // 시도 분포 (sigunguCode 앞2자리)
    const distRows = await prisma.$queryRaw<Array<{ sido_code: string; cnt: number }>>`
      SELECT substring("sigunguCode" from 1 for 2) AS sido_code, COUNT(*)::int AS cnt
      FROM "School" WHERE "sigunguCode" IS NOT NULL ${region ? Prisma.sql`AND "sigunguCode" = ${region}` : Prisma.empty}
      GROUP BY 1 ORDER BY cnt DESC
    `;
    const dist = distRows.map((r) => ({ name: sidoFromPrefix(r.sido_code) ?? r.sido_code, count: r.cnt }));
    const total = dist.reduce((s, r) => s + r.count, 0);
    if (total <= 0) return null;

    // 하이라이트: 학교급 분포 + 공/사립
    const [kinds, founds] = await Promise.all([
      prisma.school.groupBy({ by: ['schoolKind'], where, _count: { _all: true } }),
      prisma.school.groupBy({ by: ['foundType'], where, _count: { _all: true } }),
    ]);
    const highlights: string[] = [];
    const kindTop = kinds
      .filter((k) => k.schoolKind)
      .map((k) => ({ n: k.schoolKind as string, c: k._count._all }))
      .sort((a, b) => b.c - a.c)
      .slice(0, 4);
    if (kindTop.length > 0) {
      highlights.push(`학교급별로는 ${kindTop.map((k) => `${k.n} ${nf(k.c)}곳`).join('·')} 등으로 구성됩니다.`);
    }
    // '공립'+'국립' 합산 (lib/school.ts 공립 필터 기준 준용)
    const pub = founds
      .filter((f) => f.foundType === '공립' || f.foundType === '국립')
      .reduce((s, f) => s + f._count._all, 0);
    const priv = founds.find((f) => f.foundType === '사립')?._count._all ?? 0;
    if (pub + priv > 0) {
      const pubPct = Math.round((pub / (pub + priv)) * 100);
      highlights.push(`공립이 약 ${pubPct}%, 사립이 약 ${100 - pubPct}% 비중입니다.`);
    }

    const top = dist.slice(0, 3);
    const top3 = top.reduce((s, r) => s + r.count, 0);
    const scopeLevel = region ? 'sigungu' : 'nation';
    return {
      kind: 'medical',
      categoryLabel: '학교',
      scopeLabel: region ? '해당 지역' : '전국',
      scopeLevel,
      total,
      topRegions: region ? [] : top,
      concentrationPct: region ? undefined : Math.round((top3 / total) * 100),
      highlights: highlights.length ? highlights : undefined,
    };
  } catch (e) {
    console.error('getSchoolHubSummary failed', e);
    return null;
  }
}
