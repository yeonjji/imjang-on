import { prisma } from '@/lib/db';
import type { HubSummaryData } from './types';

const nf = (n: number) => n.toLocaleString('ko-KR');

const CATEGORY_LABEL: Record<string, string> = {
  APT: '아파트',
  OFFICETEL_ETC: '오피스텔 등',
  REMNANT: '잔여물량',
  PUB_PRIV_RENT: '공공·민간임대',
  ARBITRARY: '임의공급',
  LH_PRESUB: 'LH사전청약',
};

export async function getSubscriptionHubSummary(): Promise<HubSummaryData | null> {
  try {
    const total = await prisma.subscriptionNotice.count();
    if (total <= 0) return null;

    const [byCategory, supply] = await Promise.all([
      prisma.subscriptionNotice.groupBy({ by: ['category'], _count: { _all: true } }),
      prisma.subscriptionNotice.aggregate({ _sum: { totalSupply: true } }),
    ]);

    const catTop = byCategory
      .map((c) => ({ n: CATEGORY_LABEL[String(c.category)] ?? String(c.category), c: c._count._all }))
      .sort((a, b) => b.c - a.c)
      .slice(0, 4);

    const highlights: string[] = [];
    if (catTop.length > 0) {
      highlights.push(`공급유형별로는 ${catTop.map((c) => `${c.n} ${nf(c.c)}건`).join('·')} 등이 있습니다.`);
    }
    if (supply._sum.totalSupply) {
      highlights.push(`집계된 총 공급 규모는 약 ${nf(supply._sum.totalSupply)}세대입니다.`);
    }

    return {
      kind: 'medical',
      categoryLabel: '청약 공고',
      scopeLabel: '전국',
      scopeLevel: 'nation',
      total,
      unit: '건',
      topRegions: [],
      highlights: highlights.length ? highlights : undefined,
    };
  } catch (e) {
    console.error('getSubscriptionHubSummary failed', e);
    return null;
  }
}
