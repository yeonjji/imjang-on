/**
 * 1회성: "SH 2026년 2차 행복주택 — 1,484호 중 실제 공가는" 글을 DRAFT로 넣는다.
 * 검수·게시는 /admin/posts.
 *
 * 같은 dedupeKey가 DRAFT로 있으면 본문을 갱신한다(검수 지적 반영용). PUBLISHED면 건드리지 않는다.
 *
 * 실행:
 *   pnpm exec dotenv -e .env.test -- tsx scripts/board/insert-sh-happy-housing-2026-2.ts --dry-run
 *   pnpm exec dotenv -e .env.qa.write.local -- tsx scripts/board/insert-sh-happy-housing-2026-2.ts
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { GenerateResult } from '@/lib/board/generate';
import { createDraft } from '@/lib/board/create-draft';
import { runGuardrails, MAX_BODY_CHARS_MANUAL } from '@/lib/board/guardrails';

const DEDUPE_KEY = 'manual:sh-happy-housing-2026-2';

/**
 * VERIFIED 2026-09-02.
 *
 * ⚠️ 이 글은 **공고문 원본 없이** 작성했다. 앞선 SH 국민임대 글(id=92)은 64쪽 PDF를 대조했지만
 *    이번에는 초안과 보도자료만 있었다. 그래서 **여러 매체가 일치 보도한 수치만** 실었고,
 *    단지별 물량·보증금처럼 1차 확인이 불가능한 것은 전부 뺐다.
 *
 * [교차 확인된 것 — 다수 매체 일치]
 *   총 1,484가구 = 신규공급 154 + 잔여 공가 391 + 예비입주자 939.
 *   인터넷 청약 2026.09.09.~09.11., SH 인터넷청약시스템.
 *   방문청약은 **고령자·장애인** 대상 09.10.~09.11. (초안은 "정보취약계층 대상 별도 운영"이라고만 적어
 *     대상과 날짜가 특정되지 않았다 — 교정했다.)
 *   서류심사 대상자 발표 09.21. / 최종 당첨자 2027.01.29. / 입주 2027년 3월부터 순차.
 *   시세의 60~80% 수준으로 공급.
 *   면적별 평균 보증금·월임대료 — 29㎡ 이하 6,400만원/25만원, 39㎡ 이하 1억1,800만원/45만원,
 *     49㎡ 이하 1억3,800만원/53만원, 59㎡ 이하 1억7,300만원/66만원. (초안에 없던 것 — 추가했다.)
 *   문의 SH 콜센터 1600-3456.
 *
 * [검산] 154+1,330=1,484 / 391+939=1,330 / 174+217=391 — 초안의 분해가 내부적으로 일관된다.
 *
 * [행복주택 일반 기준 — 별도 확인]
 *   최대 거주기간: 대학생·청년 10년, 신혼부부 무자녀 10년·자녀 1명 이상 14년, 고령자 20년.
 *   자동차가액 4,542만원 이하, 총자산 3억4,500만원 이하(신혼부부 기준).
 *
 * [초안에 있으나 확인 못 해 뺀 것]
 *   · 단지별 물량·임대조건 전부 — 구로 두산위브더프레스티지 40.76㎡ 신혼 68호(보증금 1억960만원),
 *     성북 창경궁롯데캐슬시그니처 39.39㎡ 청년30·신혼24·고령32, 강남 디에이치 아너힐즈 49㎡
 *     23호(공가 5), 구로 항동 하버라인 청년 29㎡ 118명(공가 25), 광진 자양동 어울채 12명(공가 2).
 *     보도자료에 단지명만 나오고 세부 물량·보증금은 확인되지 않는다. 공고문을 받으면 넣을 수 있다.
 *   · 재공급 391호의 우선 174 / 일반 217 분해. 합계는 검산되나 분해 자체는 미확인이라
 *     본문에는 '공가 391'까지만 적었다.
 *   · 청년 1인가구 소득 120% = 월 457만 6,036원. 산식은 그럴듯하나 원문 미확인.
 *   · 청년 연령 출생일 범위(1986.08.29.~2007.08.28.), 사회초년생 5년 이내 요건,
 *     예비신혼부부 요건, 우선공급 자동 전환, 서류 등기우편 제출 — 전부 공고문 확인이 필요하다.
 *
 * [문체] 초안의 AI 상투구를 걷어냈다. 가드레일이 '가능성이 큰/있는'과 '것으로 보입니다'를
 *   금지표현으로 막으므로 그대로 쓰면 생성이 반려된다.
 */
const SOURCE = {
  sourceName: 'SH 서울주택도시개발공사',
  sourceUrl: 'https://www.i-sh.co.kr/',
  // 모집공고일이 원문 발행일이다. UTC 자정 지정(KST 자정은 @db.Date에 하루 앞선다).
  sourceDate: new Date('2026-08-28T00:00:00Z'),
  detectedFrom: 'manual:sh-happy-housing-2026-2',
  sourceExcerpt: `[SH 2026년 2차 행복주택 입주자 모집공고, 공고일 2026.08.28.]
[모집 규모] 총 1,484가구 = 신규공급 154가구 + 기존 입주자의 퇴거·계약취소 등으로 발생한 잔여 공가 391가구 + 예비입주자 939가구.
[청약 일정] 인터넷 청약 2026.09.09.~09.11., SH 인터넷청약시스템. 인터넷 이용이 어려운 고령자·장애인은 09.10.~09.11. SH를 직접 방문해 신청. 서류심사 대상자 발표 2026.09.21. 최종 당첨자 발표 2027.01.29. 입주는 2027년 3월부터 순차 진행.
[공급 조건] 청년·신혼부부·고령자 등에게 주변 시세의 60~80% 수준으로 공급. 면적별 평균 보증금·월임대료는 전용 29㎡ 이하 6,400만원·25만원, 39㎡ 이하 1억1,800만원·45만원, 49㎡ 이하 1억3,800만원·53만원, 59㎡ 이하 1억7,300만원·66만원 수준. 문의 SH 콜센터 1600-3456.
[행복주택 최대 거주기간] 대학생·청년 10년. 신혼부부는 자녀가 없으면 10년, 미성년 자녀가 1명 이상이면 14년. 고령자 20년.
[자산 기준] 자동차가액 4,542만원 이하. 총자산 3억4,500만원 이하(신혼부부 기준). 자동차가액은 보건복지부 차량기준가액으로 산정한다.`,
} as const;

const GEN: GenerateResult = {
  type: 'PROGRAM',
  category: 'SUBSCRIPTION',
  title: 'SH 행복주택 1,484호 모집 — 지금 비어 있는 집은 545호입니다',
  summary:
    '9월 9일부터 청약을 받습니다. 공고에 적힌 1,484호 가운데 939호는 예비입주자 모집이라, 바로 들어갈 수 있는 집은 545호입니다. 단지를 고를 때 합계보다 공가 수를 먼저 봐야 하는 이유입니다.',
  body: `서울주택도시개발공사(SH)가 2026년 2차 행복주택 입주자를 모집합니다. 청약은 9월 9일부터 11일까지입니다.

공고에 적힌 규모는 1,484호입니다. 그런데 이 숫자를 "지금 비어 있는 집 1,484채"로 읽으면 안 됩니다.

## 1,484호를 갈라 보면

| 구분 | 호수 |
|---|---|
| 신규공급 | 154 |
| 재공급 — 공가 | 391 |
| 재공급 — 예비입주자 | 939 |
| 합계 | 1,484 |

예비입주자 939호는 지금 빈집이 아닙니다. 앞으로 빈집이 생길 때 순번대로 들어가는 대기 명단입니다.

**바로 입주할 수 있는 건 신규 154호와 공가 391호를 합한 545호입니다.** 전체의 37%입니다.

그래서 단지를 고를 때는 모집 인원 합계가 아니라 그 단지의 공가가 몇 호인지를 먼저 봐야 합니다. 합계가 크더라도 대부분이 예비입주자면 실제로는 오래 기다립니다.

## 일정

| | |
|---|---|
| 모집공고 | 2026년 8월 28일 |
| 인터넷 청약 | 9월 9일 ~ 9월 11일 |
| 방문 청약 | 9월 10일 ~ 11일 (고령자·장애인) |
| 서류심사 대상자 발표 | 9월 21일 |
| 최종 당첨자 발표 | 2027년 1월 29일 |
| 입주 | 2027년 3월부터 순차 |

방문 청약은 인터넷 이용이 어려운 고령자와 장애인이 대상입니다. 청약은 선착순이 아니라 자격과 순위로 가릅니다.

## 임대조건

시세의 60~80% 수준입니다. 면적별 평균은 이렇습니다.

| 전용면적 | 보증금 | 월임대료 |
|---|---|---|
| 29㎡ 이하 | 6,400만 원 | 25만 원 |
| 39㎡ 이하 | 1억 1,800만 원 | 45만 원 |
| 49㎡ 이하 | 1억 3,800만 원 | 53만 원 |
| 59㎡ 이하 | 1억 7,300만 원 | 66만 원 |

평균이라 단지·주택형마다 다릅니다. 해당 단지 숫자는 공고문에서 직접 확인해야 합니다.

## 얼마나 살 수 있나

행복주택은 2년 단위로 갱신합니다. 최대 거주기간은 계층마다 다릅니다.

| 계층 | 최대 |
|---|---|
| 대학생·청년 | 10년 |
| 신혼부부 (무자녀) | 10년 |
| 신혼부부 (자녀 1명 이상) | 14년 |
| 고령자 | 20년 |

짧게 살다 나가는 집이라는 인상과 달리, 자격을 유지하면 청년도 10년까지 삽니다.

## 자동차는 따로 봅니다

자동차가액 기준은 4,542만 원 이하입니다. 여기서 말하는 값은 중고차 시세나 신차 구매가가 아니라 **보건복지부 차량기준가액**입니다. 조회해서 확인해야 합니다.

총자산 기준을 충족했다고 자동차 기준까지 함께 통과하지는 않습니다. 둘은 각각 봅니다.

## 청약 전에 볼 순서

1. 내가 신청할 수 있는 계층인가 (청년·신혼부부·고령자 등)
2. 그 단지의 **공가**가 몇 호인가 — 합계가 아니라
3. 우선공급 대상인가
4. 소득·총자산·자동차 기준 안에 드는가
5. 보증금과 월세를 감당할 수 있는가

2번이 이번 공고에서 가장 중요합니다. 재공급 1,330호 중 939호가 예비입주자라, 단지 이름이나 전체 모집 인원만 보면 실제 입주 시점을 잘못 잡습니다.

문의는 SH 콜센터 1600-3456입니다.`,
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const guard = runGuardrails({
    body: GEN.body,
    sourceName: SOURCE.sourceName,
    sourceUrl: SOURCE.sourceUrl,
    maxLength: MAX_BODY_CHARS_MANUAL,
  });
  const charCount = GEN.body.replace(/\s/g, '').length;

  console.log(
    `\n[${GEN.type}/${GEN.category}] ${GEN.title}\n${GEN.summary}\n${'-'.repeat(60)}\n${GEN.body}\n${'-'.repeat(60)}\n` +
      `가드레일: ${guard.ok ? 'PASS ✅' : 'FAIL ❌ → ' + guard.violations.join(', ')} (공백제외 ${charCount}자)\n`,
  );

  if (dryRun) return;
  if (!guard.ok) {
    logger.error({ violations: guard.violations }, '가드레일 실패 — 미생성');
    process.exitCode = 1;
    return;
  }

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
        sourceUrl: SOURCE.sourceUrl,
        sourceDate: SOURCE.sourceDate,
        sourceExcerpt: SOURCE.sourceExcerpt.slice(0, 4000),
      },
    });
    logger.info({ id: String(existing.id) }, 'DRAFT 갱신 완료 — /admin/posts에서 검수');
    return;
  }

  const res = await createDraft({
    gen: GEN,
    sourceName: SOURCE.sourceName,
    sourceUrl: SOURCE.sourceUrl,
    sourceDate: SOURCE.sourceDate,
    sourceDateIsPublication: true, // 모집공고일이 원문 발행일이다
    sourceExcerpt: SOURCE.sourceExcerpt.slice(0, 4000),
    dedupeKey: DEDUPE_KEY,
    dateISO: '2026-09-02',
    detectedFrom: SOURCE.detectedFrom,
    maxLength: MAX_BODY_CHARS_MANUAL,
  });

  if (res.status === 'created') {
    logger.info({ slug: res.slug, id: String(res.id) }, 'DRAFT 생성 완료 — /admin/posts에서 검수');
  } else if (res.status === 'duplicate') {
    logger.info('dedupeKey 중복 — 건너뜀');
  } else {
    logger.error({ violations: res.violations }, 'createDraft rejected');
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    logger.error({ err }, 'insert-sh-happy-housing-2026-2 fatal');
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
