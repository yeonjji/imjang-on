import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type { HubSummaryData } from './types';

const nf = (n: number) => n.toLocaleString('ko-KR');

export async function getChildcareHubSummary(region?: string): Promise<HubSummaryData | null> {
  try {
    const where: Prisma.ChildcareWhereInput = region ? { sigunguCode: region } : {};

    const groups = await prisma.childcare.groupBy({
      by: region ? ['sigunguCode'] : ['sido'],
      where: region ? where : { sido: { not: null } },
      _count: { _all: true },
    });
    const rows = groups
      .map((g) => ({
        name:
          (region
            ? (g as { sigunguCode: string }).sigunguCode
            : (g as { sido: string | null }).sido) ?? '',
        count: g._count._all,
      }))
      .filter((r) => r.name)
      .sort((a, b) => b.count - a.count);
    const total = rows.reduce((s, r) => s + r.count, 0);
    if (total <= 0) return null;

    // 하이라이트: 운영유형 분포 + 평균 정원
    const [types, cap] = await Promise.all([
      prisma.childcare.groupBy({ by: ['crType'], where, _count: { _all: true } }),
      prisma.childcare.aggregate({ where: { ...where, capacity: { gt: 0 } }, _avg: { capacity: true } }),
    ]);
    const highlights: string[] = [];
    const typeTop = types
      .filter((t) => t.crType)
      .map((t) => ({ n: t.crType as string, c: t._count._all }))
      .sort((a, b) => b.c - a.c)
      .slice(0, 4);
    if (typeTop.length > 0) {
      highlights.push(`운영유형별로는 ${typeTop.map((t) => `${t.n} ${nf(t.c)}곳`).join('·')} 등이 있습니다.`);
    }
    if (cap._avg.capacity != null) {
      highlights.push(`평균 정원은 약 ${Math.round(cap._avg.capacity)}명입니다.`);
    }

    const top = rows.slice(0, 3);
    const top3 = top.reduce((s, r) => s + r.count, 0);
    return {
      kind: 'medical',
      categoryLabel: '어린이집',
      scopeLabel: region ? '해당 지역' : '전국',
      scopeLevel: region ? 'sigungu' : 'nation',
      total,
      topRegions: region ? [] : top,
      concentrationPct: region ? undefined : Math.round((top3 / total) * 100),
      highlights: highlights.length ? highlights : undefined,
    };
  } catch (e) {
    console.error('getChildcareHubSummary failed', e);
    return null;
  }
}
