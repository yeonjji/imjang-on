/**
 * 1회성: "최근 거래 1건으로 시세를 판단하면 안 되는 이유" 글을 DRAFT로 넣는다.
 * 검수·게시는 /admin/posts.
 *
 * 같은 dedupeKey가 DRAFT로 있으면 본문을 갱신한다(검수 지적 반영용). PUBLISHED면 건드리지 않는다.
 *
 * 실행:
 *   pnpm exec dotenv -e .env.test -- tsx scripts/board/insert-rtms-single-trade-caveat.ts --dry-run
 *   온박스: etl 컨테이너에 이 파일만 바인드마운트해 실행
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { GenerateResult } from '@/lib/board/generate';
import { createDraft } from '@/lib/board/create-draft';
import { runGuardrails, MAX_BODY_CHARS_MANUAL } from '@/lib/board/guardrails';

const DEDUPE_KEY = 'manual:rtms-single-trade-caveat';

/**
 * VERIFIED 2026-09-23 — 운영 DB 읽기전용 자체 집계. 본문 수치는 전부 여기서 나왔다.
 *
 * [1) 같은 단지·같은 평형 안의 가격 격차 — 최근 12개월 아파트 매매, 해제 제외]
 *   평형 = ROUND(전용면적 / 3.3057851239669422). 사이트 상세 페이지(getAreaSummary)와 같은 정의다.
 *   같은 (단지, 평형)에서 3건 이상 거래된 37,826조합.
 *     (최고가 − 최저가) / 최저가 — 중앙값 21.1% · 평균 27.0% · 75% 지점 34.8% · 90% 지점 54.1%
 *     10% 이상 벌어진 조합 31,314 (82.8%) · 20% 이상 20,163 (53.3%)
 *     격차 금액 중앙값 5,750만원
 *   ※ 3건 이상으로 좁힌 이유: 2건이면 격차가 곧 두 건의 차이라 분포가 될 수 없다.
 *
 * [2) 거래가 드문 단지 — 최근 3개월 아파트 매매, 해제 제외]
 *   거래가 1건이라도 있었던 21,294개 단지 기준. 중앙값 3건.
 *     1건만      6,365 (29.9%)
 *     2건 이하   9,825 (46.1%)
 *     4건 이하  13,927 (65.4%)
 *   ※ 분모가 "거래가 있었던 단지"다. 거래가 0건인 단지는 애초에 들어오지 않는다 — 즉 실제로
 *     비교 사례가 없는 단지는 이 수치보다 더 많다. 글에서 과장하지 않도록 분모를 명시했다.
 *
 * [3) 계약 해제 — 최근 12개월 아파트 매매 신고]
 *   전체 525,847건 중 해제 6,260건 (1.19%).
 *   ★ 해제 거래가 최고가에 몰리는지 기준선과 대조했다(처음 가설은 틀렸다):
 *     해제 건 중 그 (단지, 평형) 최근 12개월 최고가였던 것  14.4%
 *     해제되지 않은 거래가 최고가였던 비율                  13.2%
 *     같은 조합에 3건 이상인 것으로 좁히면 10.2% vs 8.9%
 *   → 차이가 거의 없다. "해제는 주로 최고가에서 일어난다"는 서술은 쓰지 않는다.
 *     다만 이 측정은 '계약 시점 기준 최고가'가 아니라 '12개월 전체 최고가'라, 신고가 띄우기를
 *     검증하거나 반증하지 않는다. 글에서도 그 이상으로 해석하지 않는다.
 *
 * [4) 계약일 → 공개(적재) 시차 — 최근 3개월 아파트 매매 계약분 105,616건]
 *   중앙값 5일 · 90% 지점 20일 · 30일 초과 1,037건(1.0%)
 *   ※ createdAt은 우리 ETL 적재 시각이다. ETL이 하루 두 번 돌므로 국토부 공개 시점 + 1일 이내의
 *     대용치로 쓴다. 이 글은 '신고 기한 30일'이라는 법정 상한과 실제 관측치를 함께 적는다 —
 *     초안이 암시한 "3주 지연"은 일반적인 경우가 아니라 상위 10% 꼬리다.
 *   ※ Transaction.registerDate는 쓰지 않았다. 등기일자 파싱 버그(1923~1926년 적재, 역전 17.5%)가
 *     남아 있어 시차 계산에 쓸 수 없다.
 *
 * [맥락 링크 — 운영 DB에서 PUBLISHED 확인]
 *   /board/90 아파트 1층은 정말 쌀까 — 층 차이를 이미 다뤘으므로 반복하지 않고 링크한다
 *   /board/86 같은 전용 59㎡인데 24평도 25평도 26평도 있는 이유 — 면적 비교 주의
 *
 * [의도적으로 안 쓴 것]
 *   층별 가격 차이의 구체 수치(기존 글 90번과 중복), 특정 단지·지역 언급, 시점 판단이나 매수 권유.
 *   초안에 있던 가상의 거래 표 두 개는 실측으로 대체했다 — 이 사이트는 꾸민 숫자를 쓰지 않는다.
 */
const SOURCE = {
  sourceName: '국토교통부 실거래가 공개시스템',
  sourceUrl: 'https://rt.molit.go.kr',
  // 원문 발행일이 아니라 집계 기준일이다(sourceDateIsPublication=false).
  sourceDate: new Date('2026-09-23T00:00:00Z'),
  detectedFrom: 'manual:rtms-single-trade-caveat',
  sourceExcerpt: `[자체 집계 — 국토교통부 실거래가 공개시스템 적재분, 기준일 2026-09-23]
[산식] 평형 = ROUND(전용면적/3.3057851239669422). 사이트 상세 페이지(getAreaSummary)와 동일.
[1. 같은 단지·같은 평형 가격 격차] 최근 12개월 아파트 매매(해제 제외) 중 같은 (단지,평형)에서 3건 이상 거래된 37,826조합. (최고가−최저가)/최저가 중앙값 21.1%, 평균 27.0%, 75% 지점 34.8%, 90% 지점 54.1%. 10% 이상 31,314조합(82.8%), 20% 이상 20,163조합(53.3%). 격차 금액 중앙값 5,750만원.
[2. 거래 빈도] 최근 3개월 아파트 매매(해제 제외)가 1건 이상 있었던 21,294개 단지. 중앙값 3건. 1건만 6,365(29.9%), 2건 이하 9,825(46.1%), 4건 이하 13,927(65.4%). 분모는 '거래가 있었던 단지'이므로 비교 사례가 없는 단지는 이보다 많다.
[3. 계약 해제] 최근 12개월 아파트 매매 신고 525,847건 중 해제 6,260건(1.19%). 해제 건의 14.4%가 그 (단지,평형) 12개월 최고가였고, 해제되지 않은 거래도 13.2%로 차이가 거의 없다(3건 이상 조합으로 좁히면 10.2% vs 8.9%). 이 측정은 계약 시점 기준이 아니라 12개월 전체 최고가 기준이므로 신고가 띄우기를 검증·반증하지 않는다.
[4. 계약일→공개 시차] 최근 3개월 계약분 105,616건. 중앙값 5일, 90% 지점 20일, 30일 초과 1,037건(1.0%). createdAt(ETL 적재 시각, 하루 2회 실행)을 공개 시점의 대용치로 사용. registerDate는 파싱 버그로 미사용.
[법령] 부동산 거래신고 등에 관한 법률 제3조 — 매매계약은 체결일부터 30일 이내 신고.`,
} as const;

const GEN: GenerateResult = {
  type: 'TREND',
  category: 'REALESTATE',
  title: '같은 단지 같은 평형인데 5,750만원 차이가 납니다',
  summary:
    '최근 실거래가가 올랐다고 시세가 올랐다고 보기 어려운 이유가 있습니다. 최근 12개월 아파트 매매를 집계해 보니 같은 단지·같은 평형 안에서도 최고가와 최저가가 중앙값 21.1%, 금액으로 5,750만 원 벌어졌습니다. 거래가 석 달에 두 건 이하인 단지도 46.1%였습니다.',
  body: `관심 있는 아파트의 최근 거래가격이 직전보다 높으면 집값이 올랐다고, 낮으면 떨어졌다고 읽기 쉽습니다. 그런데 같은 단지 같은 평형 안에서도 거래가격은 생각보다 크게 벌어집니다.

임장온이 국토교통부 실거래가에서 최근 12개월 아파트 매매를 직접 집계했습니다. 평형은 상세 페이지와 같은 기준으로 맞췄고, 해제된 거래는 뺐습니다.

## 같은 단지·같은 평형인데 최고가와 최저가가 21% 벌어집니다

같은 단지에서 같은 평형이 3건 이상 거래된 37,826개 조합을 봤습니다.

| 구간 | 최저가 대비 최고가 격차 |
|---|---|
| 중앙값 | 21.1% |
| 상위 25% 지점 | 34.8% |
| 상위 10% 지점 | 54.1% |

금액으로는 중앙값 5,750만 원입니다. 10% 넘게 벌어진 조합이 82.8%, 20% 넘게 벌어진 조합이 53.3%였습니다.

같은 평형이라도 층과 향, 동의 위치, 수리 상태가 다릅니다. 층 하나만 놓고 봐도 [1층과 나머지 층 사이에 차이](/board/90)가 있습니다. 최근 한 건이 직전 거래보다 비싸다는 사실만으로는 시세가 움직인 것인지 조건이 달랐던 것인지 가려지지 않습니다.

## 석 달에 두 건 이하로 거래되는 단지가 46%입니다

최근 3개월에 매매가 한 건이라도 있었던 아파트는 21,294개 단지였습니다. 그 단지들의 거래 건수입니다.

| 최근 3개월 매매 | 단지 수 | 비중 |
|---|---|---|
| 1건 | 6,365 | 29.9% |
| 2건 이하 | 9,825 | 46.1% |
| 4건 이하 | 13,927 | 65.4% |

중앙값은 3건입니다. 분모가 '거래가 있었던 단지'이므로, 아예 비교할 사례가 없는 단지는 이보다 더 많습니다. 사례가 한두 건뿐이면 그 거래의 개별 조건이 가격 흐름처럼 읽히기 쉽습니다.

## 최근 한두 달 내역은 아직 다 들어오지 않았습니다

부동산 거래신고 등에 관한 법률 제3조에 따라 매매계약은 체결일부터 30일 이내에 신고해야 합니다. 실거래가는 계약일 기준으로 표시되므로, 지금 조회한 이번 달 내역에는 아직 신고되지 않은 계약이 빠져 있습니다.

최근 3개월 계약분 105,616건에서 계약일부터 공개까지 걸린 기간은 중앙값 5일이었습니다. 다만 10건 중 1건은 20일을 넘겼습니다. 최근 한 달 거래가 적더라도 그것이 실제 감소인지 아직 안 들어온 것인지는 시간이 지나야 갈립니다.

## 해제된 계약이 섞여 있습니다

최근 12개월 아파트 매매 신고 525,847건 중 6,260건(1.19%)이 이후 해제됐습니다.

해제된 거래가 유독 높은 가격에 몰려 있지는 않았습니다. 해제 건의 14.4%가 그 단지·평형의 12개월 최고가였는데, 해제되지 않은 거래도 13.2%로 비슷합니다. 비율은 낮지만, 기준으로 삼은 그 한 건이 해제된 거래라면 출발점이 어긋납니다.

## 실거래가와 호가는 다른 숫자입니다

국토교통부도 실거래가는 신고된 실제 거래금액이며, 시장에서 거래 가능한 금액 수준을 뜻하는 일반시세와 다를 수 있다고 안내합니다. 최근 실거래가가 8억 원인 아파트의 매물이 9억 원에 나와 있다고 해서 시세가 9억 원이 된 것은 아닙니다. 반대로 호가가 실거래가보다 낮다면 그 매물이 싸게 나온 이유를 따로 확인하는 편이 낫습니다.

주변 단지를 함께 보면 기준이 하나 더 생깁니다. 관심 단지가 9억 원에 거래됐는데 연식과 규모가 비슷한 이웃 단지가 8억 원대라면, 그 차이가 입지나 학군, 주차, 관리 상태 중 무엇에서 오는지 확인해 볼 수 있습니다. 주변보다 비싸다고 고평가인 것도, 싸다고 기회인 것도 아닙니다.

## 그래서 무엇을 함께 볼까요

- 같은 전용면적끼리 비교합니다. [같은 59㎡라도 24평·25평·26평으로 갈립니다](/board/86)
- 최근 한 건이 아니라 3~6개월 치를 함께 봅니다
- 그 기간에 몇 건이 거래됐는지 확인합니다
- 해제 표시가 붙어 있는지 봅니다
- 주변의 비슷한 단지가 얼마에 거래됐는지도 봅니다

실거래가는 실제로 체결되어 신고된 가격이라는 점에서 단단한 자료입니다. 다만 한 건은 한 건입니다. 임장온 단지 상세에서 같은 평형의 과거 거래와 거래 건수를 함께 확인해 보세요.`,
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const guard = runGuardrails({
    body: GEN.body,
    sourceName: SOURCE.sourceName,
    sourceUrl: SOURCE.sourceUrl,
    maxLength: MAX_BODY_CHARS_MANUAL,
  });
  const len = GEN.body.replace(/\s/g, '').length;
  logger.info({ len, max: MAX_BODY_CHARS_MANUAL, ok: guard.ok, violations: guard.violations }, '가드레일');
  if (!guard.ok) {
    process.exitCode = 1;
    return;
  }
  if (dryRun) {
    logger.info('dry-run — DB에 쓰지 않음');
    return;
  }

  const existing = await prisma.post.findUnique({
    where: { dedupeKey: DEDUPE_KEY },
    select: { id: true, status: true },
  });
  if (existing) {
    if (existing.status === 'PUBLISHED') {
      logger.info({ id: String(existing.id) }, '이미 게시됨 — 건드리지 않음');
      return;
    }
    await prisma.post.update({
      where: { id: existing.id },
      data: { title: GEN.title, summary: GEN.summary, body: GEN.body },
    });
    logger.info({ id: String(existing.id) }, 'DRAFT 갱신 완료 — /admin/posts에서 검수');
    return;
  }

  const res = await createDraft({
    gen: GEN,
    sourceName: SOURCE.sourceName,
    sourceUrl: SOURCE.sourceUrl,
    sourceDate: SOURCE.sourceDate,
    sourceDateIsPublication: false, // 원문 발행일이 아니라 자체 집계 기준일
    sourceExcerpt: SOURCE.sourceExcerpt.slice(0, 4000),
    dedupeKey: DEDUPE_KEY,
    dateISO: '2026-09-23',
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
    logger.error({ err }, 'insert-rtms-single-trade-caveat fatal');
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
