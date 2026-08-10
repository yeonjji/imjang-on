import { prisma } from '@/lib/db';
import type { HubSummaryData } from './types';

type MedicalKind = 'hospital' | 'pharmacy';

// prisma delegate 타입이 hospital/pharmacy로 갈리므로 분기하여 union 호출을 피한다.
async function sidoGroups(kind: MedicalKind): Promise<{ sido: string | null; _count: { _all: number } }[]> {
  if (kind === 'hospital') {
    const rows = await prisma.hospital.groupBy({ by: ['sido'], where: { sido: { not: null } }, _count: { _all: true } });
    return rows;
  }
  const rows = await prisma.pharmacy.groupBy({ by: ['sido'], where: { sido: { not: null } }, _count: { _all: true } });
  return rows;
}

async function sigunguCount(kind: MedicalKind, sigunguCode: string): Promise<number> {
  if (kind === 'hospital') return prisma.hospital.count({ where: { sigunguCode } });
  return prisma.pharmacy.count({ where: { sigunguCode } });
}

/**
 * 시군구 지역명. **Region 조인은 실무상 항상 실패한다** — Hospital·Pharmacy의 sigunguCode는
 * 심평원 자체 코드 6자리인데(2026-08-10 실측: 두 테이블 전량 length=6, 비숫자 0건)
 * Region.sigunguCode는 법정동 기준 5자리다. 그래서 해당 테이블 자신의 sido/sigungu로 폴백한다.
 *
 * 폴백이 없으면 시군구 스코프 착지점이 전부 "해당 지역 병원·의원은 N곳입니다"로 렌더된다.
 * 패턴 출처: `app/(public)/childcare/[sigunguCode]/page.tsx`의 `resolveRegionDisplay`.
 */
async function resolveScopeLabel(kind: MedicalKind, sigunguCode: string): Promise<string> {
  const region = await prisma.region
    .findFirst({ where: { sigunguCode, level: 2, isAbolished: false }, select: { fullName: true } })
    .catch(() => null);
  if (region?.fullName) return region.fullName;

  const row = kind === 'hospital'
    ? await prisma.hospital.findFirst({ where: { sigunguCode }, select: { sido: true, sigungu: true } })
    : await prisma.pharmacy.findFirst({ where: { sigunguCode }, select: { sido: true, sigungu: true } });
  return [row?.sido, row?.sigungu].filter(Boolean).join(' ') || '해당 지역';
}

export async function getMedicalRegionBreakdown(
  kind: MedicalKind,
  categoryLabel: string,
  region?: string,
): Promise<HubSummaryData | null> {
  try {
    if (region) {
      const total = await sigunguCount(kind, region);
      if (total <= 0) return null;
      return {
        kind: 'medical', categoryLabel,
        scopeLabel: await resolveScopeLabel(kind, region),
        scopeLevel: 'sigungu', total, topRegions: [],
      };
    }

    const groups = await sidoGroups(kind);
    const rows = groups
      .filter((g) => g.sido)
      .map((g) => ({ name: g.sido as string, count: g._count._all }))
      .sort((a, b) => b.count - a.count);
    const total = rows.reduce((s, r) => s + r.count, 0);
    if (total <= 0) return null;
    const top = rows.slice(0, 3);
    const top3 = top.reduce((s, r) => s + r.count, 0);

    let highlights: string[] | undefined;
    if (kind === 'hospital') {
      const typeRows = await prisma.hospital.groupBy({
        by: ['typeName'],
        _count: { _all: true },
      });
      const topTypes = typeRows
        .filter((t): t is typeof t & { typeName: string } => typeof t.typeName === 'string' && t.typeName.length > 0)
        .map(t => ({ n: t.typeName, c: (t._count as { _all: number })._all }))
        .sort((a, b) => b.c - a.c)
        .slice(0, 4);
      if (topTypes.length > 0) {
        highlights = [`종별로는 ${topTypes.map(t => `${t.n} ${t.c.toLocaleString('ko-KR')}곳`).join('·')} 등으로 구성됩니다.`];
      }
    }

    return {
      kind: 'medical', categoryLabel, scopeLabel: '전국', scopeLevel: 'nation',
      total, topRegions: top,
      concentrationPct: Math.round((top3 / total) * 100),
      highlights,
    };
  } catch (e) {
    console.error(`getMedicalRegionBreakdown(${kind}) failed`, e);
    return null;
  }
}
