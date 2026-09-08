/**
 * 공동주택 단지정보 수집 러너.
 *
 *   pnpm exec dotenv -e .env.local -- tsx scripts/ingest/apt-complex/runner.ts --mode=list
 *   pnpm exec dotenv -e .env.local -- tsx scripts/ingest/apt-complex/runner.ts --mode=detail [--limit=N]
 *
 * 1단계(수집)만 담는다. 매칭 모드(audit·match)는 2단계에서 추가한다.
 * 이 단계는 화면에 아무것도 노출하지 않으므로 revalidate를 호출하지 않는다.
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { fetchAptListPage, fetchAptBasis, fetchAptDetail, QuotaExceededError } from './http';
import { parseAptList, parseAptDetail, areaSumMatches } from './adapter';
import { decideMatch, type MatchCandidate } from './match';
import { APT_COMPLEX_SOURCE } from './types';

const LIST_PAGE_SIZE = 1000;
const MAX_LIST_PAGES = 50; // 22,301건 기준 23페이지. 안전장치.

/**
 * 목록 upsert. 스냅샷 교체(deleteMany+createMany)를 쓰지 않는다 —
 * 목록 재수집이 이미 채운 상세 필드를 날려버린다.
 */
export async function runList(): Promise<number> {
  let pageNo = 1;
  let upserted = 0;
  let totalCount = 0;

  while (pageNo <= MAX_LIST_PAGES) {
    const payload = await fetchAptListPage(pageNo, LIST_PAGE_SIZE);
    const { rows, totalCount: tc } = parseAptList(payload);
    if (tc > 0) totalCount = tc;
    if (rows.length === 0) break;

    for (const r of rows) {
      await prisma.aptComplex.upsert({
        where: { kaptCode: r.kaptCode },
        create: r,
        update: {
          kaptName: r.kaptName,
          nameNorm: r.nameNorm,
          bjdCode: r.bjdCode,
          sigunguCode: r.sigunguCode,
          as3: r.as3,
        },
      });
      upserted++;
    }
    logger.info({ pageNo, rows: rows.length, upserted, totalCount }, 'apt-complex list page');
    if (totalCount > 0 && upserted >= totalCount) break;
    pageNo++;
  }

  // API 일시 오류로 목록이 통째로 비는 사고를 막는다.
  if (upserted === 0) throw new Error('parsed 0 rows — refusing to proceed');
  return upserted;
}

const DETAIL_CONCURRENCY = 4;

/**
 * 상세 수집. 대상은 `fetchedAt IS NULL`(미수집분)이라 며칠에 걸쳐 나눠 돌려도 수렴한다.
 * 한도 초과를 만나면 모든 워커를 즉시 세운다 — 계속 두드리면 차단당한다.
 *
 * 단건당 API 2회라 순차로는 4시간이 넘는다(22,301 × 2 × ~330ms, 실측). 소규모 워커로
 * 나눈다. 동시성을 크게 잡지 않는 건 이 API가 부하에 약하기 때문이다 —
 * 설계 중 시군구 30개 조회에서 13개가 타임아웃한 실측이 있다.
 */
export async function runDetail(limit?: number, concurrency = DETAIL_CONCURRENCY): Promise<number> {
  const targets = await prisma.aptComplex.findMany({
    where: { fetchedAt: null },
    select: { kaptCode: true },
    orderBy: { kaptCode: 'asc' },
    ...(limit ? { take: limit } : {}),
  });
  logger.info({ targets: targets.length, concurrency }, 'apt-complex detail targets');

  let done = 0;
  let next = 0;
  let quotaHit = false;

  async function worker(): Promise<void> {
    for (;;) {
      if (quotaHit) return;
      const i = next++;
      if (i >= targets.length) return;
      const { kaptCode } = targets[i];
      try {
        // 레코드 안에서 병렬로 부르지 않는다. 워커 수 × 2가 되어 순간 동시 요청이
        // 두 배가 되고, 그러면 429가 난다(운영 실측: 워커 4 × 병렬 2 = 동시 8 → 429 다발).
        const basis = await fetchAptBasis(kaptCode);
        const dtl = await fetchAptDetail(kaptCode);
        const row = parseAptDetail(kaptCode, basis, dtl);
        const { kaptCode: _key, rawJson, ...fields } = row;
        await prisma.aptComplex.update({
          where: { kaptCode },
          data: { ...fields, rawJson: rawJson as object, fetchedAt: new Date() },
        });
        done++;
        if (done % 500 === 0) {
          logger.info({ done, of: targets.length }, 'apt-complex detail progress');
        }
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          quotaHit = true;
          logger.warn({ done, remaining: targets.length - done }, 'quota exceeded — stopping');
          await notify('warn', 'apt-complex detail 한도 초과로 중단', {
            done,
            remaining: targets.length - done,
          });
          return;
        }
        // 단건 실패는 건너뛴다. fetchedAt이 그대로 NULL이라 다음 회차에 재시도된다.
        logger.warn({ err, kaptCode }, 'apt-complex detail skip');
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
  return done;
}

const pct = (n: number, d: number) => (d === 0 ? '0%' : `${Math.round((n / d) * 100)}%`);

/** audit 리포트에 채움률을 낼 필드. 화면 스펙이 노출 기준을 세울 근거다. */
const FILL_FIELDS = [
  'households',
  'buildingCount',
  'usedate',
  'hallType',
  'topFloor',
  'parkingUnder',
  'elevator',
  'cctv',
  'evUnder',
  'subwayStation',
  'builder',
] as const;

/**
 * 매칭. `apply=false`면 아무것도 쓰지 않고 리포트만 낸다.
 * audit과 실행이 **같은 코드 경로**를 쓰는 것이 핵심이다 — 리포트에서 본 것이 곧 반영된다.
 */
export async function runMatch(opts: {
  apply: boolean;
  /** 테스트 전용 — 이 시군구만 대상으로 좁힌다. 운영 실행에서는 주지 않는다. */
  sigunguCodes?: string[];
}): Promise<number> {
  const scope = opts.sigunguCodes?.length ? { sigunguCode: { in: opts.sigunguCodes } } : {};
  // 재실행 시 unique 충돌을 막는다. 이전 회차에서 단지 B가 잡던 propertyId를 이번에
  // A가 가져가면 A를 먼저 쓸 때 B의 기존 값과 부딪힌다. 전량 해제 후 재배정한다.
  // 해제 전 이전 매칭을 기록해 둔다 — 이번에 떨어진 Property의 역채움을 되돌리기 위해서다.
  let previouslyMatched: bigint[] = [];
  if (opts.apply) {
    previouslyMatched = (
      await prisma.aptComplex.findMany({
        where: { propertyId: { not: null }, ...scope },
        select: { propertyId: true },
      })
    ).map((r) => r.propertyId!);
    await prisma.aptComplex.updateMany({
      where: { propertyId: { not: null }, ...scope },
      data: { propertyId: null, matchTier: null, matchedAt: null },
    });
  }

  const complexes = await prisma.aptComplex.findMany({
    where: { inUse: true, ...scope },
    select: {
      kaptCode: true, kaptName: true, as3: true, sigunguCode: true, fetchedAt: true,
      households: true, buildingCount: true, usedate: true, hallType: true, topFloor: true,
      parkingUnder: true, elevator: true, cctv: true, evUnder: true, subwayStation: true,
      builder: true, area60: true, area85: true, area135: true, area136: true,
    },
    orderBy: { kaptCode: 'asc' },
  });

  // 시군구별 Property 후보를 한 번에 올린다(단지마다 쿼리하면 22,301회다).
  const props = await prisma.property.findMany({
    where: {
      propertyType: 'APARTMENT',
      redirectToId: null,
      ...(opts.sigunguCodes?.length ? { sigunguCode: { in: opts.sigunguCodes } } : {}),
    },
    select: { id: true, nameNorm: true, address: true, sigunguCode: true },
  });
  const bySgg = new Map<string, MatchCandidate[]>();
  for (const p of props) {
    if (!p.sigunguCode) continue;
    const list = bySgg.get(p.sigunguCode) ?? [];
    list.push({ id: p.id, nameNorm: p.nameNorm, address: p.address });
    bySgg.set(p.sigunguCode, list);
  }

  let tier1 = 0, tier2 = 0, unmatched = 0, areaOk = 0, fetched = 0;
  const fill = new Map<string, number>(FILL_FIELDS.map((f) => [f, 0]));
  const tier2Samples: string[] = [];
  const unmatchedSamples: string[] = [];
  const taken = new Set<string>();

  for (const c of complexes) {
    if (areaSumMatches(c)) areaOk++;
    if (c.fetchedAt) {
      fetched++;
      for (const f of FILL_FIELDS) if (c[f] != null) fill.set(f, (fill.get(f) ?? 0) + 1);
    }

    const candidates = bySgg.get(c.sigunguCode) ?? [];
    const r = decideMatch({ kaptName: c.kaptName, as3: c.as3 }, candidates);

    // 미매칭은 쓸 것이 없다 — 위에서 전량 해제했으므로 그대로 두면 null이다.
    if (!r || taken.has(String(r.propertyId))) {
      unmatched++;
      if (unmatchedSamples.length < 20) {
        unmatchedSamples.push(`${c.kaptName}(${c.as3 ?? '-'}) [${c.sigunguCode}]`);
      }
      continue;
    }

    taken.add(String(r.propertyId));
    if (r.tier === 1) tier1++;
    else {
      tier2++;
      if (tier2Samples.length < 40) {
        const p = candidates.find((x) => x.id === r.propertyId)!;
        tier2Samples.push(`"${c.kaptName}"(${c.as3}) → "${p.nameNorm}" / ${p.address}`);
      }
    }

    if (opts.apply) {
      await prisma.aptComplex.update({
        where: { kaptCode: c.kaptCode },
        data: { propertyId: r.propertyId, matchTier: r.tier, matchedAt: new Date() },
      });
      // 역채움 — API 값이 null이면 기존 값을 덮어쓰지 않는다.
      const data: { households?: number; buildingCount?: number } = {};
      if (c.households != null) data.households = c.households;
      if (c.buildingCount != null) data.buildingCount = c.buildingCount;
      if (Object.keys(data).length > 0) {
        await prisma.property.update({ where: { id: r.propertyId }, data });
      }
    }
  }

  // 이번에 매칭이 떨어진 Property의 역채움 값을 되돌린다. households의 유일한 출처가
  // 이 ETL이므로 매칭이 사라지면 근거도 사라진다. 안 지우면 잘못된 매칭으로 들어간
  // 값이 조용히 남는다.
  if (opts.apply) {
    const stale = previouslyMatched.filter((id) => !taken.has(String(id)));
    if (stale.length > 0) {
      await prisma.property.updateMany({
        where: { id: { in: stale } },
        data: { households: null, buildingCount: null },
      });
      logger.info({ stale: stale.length }, 'apt-complex 역채움 되돌림');
    }
  }

  const matched = tier1 + tier2;
  console.log(`\n=== apt-complex ${opts.apply ? 'MATCH (적용)' : 'AUDIT (읽기 전용)'} ===`);
  console.log(`단지 ${complexes.length} / 아파트 Property ${props.length}`);
  console.log(`확정 ${matched} (${pct(matched, complexes.length)}) — Tier1 ${tier1} · Tier2 ${tier2}`);
  console.log(`미매칭 ${unmatched} (${pct(unmatched, complexes.length)})`);
  console.log(`Property 커버리지 ${pct(matched, props.length)}`);
  console.log(`면적 4칸 완비 + 합 일치: ${areaOk} (${pct(areaOk, complexes.length)})`);
  console.log(`\n--- 필드 채움률 (상세 수집분 ${fetched}건 기준) ---`);
  for (const f of FILL_FIELDS) {
    console.log(`  ${f.padEnd(16)} ${String(fill.get(f) ?? 0).padStart(6)}  ${pct(fill.get(f) ?? 0, fetched)}`);
  }
  console.log('\n--- Tier2 표본(육안 검수용) ---');
  tier2Samples.forEach((s) => console.log(`  ${s}`));
  console.log('\n--- 미매칭 표본 ---');
  unmatchedSamples.forEach((s) => console.log(`  ${s}`));
  return matched;
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=')[1];
}

const MODES = ['list', 'detail', 'audit', 'match'] as const;
type Mode = (typeof MODES)[number];

function isMode(v: string | undefined): v is Mode {
  return !!v && (MODES as readonly string[]).includes(v);
}

async function main(): Promise<void> {
  const mode = arg('mode');
  if (!isMode(mode)) {
    throw new Error(`--mode=${MODES.join(' | --mode=')} 중 하나여야 한다 (받은 값: ${mode ?? '없음'})`);
  }
  const run = await prisma.ingestionRun.create({
    data: { source: APT_COMPLEX_SOURCE, targetKey: mode, status: 'RUNNING' },
  });
  try {
    let rows: number;
    if (mode === 'list') {
      rows = await runList();
    } else if (mode === 'detail') {
      const raw = arg('limit');
      const limit = raw ? Number(raw) : undefined;
      const rawC = arg('concurrency');
      const conc = rawC ? Number(rawC) : undefined;
      rows = await runDetail(
        Number.isFinite(limit) ? limit : undefined,
        Number.isFinite(conc) && conc ? conc : DETAIL_CONCURRENCY,
      );
    } else {
      rows = await runMatch({ apply: mode === 'match' });
    }
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: rows, finishedAt: new Date() },
    });
    logger.info({ mode, rows }, 'apt-complex done');
    await notify('info', `apt-complex ${mode} complete`, { rows });
  } catch (err) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
    });
    logger.error({ err, mode }, 'apt-complex failed');
    await notify('error', `apt-complex ${mode} failed`, { err: String(err) });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// 직접 실행될 때만 main() (테스트 import 시 실행 방지)
if (process.argv[1] && process.argv[1].includes('apt-complex/runner')) {
  main().catch((err) => {
    logger.error({ err }, 'apt-complex runner fatal');
    process.exit(1);
  });
}
