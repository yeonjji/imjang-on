/**
 * 1회성: "특별공급과 일반공급 차이" 글을 DRAFT로 넣는다. 검수·게시는 /admin/posts.
 *
 * 같은 dedupeKey가 DRAFT로 있으면 본문을 갱신한다(검수 지적 반영용). PUBLISHED면 건드리지 않는다.
 *
 * 실행:
 *   pnpm exec dotenv -e .env.test -- tsx scripts/board/insert-special-vs-general-supply.ts --dry-run
 *   pnpm exec dotenv -e .env.qa.local -- tsx scripts/board/insert-special-vs-general-supply.ts
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { GenerateResult } from '@/lib/board/generate';
import { createDraft } from '@/lib/board/create-draft';
import { runGuardrails } from '@/lib/board/guardrails';

const DEDUPE_KEY = 'manual:special-vs-general-supply';

/**
 * VERIFIED 2026-08-14.
 *
 * [제도] 특별공급은 무주택 요건에 더해 유형별 자격(혼인 기간·자녀 수·부양 기간 등)과 소득·자산 기준을
 *   갖춘 사람에게 별도 물량을 배정한다. 일반공급은 그런 사유 없이 청약통장 요건으로 순위를 가른다.
 *   일반공급 1순위는 지역·전용면적에 따라 가점제와 추첨제 비율이 정해지고, 2순위는 추첨으로 뽑는다.
 *   특별공급은 1세대당 평생 1회 당첨이 원칙이며 한 공고에 중복 신청할 수 없다(예외 규정이 있어 공고문 확인 필요).
 *
 * [주의] 검색에서 "건설물량의 5~30%"라는 서술을 봤으나 현행 근거를 특정하지 못해 본문에 넣지 않았다.
 *   대신 우리 실측 배분만 쓴다.
 *
 * [실측] 운영 DB 읽기전용, 2026-08-14.
 *   대상: 최근 12개월 안에 접수를 시작한 category='APT' 공고 중 공급 세대가 집계된 362건.
 *   특별공급 계 82,276 / 일반공급 계 76,698 → 특공 비중 51.8%
 *   공고별 특공 비율: 중앙값 52.4% / 하위 25% 43.9% / 상위 25% 57.2%
 *   특공이 0인 공고 32건, 특공이 일반보다 많은 공고 207건(362건 중)
 *
 * [검산] 82,276 + 76,698 = 158,974. 82,276 / 158,974 = 51.75% → 51.8%
 *        207 / 362 = 57.2%
 */
const SOURCE = {
  sourceName: '청약홈(한국부동산원)·국토교통부',
  sourceUrl: 'https://www.applyhome.co.kr',
  sourceDate: new Date('2026-08-14T00:00:00+09:00'),
  detectedFrom: 'manual:special-vs-general-supply',
  sourceExcerpt: `[제도 구분] 특별공급은 무주택 요건에 더해 유형별 자격(혼인 기간, 자녀 수, 부양 기간 등)과 소득·자산 기준을 갖춘 신청자에게 별도 물량을 배정하는 방식이다. 일반공급은 그러한 사유 없이 청약통장 가입 기간과 납입 요건으로 1·2순위를 가른다. 일반공급 1순위는 지역과 전용면적에 따라 정해진 비율로 가점제와 추첨제를 적용하고, 2순위는 추첨으로 당첨자를 선정한다. 특별공급은 1세대당 평생 1회 당첨이 원칙이고 한 공고에 중복 신청할 수 없다(예외 규정이 있어 공고문 확인이 필요하다).
[실측] 임장ON이 청약홈에서 수집·보관 중인 입주자모집공고 집계(2026-08-14 기준). 최근 12개월 안에 접수를 시작한 아파트 공고 중 공급 세대가 집계된 362건이 대상. 특별공급 합계 82,276세대, 일반공급 합계 76,698세대로 특별공급 비중은 51.8%. 공고별 특별공급 비율은 중앙값 52.4%, 하위 25% 43.9%, 상위 25% 57.2%. 특별공급이 한 세대도 없는 공고가 32건, 특별공급이 일반공급보다 많은 공고가 207건이다.`,
} as const;

const GEN: GenerateResult = {
  type: 'PROGRAM',
  category: 'SUBSCRIPTION',
  title: '특별공급과 일반공급, 무엇이 다를까 — 요건·선정 방식·물량까지',
  summary:
    '같은 아파트 청약이라도 특별공급과 일반공급은 신청 자격과 당첨자를 뽑는 방법이 다릅니다. 두 방식의 차이를 정리하고, 최근 1년 아파트 공고에서 물량이 실제로 어떻게 나뉘었는지 집계했습니다.',
  body: `아파트 청약 공고를 열면 같은 단지에 특별공급과 일반공급이 따로 적혀 있습니다. 두 방식은 신청할 수 있는 사람도, 당첨자를 뽑는 방법도 다릅니다.

## 신청 자격이 다릅니다

**특별공급**은 무주택 요건에 더해 유형별 자격을 갖춘 사람만 신청할 수 있습니다. 신혼부부는 혼인 기간, 다자녀가구는 미성년 자녀 수, 노부모부양은 부양 기간처럼 유형마다 조건이 정해져 있고, 소득과 자산 기준이 함께 붙는 경우가 많습니다.

**일반공급**은 그런 사유를 따지지 않습니다. 대신 청약통장 가입 기간과 납입 요건으로 1순위와 2순위를 나눕니다. 자격 심사 대신 순위 경쟁으로 들어가는 방식입니다.

## 당첨자를 뽑는 방법이 다릅니다

특별공급은 자격을 갖춘 신청자끼리 경쟁합니다. 유형별로 정해진 기준에 따라 순위를 매기고, 같은 순위 안에서 경쟁이 생기면 추첨으로 가립니다.

일반공급은 순위부터 갈립니다. **1순위**는 지역과 전용면적에 따라 정해진 비율로 **가점제와 추첨제**를 함께 적용합니다. 가점제는 무주택 기간, 부양가족 수, 청약통장 가입 기간을 점수로 환산해 높은 사람부터 뽑는 방식입니다. **2순위**는 추첨으로 정합니다.

즉 특별공급은 "조건을 충족했는가"가 먼저이고, 일반공급은 "점수가 높은가 또는 운이 좋은가"가 갈림길입니다.

## 기회의 횟수가 다릅니다

특별공급은 **1세대당 평생 1회 당첨**이 원칙입니다. 한 공고에 여러 유형으로 중복 신청할 수도 없어서, 가족이 어느 유형으로 넣을지 미리 정해야 합니다. 다만 예외 규정이 있으므로 공고문에서 확인해야 합니다.

일반공급에는 그런 평생 제한이 없습니다. 대신 당첨되면 재당첨 제한 기간이 적용됩니다.

## 물량은 실제로 어떻게 나뉘었을까

임장ON이 보관 중인 청약홈 공고를 집계했습니다. 최근 12개월 안에 접수를 시작한 아파트 공고 중 공급 세대가 집계된 362건이 대상입니다.

| 구분 | 세대 | 비중 |
|---|---|---|
| 특별공급 | 82,276 | 51.8% |
| 일반공급 | 76,698 | 48.2% |

**특별공급이 절반을 넘습니다.** 특별공급을 "일부 배정 물량"으로 알고 계셨다면 실제 배분과 차이가 있습니다.

공고마다 편차도 큽니다. 특별공급 비율의 중앙값은 52.4%이고, 하위 25%는 43.9%, 상위 25%는 57.2%입니다. **362건 중 207건은 특별공급이 일반공급보다 많았고**, 특별공급이 한 세대도 없는 공고도 32건 있었습니다.

## 확인할 점

- 위 집계는 아파트 공고 기준입니다. 오피스텔·무순위·임의공급은 구조가 다릅니다.
- 특별공급 유형별 자격과 소득·자산 기준은 공고마다 다르게 적용될 수 있습니다.
- 가점제와 추첨제의 적용 비율은 지역과 전용면적에 따라 갈립니다. 같은 단지라도 평형에 따라 달라집니다.
- 자격과 물량 배분은 결국 그 공고의 입주자모집공고문이 기준입니다. 청약홈에서 원문을 확인해야 합니다.`,
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const guard = runGuardrails({ body: GEN.body, sourceName: SOURCE.sourceName, sourceUrl: SOURCE.sourceUrl });
  const charCount = GEN.body.replace(/\s/g, '').length;
  console.log(`가드레일: ${guard.ok ? 'PASS ✅' : 'FAIL ❌ → ' + guard.violations.join(', ')} (공백제외 ${charCount}자)`);
  if (dryRun) return;
  if (!guard.ok) process.exit(1);

  const existing = await prisma.post.findUnique({
    where: { dedupeKey: DEDUPE_KEY },
    select: { id: true, status: true },
  });

  if (existing) {
    if (existing.status !== 'DRAFT') {
      console.log(`이미 ${existing.status}(id=${existing.id}) — 건드리지 않는다. 어드민에서 처리하라.`);
      return;
    }
    await prisma.post.update({
      where: { id: existing.id },
      data: {
        title: GEN.title,
        summary: GEN.summary,
        body: GEN.body,
        sourceName: SOURCE.sourceName,
        sourceExcerpt: SOURCE.sourceExcerpt,
      },
    });
    logger.info({ id: String(existing.id) }, 'board DRAFT 본문 갱신');
    console.log(`갱신: id=${existing.id}`);
    return;
  }

  const res = await createDraft({
    gen: GEN,
    ...SOURCE,
    sourceDateIsPublication: false, // 원문 발행일이 아니라 우리 수집·집계 기준일이다
    dedupeKey: DEDUPE_KEY,
    dateISO: '2026-08-14',
  });
  logger.info({ res }, 'board 수동 DRAFT 생성');
  console.log(JSON.stringify(res, (_k, v) => (typeof v === 'bigint' ? String(v) : v)));
}

main()
  .catch((err) => { logger.error({ err }, 'insert-special-vs-general-supply fatal'); process.exit(1); })
  .finally(() => { void prisma.$disconnect(); });
