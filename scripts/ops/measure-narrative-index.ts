/**
 * 색인 영향 측정. **읽기 전용.** 매칭·역채움 전후로 돌려 비교한다.
 *
 *   pnpm exec dotenv -e .env.local -- tsx scripts/ops/measure-narrative-index.ts
 *
 * 두 가지를 잰다.
 *  (1) 역채움이 fired 개수를 늘리는가 — SQL로 증명. 기대값 0.
 *  (2) INDEX_SIGNAL_KEYS 화이트리스트로 바꾸면 몇 개가 색인에서 빠지는가 — 표본 추정.
 */
import { prisma } from '@/lib/db';
import { loadAptInsight } from '@/lib/insights/apt-loader';
import { isNarrativeIndexable } from '@/lib/seo/indexable';

/** 후속 스펙이 쓸 화이트리스트. 실거래 기반 신호만. */
const INDEX_SIGNAL_KEYS = ['trend', 'peer', 'floor', 'flags'];
const SAMPLE_SIZE = Number(process.env.SAMPLE_SIZE ?? 2000);

async function main() {
  // (1) bScale은 builtYear나 households 중 하나만 있어도 발화한다.
  //     builtYear가 없는 아파트가 0이면 역채움으로 새로 발화하는 페이지는 존재할 수 없다.
  const noBuiltYear = await prisma.property.count({
    where: { propertyType: 'APARTMENT', redirectToId: null, builtYear: null },
  });
  console.log('=== (1) 역채움의 색인 영향 ===');
  console.log(`builtYear가 없는 아파트: ${noBuiltYear}`);
  console.log(
    noBuiltYear === 0
      ? '→ bScale은 이미 100% 발화 중. households 역채움으로 fired가 늘어나는 페이지는 0건이다. ✅'
      : `→ ⚠️ ${noBuiltYear}건은 역채움으로 새로 발화할 수 있다. 스펙의 전제가 깨졌으므로 중단하고 재검토할 것.`,
  );

  // (2) 화이트리스트 전환 시뮬레이션 — 표본.
  const sample = await prisma.property.findMany({
    where: { propertyType: 'APARTMENT', redirectToId: null },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: SAMPLE_SIZE,
  });

  let nowIndexable = 0;
  let stillIndexable = 0;
  const keyCount = new Map<string, number>();

  for (const { id } of sample) {
    const res = await loadAptInsight(id).catch(() => null);
    const narrative = res?.narrative ?? null;
    if (!narrative) continue;
    for (const k of narrative.fired) keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
    if (!isNarrativeIndexable(narrative, 3)) continue;
    nowIndexable++;
    const signals = narrative.fired.filter((k) => INDEX_SIGNAL_KEYS.includes(k)).length;
    if (signals >= 3) stillIndexable++;
  }

  console.log(`\n=== (2) 화이트리스트 전환 영향 (표본 ${sample.length}) ===`);
  console.log(`현재 색인 대상: ${nowIndexable}`);
  console.log(`전환 후 유지:   ${stillIndexable}`);
  const drop = nowIndexable - stillIndexable;
  console.log(
    `색인에서 빠짐: ${drop} (색인 대상 대비 ${nowIndexable ? Math.round((drop / nowIndexable) * 100) : 0}%)`,
  );
  console.log('\n모듈별 발화 수:');
  for (const [k, v] of [...keyCount].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(8)} ${v}`);
  }
  console.log('\n⚠️ (2)는 표본 추정이다. 전수가 아니므로 후속 스펙에서 규모를 다시 확인할 것.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
