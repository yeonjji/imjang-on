/**
 * 1회성: "매물에 '남향'이라고 적혀 있으면 거실이 무조건 남향일까" 글을 DRAFT로 넣는다.
 * 검수·게시는 /admin/posts.
 *
 * 같은 dedupeKey가 DRAFT로 있으면 본문을 갱신한다(검수 지적 반영용). PUBLISHED면 건드리지 않는다.
 *
 * 실행:
 *   pnpm exec dotenv -e .env.test -- tsx scripts/board/insert-listing-direction.ts --dry-run
 *   pnpm exec dotenv -e .env.qa.write.local -- tsx scripts/board/insert-listing-direction.ts
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { GenerateResult } from '@/lib/board/generate';
import { createDraft } from '@/lib/board/create-draft';
import { runGuardrails } from '@/lib/board/guardrails';

const DEDUPE_KEY = 'manual:listing-direction-main-room';

/**
 * VERIFIED 2026-08-26. 법령·고시 원문 확인.
 *
 * [법령]
 *   공인중개사법 제18조의2 제2항 — 개업공인중개사가 **인터넷을 이용하여** 표시·광고할 때
 *     제1항 사항 외에 대통령령이 정한 소재지·면적·가격 등을 명시.
 *   같은 법 시행령 제17조의2 제2항 — 위 위임을 받은 조항. 제6호(건축물 및 그 밖의 토지의
 *     정착물) 다목이 "해당 건축물의 방향, 방의 개수, 욕실의 개수, 입주가능일, 주차대수 및 관리비".
 *
 * [고시] 국토교통부 「중개대상물의 표시·광고 명시사항 세부기준」
 *   현행 국토교통부고시 제2024-748호(2024.12.11. 개정, 2025.1.1. 시행) — law.go.kr 실측.
 *   제6조 — "주거용 건축물의 경우 거실이나 안방 등 주실(主室)의 방향을 기준으로, 그 밖의
 *     건축물은 주된 출입구의 방향을 기준으로 8가지 방향(동향, 서향, 남향, 북향, 북동향,
 *     남동향, 남서향, 북서향)으로 표시하되, 그 기준을 함께 표시하여야 한다."
 *
 * [초안 대비 교정 3건]
 *   1. 초안은 "건축물을 표시·광고할 때"라고 썼으나 이 의무는 **인터넷** 표시·광고 한정이다
 *      (법 제18조의2 제2항). 유리창 부착물·전단지에는 적용되지 않는다.
 *   2. 고시가 정한 방향은 3가지가 아니라 **8가지**다. 초안은 남향·남동향·남서향만 다뤘다.
 *   3. 주거용이 아닌 건축물은 **주된 출입구** 기준이라는 갈래가 초안에 없었다.
 *
 * [의도적 배제]
 *   · 고시 조문의 '항' 번호. 확인된 출처(U-LEX)는 제6조 제12항으로 표기하나 그 페이지가
 *     구 고시(제2023-541호) 판본일 수 있어, 개정으로 항 번호가 밀렸는지 확정하지 못했다.
 *     조(제6조)까지만 적는다.
 *   · 일조 시간·일조권 관련 수치. 건축법상 일조 확보 기준은 정북방향 인접대지 경계선 이격이라
 *     매물의 '방향' 표기와 층위가 다르고, 이 글의 범위를 넘는다.
 *   · 임장ON 보유 데이터로 만든 통계. Property 테이블에 방향(향) 컬럼이 없어 실측을 낼 수 없다.
 *     억지로 다른 지표를 붙이지 않았다.
 */
const SOURCE = {
  sourceName: '법제처 국가법령정보센터·국토교통부',
  // 한글 행정규칙명 URL은 개정돼도 현행본으로 연결된다(버전 고정 URL은 옛 판본에 묶인다).
  sourceUrl: 'https://www.law.go.kr/행정규칙/중개대상물의표시·광고명시사항세부기준',
  // UTC 자정으로 지정한다. KST 자정(+09:00)은 UTC로 전날 15시라 @db.Date 컬럼에 하루 앞선
  // 날짜로 저장된다(커밋 5c39a2c에서 같은 함정을 한 번 교정했다).
  sourceDate: new Date('2026-08-26T00:00:00Z'),
  detectedFrom: 'manual:listing-direction-main-room',
  sourceExcerpt: `[공인중개사법 제18조의2(중개대상물의 표시·광고) 제2항] 개업공인중개사가 인터넷을 이용하여 중개대상물에 대한 표시·광고를 하는 때에는 제1항에서 정하는 사항 외에 중개대상물의 종류별로 대통령령으로 정하는 소재지, 면적, 가격 등의 사항을 명시하여야 한다.
[같은 법 시행령 제17조의2(중개대상물의 표시·광고) 제2항] 법 제18조의2제2항에서 "대통령령으로 정하는 소재지, 면적, 가격 등의 사항"이란 다음 각 호의 사항을 말한다. … 제6호(건축물 및 그 밖의 토지의 정착물인 경우) 다목 — "해당 건축물의 방향, 방의 개수, 욕실의 개수, 입주가능일, 주차대수 및 관리비"
[국토교통부 「중개대상물의 표시·광고 명시사항 세부기준」(국토교통부고시 제2024-748호, 2024.12.11. 개정, 2025.1.1. 시행) 제6조] "주거용 건축물의 경우 거실이나 안방 등 주실(主室)의 방향을 기준으로, 그 밖의 건축물은 주된 출입구의 방향을 기준으로 8가지 방향(동향, 서향, 남향, 북향, 북동향, 남동향, 남서향, 북서향)으로 표시하되, 그 기준을 함께 표시하여야 한다."`,
} as const;

const GEN: GenerateResult = {
  type: 'PROGRAM',
  category: 'REALESTATE',
  title: "매물에 '남향'이라고 적혀 있으면 거실이 남향일까",
  summary:
    '인터넷 매물의 방향은 거실이 아니라 거실이나 안방 등 주실을 기준으로 표시합니다. 그래서 남향이라는 표시만으로는 어느 공간이 남쪽을 향하는지 알 수 없고, 기준을 함께 확인해야 합니다. 법령과 국토교통부 고시로 표기 기준을 정리했습니다.',
  body: `아파트를 알아보다 보면 남향, 남동향, 남서향 같은 표시를 자주 만납니다. 남향이라고 적혀 있으면 거실 창이 남쪽을 향한 집을 떠올리게 됩니다. 그런데 그 표시가 곧 거실이 남향이라는 뜻은 아닙니다. 매물의 방향에는 따로 정해진 표기 기준이 있습니다.

## 인터넷 매물에는 방향을 적어야 합니다

공인중개사법 제18조의2 제2항은 개업공인중개사가 인터넷을 이용해 중개대상물을 표시·광고할 때 대통령령이 정한 사항을 명시하도록 합니다. 그 위임을 받은 시행령 제17조의2 제2항 제6호 다목에 "해당 건축물의 방향, 방의 개수, 욕실의 개수, 입주가능일, 주차대수 및 관리비"가 들어 있습니다.

한 가지 짚어둘 점이 있습니다. 이 의무는 인터넷 표시·광고에 적용됩니다. 중개사무소 유리창에 붙은 종이나 전단지에는 같은 기준이 걸리지 않습니다. 인터넷 매물에 방향이 빠짐없이 적혀 있는 것은 이 조항 때문입니다.

## 기준은 거실이 아니라 '주실'입니다

방향을 어떻게 적을지는 국토교통부 고시가 정합니다. 「중개대상물의 표시·광고 명시사항 세부기준」 제6조는 주거용 건축물의 방향을 "거실이나 안방 등 주실(主室)의 방향을 기준으로" 표시하도록 하고, 주거용이 아닌 건축물은 주된 출입구를 기준으로 삼습니다.

적을 수 있는 방향은 동향·서향·남향·북향·북동향·남동향·남서향·북서향 여덟 가지입니다. 그리고 같은 조문은 "그 기준을 함께 표시하여야 한다"고 정합니다. 그래서 매물에는 남향(거실 기준), 남동향(안방 기준)처럼 어느 공간을 기준으로 삼았는지가 함께 적혀 있어야 합니다.

제목의 질문에 답하면 이렇습니다. 남향이라는 표시만으로 거실이 남향이라고 단정할 수 없습니다. 안방을 기준으로 삼았을 수도 있기 때문입니다. 그래서 먼저 확인할 것은 방향 자체가 아니라 그 방향의 기준입니다.

## 남향이라도 모든 방이 남쪽은 아닙니다

한 세대의 창이 전부 같은 쪽을 보지는 않습니다. 거실과 안방은 남쪽인데 작은방은 북쪽인 구조도 있고, 거실과 방이 서로 다른 쪽을 향하는 평면도 있습니다. 주실을 기준으로 남향이라고 적었다고 해서 집 전체가 남쪽을 향한다는 뜻은 아닙니다.

## 방향과 일조는 다른 정보입니다

방향은 주실이 어느 쪽을 향하는지를 나타내고, 일조는 실제로 햇빛이 얼마나 드는지의 문제입니다. 둘은 같은 정보가 아닙니다.

같은 단지에 남향인 두 집이 있다고 해보겠습니다. 한 집은 5층인데 바로 앞에 20층 동이 서 있고, 다른 집은 15층인데 앞이 트여 있습니다. 매물에는 둘 다 남향으로 적힙니다. 실제 채광은 다릅니다. 층수, 앞 동의 높이, 동 간 거리, 건물 배치, 주변 지형이 모두 햇빛을 가리기 때문입니다.

계절도 영향을 줍니다. 태양의 고도가 달라지므로 같은 집이라도 여름과 겨울에 햇빛이 드는 깊이와 시간이 달라집니다.

방향만 놓고 보면 남동향은 오전 햇빛을 이르게 받고 남서향은 오후 늦게까지 받는 편입니다. 다만 이것은 방향 자체의 차이일 뿐, 그 집에 햇빛이 얼마나 드는지까지 정하지는 않습니다.

## 집을 보러 갔다면 확인할 것

- 방향의 기준이 거실인지 안방인지
- 거실 창이 실제로 어느 쪽을 향하는지
- 거실과 각 방의 방향이 어떻게 갈리는지
- 창 앞에 다른 동이나 건물이 있는지, 거리와 높이는 어떤지
- 방문한 시간에 거실과 방에 햇빛이 드는지

휴대전화 나침반으로 방향을 직접 확인할 수도 있습니다. 실내에서는 전자기기나 건물 구조의 영향으로 오차가 생기므로 참고값으로 쓰는 편이 안전합니다.

매물에 적힌 남향은 집을 판단하는 결론이 아니라, 현장에서 확인을 시작할 첫 번째 정보에 가깝습니다.`,
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
    sourceDateIsPublication: false, // 원문 발행일이 아니라 우리가 조문·고시를 확인한 날이다
    sourceExcerpt: SOURCE.sourceExcerpt.slice(0, 4000),
    dedupeKey: DEDUPE_KEY,
    dateISO: '2026-08-26',
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
    logger.error({ err }, 'insert-listing-direction fatal');
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
