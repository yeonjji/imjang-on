/**
 * 1회성: "아파트 1층은 정말 쌀까 — 실거래 40만 건" 글을 DRAFT로 넣는다. 검수·게시는 /admin/posts.
 *
 * 같은 dedupeKey가 DRAFT로 있으면 본문을 갱신한다(검수 지적 반영용). PUBLISHED면 건드리지 않는다.
 *
 * 실행:
 *   pnpm exec dotenv -e .env.test -- tsx scripts/board/insert-apartment-floor-price.ts --dry-run
 *   pnpm exec dotenv -e .env.qa.write.local -- tsx scripts/board/insert-apartment-floor-price.ts
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { GenerateResult } from '@/lib/board/generate';
import { createDraft } from '@/lib/board/create-draft';
import { runGuardrails } from '@/lib/board/guardrails';

const DEDUPE_KEY = 'manual:apartment-floor-price';

/**
 * VERIFIED 2026-08-28. 운영 DB 읽기전용 SSH 터널(default_transaction_read_only=on)로 자체 집계.
 *
 * [집계 설계 — 왜 이렇게 했나]
 *   전국 1층 평균가 vs 20층 평균가를 비교하면 서울 1층과 지방 20층이 섞여 층이 아니라 지역
 *   구성을 재게 된다. 그래서 **(propertyId, exclusiveArea) 그룹 내부에서만** 비율을 구하고
 *   그 비율들을 전국 단위로 다시 집계했다. 지역·평형·단지 차이가 그룹 내에서 상쇄된다.
 *
 * [모집단] Transaction: propertyType=APARTMENT, dealType=SALE, contractDate 최근 12개월
 *   (2025-08-28 ~ 2026-08-26), dealAmount NOT NULL, exclusiveArea > 0, floor >= 1,
 *   cancelDate IS NULL(해제 제외), dealingType='중개거래'(직거래 38,054건 제외).
 *   전체 533,421건 중 해제 6,731건. floor 결측 0건.
 *
 * [집계 A — 층구간별] 그룹 조건: 거래 5건 이상 AND 서로 다른 층구간 2개 이상.
 *   해당 그룹 29,406개 / 거래 400,047건. 각 거래의 ㎡당가를 그 그룹의 ㎡당가 중위값으로 나눈
 *   비율의 중위값:
 *     1층      17,829건  -6.8%  (p25 -11.6% / p75 -1.7%)
 *     2~3층    43,304건  -3.0%
 *     4~9층   131,736건   0.0%
 *     10~19층 160,175건  +0.5%
 *     20층+    47,003건  +0.9%
 *   합 17,829+43,304+131,736+160,175+47,003 = 400,047 — 그룹 거래수와 일치(검산).
 *
 * [집계 B — 1층 직접 비교] 같은 그룹 안에서 1층 중위 ㎡당가 / 2층 이상 중위 ㎡당가.
 *   조건: 1층 거래 1건 이상 AND 2층 이상 거래 3건 이상 → 그룹 11,959개.
 *   1층 거래 18,614건 / 2층 이상 184,817건.
 *   중위 -7.6% (p25 -12% / p75 -3%). 1층이 더 싼 그룹 84.6%.
 *
 * [집계 C — 시도별 1층 할인] 집계 B와 같은 조건, 그룹 200개 이상인 시도만.
 *   부산 -9.1% / 대전 -9.0% / 강원 -8.3% / 울산 -8.0% / 전북 -7.9% / 충남 -7.8% /
 *   대구 -7.8% / 전남광주 -7.7% / 인천 -7.6% / 경기 -7.3% / 경북·경남 -7.2% /
 *   충북 -7.1% / 서울 -6.9%. 범위 6.9~9.1%.
 *
 * [외부 확인]
 *   층별효용비율은 감정평가에서 쓰이는 개념이고 평가지침류에 규정돼 있다.
 *   허진·전해정, "아파트 층별효용비율에 관한 연구: 서울 송파구를 중심으로", 부동산법학(2022) —
 *   헤도닉 모형으로 송파구 실거래를 분석해 15층 이상 고층의 층별효용비율이 규정된 비율보다
 *   크다고 보고, 시장 선호를 반영한 기준 재정립을 제안했다. KCI ART002920767.
 *
 * [의도적 배제]
 *   · "전체 층수 대비 위치"(하위20%/중간60%/상위20%) 표. Property에 총 층수 컬럼이 없다.
 *     거래에서 관측된 최대 층으로 추정할 수는 있으나 거래가 없는 층은 안 잡혀 건물 높이를
 *     과소평가한다. 추정치로 표를 만들지 않았다.
 *   · 검색에서 나온 "1층 -13%", "로열층 +6~20%" 류 수치. 출처가 블로그라 인용하지 않았다.
 *   · 층 효과와 계약 시점의 분리. 12개월 거래를 함께 묶었으므로 그 사이 시세 변동이 층
 *     효과에 일부 섞인다. 본문에 한계로 적었다.
 */
const SOURCE = {
  sourceName: '임장ON 실거래 집계 · 국토교통부 실거래가 공개시스템',
  sourceUrl: 'https://rt.molit.go.kr/',
  // UTC 자정으로 지정한다. KST 자정은 @db.Date에 하루 앞서 저장된다(커밋 5c39a2c 교정 이력).
  sourceDate: new Date('2026-08-28T00:00:00Z'),
  detectedFrom: 'manual:apartment-floor-price',
  sourceExcerpt: `[집계 방법] 국토교통부 아파트 매매 실거래 중 계약일 2025-08-28~2026-08-26, 해제 신고분과 직거래를 제외한 중개거래를 대상으로 했다. 전국 평균끼리 비교하면 지역 구성이 섞이므로, 같은 단지·같은 전용면적 그룹 안에서만 층별 비율을 구한 뒤 그 비율들을 전국 단위로 다시 집계했다.
[집계 A — 층구간별] 거래 5건 이상이면서 서로 다른 층구간이 2개 이상인 단지·평형 그룹 29,406개, 거래 400,047건. 각 거래의 ㎡당 가격을 그 그룹의 중위 ㎡당 가격으로 나눈 비율의 중위값 — 1층 -6.8%(17,829건) / 2~3층 -3.0%(43,304건) / 4~9층 0.0%(131,736건) / 10~19층 +0.5%(160,175건) / 20층 이상 +0.9%(47,003건).
[집계 B — 1층 직접 비교] 같은 그룹에서 1층 중위 ㎡당가를 2층 이상 중위 ㎡당가로 나눴다. 1층 거래 1건 이상, 2층 이상 3건 이상인 그룹 11,959개(1층 18,614건 / 2층 이상 184,817건). 중위 -7.6%, 하위 25% -12%, 상위 25% -3%. 1층이 더 싼 그룹이 84.6%.
[집계 C — 시도별 1층 할인] 부산 -9.1%, 대전 -9.0%, 강원 -8.3%, 울산 -8.0%, 전북 -7.9%, 충남 -7.8%, 대구 -7.8%, 전남광주 -7.7%, 인천 -7.6%, 경기 -7.3%, 경북·경남 -7.2%, 충북 -7.1%, 서울 -6.9%.
[감정평가] 층에 따른 효용 차이는 감정평가에서 층별효용비율로 다루며 평가지침류에 규정돼 있다.
[선행 연구] 허진·전해정, "아파트 층별효용비율에 관한 연구: 서울 송파구를 중심으로", 부동산법학(2022). 송파구 실거래를 헤도닉 가격모형으로 분석해 15층 이상 고층의 층별효용비율이 규정된 비율보다 크다고 보고, 시장 선호를 반영한 기준 재정립을 제안했다.`,
} as const;

const GEN: GenerateResult = {
  type: 'TREND',
  category: 'REALESTATE',
  title: '아파트 1층은 정말 쌀까 — 실거래 40만 건으로 확인했습니다',
  summary:
    '같은 단지·같은 평형 안에서만 층별 가격을 비교했습니다. 1층은 2층 이상보다 중위 7.6% 낮았고, 단지 열 곳 중 여덟 곳에서 그랬습니다. 반면 고층 프리미엄은 생각보다 작았습니다.',
  body: `아파트를 볼 때 층수는 빠지지 않는 조건입니다. 같은 단지 같은 평형이라도 저층은 싸고 로열층은 비싸다고들 합니다. 그런데 얼마나 차이가 날까요. 임장ON이 보관한 실거래로 세어봤습니다.

## 전국 평균으로는 답이 안 나옵니다

전국 1층 평균가와 20층 평균가를 맞대면 서울 1층과 지방 20층이 섞입니다. 층이 아니라 지역 구성을 재는 셈입니다.

그래서 **같은 단지, 같은 전용면적 안에서만** 층별 차이를 구하고 그 비율들을 전국 단위로 다시 모았습니다. 지역·평형·단지 차이가 그룹 안에서 상쇄됩니다.

## 1층은 중위 7.6% 낮았습니다

같은 단지·평형에서 1층과 2층 이상을 직접 맞댔습니다. 조건을 만족하는 단지·평형이 11,959개, 1층 거래가 18,614건입니다.

| | |
|---|---|
| 1층 중위 할인 | 7.6% |
| 하위 25% ~ 상위 25% | 12% ~ 3% |
| 1층이 더 싼 단지 비중 | 84.6% |

열 곳 중 여덟 곳 넘게 1층이 쌌습니다.

## 그런데 고층 프리미엄은 작습니다

층구간을 나눠 그 단지·평형의 중위 거래가와 비교했습니다(400,047건).

| 층 | 중위 거래가 대비 |
|---|---|
| 1층 | −6.8% |
| 2~3층 | −3.0% |
| 4~9층 | 0.0% |
| 10~19층 | +0.5% |
| 20층 이상 | +0.9% |

아래로는 크게 벌어지는데 위로는 거의 안 벌어집니다. 10~19층과 20층 이상의 차이가 0.4%p입니다. "높을수록 비싸다"보다 "1층이 싸다"가 데이터에 가깝습니다.

## 지역을 가리지 않습니다

시도별 1층 할인은 6.9%에서 9.1% 사이에 모여 있었습니다. 부산 9.1%와 대전 9.0%가 컸고, 서울이 6.9%로 가장 작았습니다. 서울에서 오히려 1층 할인이 덜하다는 뜻입니다.

## 감정평가에도 있는 개념입니다

층에 따른 효용 차이는 감정평가에서 층별효용비율로 다루고 평가지침류에 규정돼 있습니다. 다만 규정된 비율이 실제 시장과 어긋난다는 지적도 있습니다. 허진·전해정(2022)은 송파구 실거래를 헤도닉 모형으로 분석해 15층 이상 고층의 효용비율이 규정보다 크다고 보고 기준 재정립을 제안했습니다.

## 이 숫자로 할 수 없는 것

실거래에는 내부 수리 상태, 향, 동 위치, 조망이 담기지 않습니다. 1층 중에도 전용 정원이 있거나 앞이 트인 집은 사정이 다릅니다. 위 수치는 그런 조건을 뭉뚱그린 평균이지 특정 집의 적정 가격이 아닙니다.

계약 시점도 섞여 있습니다. 12개월 거래를 함께 묶었으므로 그 사이 시세 변동이 층 효과에 일부 섞입니다.

## 매물을 볼 때

- 최근 거래 한 건이 아니라 여러 건을 봅니다
- 그 거래가 몇 층인지 함께 봅니다. 3층 매물을 15층 거래가로 재면 비싸게 잡습니다
- 같은 단지 → 같은 평형 → 비슷한 층 → 비슷한 시점 순으로 좁힙니다

1층이 싸다는 게 손해라는 뜻은 아닙니다. 조망을 덜 따지거나 계단으로 드나드는 편이 나은 사람에게는 같은 집을 7% 싸게 사는 선택지입니다.`,
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const guard = runGuardrails({
    body: GEN.body,
    sourceName: SOURCE.sourceName,
    sourceUrl: SOURCE.sourceUrl,
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
    sourceDateIsPublication: false, // 원문 발행일이 아니라 우리가 집계한 날이다
    sourceExcerpt: SOURCE.sourceExcerpt.slice(0, 4000),
    dedupeKey: DEDUPE_KEY,
    dateISO: '2026-08-28',
    detectedFrom: SOURCE.detectedFrom,
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
    logger.error({ err }, 'insert-apartment-floor-price fatal');
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
