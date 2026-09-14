/**
 * 1회성: "8·13 대책, 재개발·재건축은 뭐가 달라지나" 글을 DRAFT로 넣는다. 검수·게시는 /admin/posts.
 *
 * 같은 dedupeKey가 DRAFT로 있으면 본문을 갱신한다(검수 지적 반영용). PUBLISHED면 건드리지 않는다.
 *
 * 실행:
 *   pnpm exec dotenv -e .env.test -- tsx scripts/board/insert-813-redevelopment.ts --dry-run
 *   pnpm exec dotenv -e .env.qa.write.local -- tsx scripts/board/insert-813-redevelopment.ts
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { GenerateResult } from '@/lib/board/generate';
import { createDraft } from '@/lib/board/create-draft';
import { runGuardrails, MAX_BODY_CHARS_MANUAL } from '@/lib/board/guardrails';

const DEDUPE_KEY = 'manual:813-redevelopment-2026';

/**
 * VERIFIED 2026-09-01. 정부 발표(2026.08.13) 및 국토교통부 후속 보도자료(2026.08.29~30) 대조.
 *
 * [확인된 사실]
 *   2026.08.13. 정부서울청사에서 「전월세 및 매매시장 안정을 위한 주택 신속공급 방안」 발표.
 *   재개발 조합설립 동의율 토지등소유자 75% → 70%. 토지면적 기준 50%는 유지.
 *   조합설립인가 신청 전 토지등소유자 통보기간 60일 → 30일.
 *   공공재개발·재건축 사업시행자 지정 동의율 67% → 60%.
 *   2030년까지 **수도권** 재개발·재건축 약 23만4천 가구 정상 착공 지원(목표).
 *   시공사 선정 단독 응찰 시 재입찰 절차 간소화.
 *   소형주택 3분의 2 이상 공급 시 공원·녹지 기여 기준 완화.
 *   정비사업 정책설명회 09.01.(서울, 서울역 인근 연세대 세브란스빌딩) /
 *     09.03.(대전, 대전역 인근 코레일 충남본부) 각 14:00~17:00. HUG·LH·부동산원 참여.
 *
 * [초안 대비 교정 — 조건이 통째로 빠져 있었다]
 *   ① 23만4천 가구는 **수도권** 목표다. 초안은 지역 한정 없이 적었다.
 *   ② 취득세: 초안 "재개발사업 시행자 취득세 2027년까지 면제, 2028년 75% 감면".
 *      실제는 **발표 이후 관리처분인가를 받고 2년 내 착공**하는 사업이
 *      **현금청산자로부터 부동산을 취득**하는 경우다. 조건 두 개가 빠져 있었다.
 *   ③ 임대주택 인수가격 80%→100%: **발표 이후 관리처분인가 + 2028년까지 착공** 조건부다.
 *      초안은 조건 없이 적었다.
 *   ④ PF 보증 60%: 신설이 아니라 기존 특례를 **2027년까지 연장**하는 것이다.
 *   ⑤ 공공재개발·재건축 시행자 지정 동의율 67%→60%는 초안에 없다. 추가했다.
 *
 * [의도적 배제 — 확인하지 못했거나 지면이 부족한 것]
 *   · 공공재개발 38곳 약 6만 호, LH 수수료율 3%→1%, 전문 조합장(5년 경력),
 *     조합 임원 성과급, 자재 세부내역 미제출 과태료, 사업비 1% 특판금리,
 *     이주비 대출 총량 별도관리, 국토부 중재기구의 구체적 소관 범위.
 *     초안에 있으나 1차 출처로 확인하지 못했다. 확인된 것만 실었다.
 *   · 재건축 동의율. 이번 완화는 보도상 **재개발** 조합설립 동의율이고,
 *     재건축 동의율 완화는 2024년에 별도로 다뤄진 사안이라 섞지 않았다.
 *
 * [문체] 초안의 AI 상투구를 걷어냈다 — "~할 가능성이 큽니다", "~에 도움이 될 수 있습니다",
 *   "결국 중요한 것은", "눈여겨볼 만한 곳은 다음과 같습니다", 문단마다 붙던 굵게 강조.
 *   가드레일이 '가능성이 큰/있는'과 '것으로 보입니다'를 금지표현으로 막기도 한다.
 */
const SOURCE = {
  sourceName: '국토교통부',
  sourceUrl: 'https://www.molit.go.kr/',
  // UTC 자정으로 지정한다(KST 자정은 @db.Date에 하루 앞서 저장된다).
  sourceDate: new Date('2026-08-13T00:00:00Z'),
  detectedFrom: 'manual:813-redevelopment-2026',
  sourceExcerpt: `[발표] 2026.08.13. 정부서울청사에서 국토교통부장관·금융위원장·국무조정실장·재정경제부 1차관이 「전월세 및 매매시장 안정을 위한 주택 신속공급 방안」과 「부동산 시장 안정을 위한 금융 종합대책」을 발표했다.
[정비사업 제도 개선] 재개발 조합설립에 필요한 토지등소유자 동의율을 현행 75%에서 70%로 완화한다. 토지면적 기준 50% 요건은 유지된다. 조합설립인가 신청 전 토지등소유자에게 통보해야 하는 기간은 60일에서 30일로 단축된다. 공공재개발·재건축 사업시행자 지정 동의율은 67%에서 60%로 낮아진다. 시공사 선정 시 단독 응찰로 재입찰을 진행하는 경우 절차를 간소화한다. 소형주택을 3분의 2 이상 공급하는 경우 공원·녹지 기여 기준을 완화한다.
[목표] 2030년까지 수도권 재개발·재건축 약 23만4천 가구가 정상적으로 착공할 수 있도록 지원한다.
[사업성 지원] 취득세 — 발표 이후 관리처분인가를 받고 2년 내 착공하는 재개발사업이 현금청산자로부터 부동산을 취득하는 경우, 2027년까지 취득분은 면제하고 2028년 취득분은 75% 감면한다. 임대주택 인수가격 — 발표 이후 관리처분인가를 받고 2028년까지 착공하는 사업에 대해 용적률 완화에 따른 임대주택 인수가격을 기본형건축비의 80%에서 100%로 상향한다. PF 보증 — 총사업비의 60%까지 보증하는 특례를 2027년까지 연장한다.
[후속조치] 국토교통부는 8·13 대책 후속으로 정비사업 정책설명회를 2026.09.01.(서울역 인근 연세대 세브란스빌딩)과 09.03.(대전역 인근 코레일 충남본부)에 각 14:00~17:00 개최한다. 정비사업 제도 개선 방향과 정부 지원방안, 도시 및 주거환경정비법 개정안의 주요 내용을 안내하며 HUG·LH·한국부동산원이 함께 참여해 이주비 등 금융지원, 공공재개발 사업설명, 공사비 검증을 안내한다.`,
} as const;

const GEN: GenerateResult = {
  type: 'PROGRAM',
  category: 'REALESTATE',
  title: '8·13 대책, 재개발은 뭐가 달라지나 — 동의율 75%에서 70%로',
  summary:
    '재개발 조합설립 동의율이 75%에서 70%로 낮아집니다. 다만 대부분은 법 개정이 필요한 개선 방향이고, 사업성 지원은 관리처분인가 시점과 착공 시기라는 조건이 붙습니다. 발표된 것과 지금 적용되는 것을 갈라서 정리했습니다.',
  body: `정부가 2026년 8월 13일 「전월세 및 매매시장 안정을 위한 주택 신속공급 방안」을 발표했습니다.

정비사업 쪽 방향은 분명합니다. 새 구역을 많이 지정하는 것이 아니라, 이미 추진 중인 사업이 조합 설립이나 시공사 선정, 공사비 협상에서 멈추지 않게 하는 데 무게가 실렸습니다.

## 동의율 75% → 70%

가장 큰 변화입니다. 재개발 조합을 세우려면 지금은 토지등소유자 75% 이상의 동의가 필요한데, 이를 70%로 낮춥니다. 토지면적 기준 50%는 그대로입니다.

| 구분 | 현행 | 개선 방향 |
|---|---|---|
| 토지등소유자 동의율 | 75% | 70% |
| 토지면적 동의율 | 50% | 50% 유지 |
| 공공 시행자 지정 동의율 | 67% | 60% |

소유자가 1,000명인 구역이면 750명에서 700명으로 줄어듭니다. 정비사업은 마지막 몇 %를 채우는 데서 몇 년씩 걸리기도 해서, 동의율이 70~75% 구간에 걸려 있는 구역에는 실질적인 차이입니다.

조합설립인가를 신청하기 전 토지등소유자에게 알려야 하는 기간도 60일에서 30일로 줄입니다.

## 시공사 선정과 공사비

건설사 한 곳만 입찰하면 유찰되고 다시 공고를 내야 하는데, 단독 응찰로 재입찰할 때 절차를 간소화합니다. 한 곳만 들어와도 바로 선정한다는 뜻은 아니고, 경쟁이 성립하지 않았을 때 같은 절차를 반복하는 시간을 줄이는 쪽입니다.

공사비 갈등은 별도로 다룹니다. 원자재와 인건비가 오르면서 시공사가 증액을 요구하고 조합과 합의가 안 돼 착공이 밀리는 사례를 겨냥해, 국토교통부 안에 정비사업 중재기구를 두는 방안이 들어갔습니다.

## 지원에는 조건이 붙습니다

착공을 앞당기는 사업장에 세제·금융 지원을 붙였습니다. 여기서 조건을 빼고 읽으면 오해합니다.

| 항목 | 내용 |
|---|---|
| 취득세 | 발표 이후 관리처분인가를 받고 2년 내 착공하는 재개발이 현금청산자에게서 부동산을 취득하는 경우 — 2027년 취득분 면제, 2028년 75% 감면 |
| 임대주택 인수가격 | 발표 이후 관리처분인가 + 2028년까지 착공 — 기본형건축비 80% → 100% |
| PF 보증 | 총사업비 60% 보증 특례를 2027년까지 연장 |

세 항목 모두 "관리처분인가를 언제 받았는지"와 "언제 착공하는지"가 조건입니다. 지금 조합설립 단계인 구역에는 당장 해당하지 않습니다.

## 23만4천 가구는 새로 짓는 물량이 아닙니다

정부는 2030년까지 수도권 재개발·재건축 약 23만4천 가구의 정상 착공을 지원하겠다고 했습니다.

이 숫자를 새로 지정하거나 분양하는 물량으로 읽으면 안 됩니다. **이미 추진 중인데 멈춰 있는 사업장을 착공까지 끌고 가겠다는 목표치**입니다. 그래서 성과는 구역이 얼마나 늘었는지가 아니라, 조합설립에서 착공까지 걸리는 시간이 줄었는지로 봐야 합니다.

수도권 기준이라는 점도 함께 봐야 합니다.

## 발표와 시행은 다릅니다

동의율 완화는 도시 및 주거환경정비법을 고쳐야 합니다. 지금 진행 중인 구역에 곧바로 70%가 적용되지는 않습니다.

국토교통부는 9월 1일 서울, 9월 3일 대전에서 정비사업 정책설명회를 엽니다. 각 오후 2시부터 5시까지이고 법 개정안의 주요 내용을 안내합니다. HUG·LH·한국부동산원이 함께 나와 이주비 금융지원과 공사비 검증도 다룹니다.

## 구역을 볼 때

- 동의율이 70~75% 구간이면 완화가 시행될 때 직접 영향을 받습니다
- 시공사 선정에서 여러 번 유찰된 곳이면 재입찰 간소화가 걸립니다
- 관리처분인가를 받고 착공을 준비 중이면 세제·인수가격 지원의 조건에 들어갈 수 있습니다

"8·13 수혜지역"이라는 말보다, 그 구역이 지금 어느 단계이고 무엇 때문에 멈춰 있는지를 먼저 보는 편이 낫습니다.`,
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
    sourceDateIsPublication: true, // 대책 발표일이 원문 발행일이다
    sourceExcerpt: SOURCE.sourceExcerpt.slice(0, 4000),
    dedupeKey: DEDUPE_KEY,
    dateISO: '2026-09-01',
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
    logger.error({ err }, 'insert-813-redevelopment fatal');
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
