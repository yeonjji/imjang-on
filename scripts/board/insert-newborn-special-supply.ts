/**
 * 손수 작성 게시글 1건을 운영 DB에 DRAFT로 넣는다(게시판 비공개라 노출 X). 검수는 /admin/posts.
 * insert-manual.ts와 동일 패턴(OpenAI 미사용, createDraft 재사용 → dedupe·가드레일·slug).
 *
 * 주제: 2026-06-15 시행 '주택공급에 관한 규칙' 개정 — 민영주택 신생아 특별공급 신설.
 * 모든 사실은 국토교통부 발표(2026-06-14)·개정 규칙을 다수 공식/언론 교차검증함(2026-06-18 기준).
 * 출처 링크: 국토부 보도자료(molit dtl.jsp)는 리다이렉트 루프로 공개 링크 부적합 → 국가법령정보센터
 * 「주택공급에 관한 규칙」(현행, 200 확인)을 출처 URL로 사용.
 *
 * 실행:
 *   pnpm tsx scripts/board/insert-newborn-special-supply.ts --dry-run                    # 가드레일·분량만 확인(DB 미접속)
 *   pnpm exec dotenv -e .env.local -- tsx scripts/board/insert-newborn-special-supply.ts # 운영 DB에 DRAFT 생성
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import type { GenerateResult } from '@/lib/board/generate';
import { createDraft } from '@/lib/board/create-draft';
import { runGuardrails } from '@/lib/board/guardrails';
import { dedupeKey, kstDateISO } from '@/scripts/ingest/posts/keys';

const SOURCE = {
  sourceName: '국토교통부 「주택공급에 관한 규칙」',
  // 국가법령정보센터 현행 규칙(친화 URL, 항상 시행본으로 연결). 국토부 dtl.jsp는 리다이렉트 루프로 제외.
  sourceUrl: 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%A3%BC%ED%83%9D%EA%B3%B5%EA%B8%89%EC%97%90%EA%B4%80%ED%95%9C%EA%B7%9C%EC%B9%99',
  sourceDate: new Date('2026-06-15T00:00:00+09:00'),
  detectedFrom: 'manual:newborn-special-supply',
  sourceExcerpt: `민영주택 신생아 특별공급 신설 — 공식 출처 정리(2026-06-18 기준)
국토교통부는 '주택공급에 관한 규칙' 개정안을 2026년 6월 14일 발표하고 2026년 6월 15일부터 시행했다. 핵심:
[민영 신생아 특별공급] 민영주택 특별공급 물량의 10%를 '신생아 특별공급'으로 신설. 대상은 입주자모집공고일 기준 만 2세 미만 자녀(태아·입양 포함)를 둔 무주택세대구성원. 혼인 후 7년 이내라는 신혼부부 특공 요건과 무관하게 출산가구가 청약 가능. 소득요건은 생애최초 특공 기준(전년도 도시근로자 월평균소득 기준) 적용. 경쟁 시 추첨으로 당첨자 선정. 기존에는 신혼부부·생애최초 특공 안에서만 신생아 우선배정이 이뤄졌음.
[지방 특별공급 간소화] 같은 개정으로 특별공급 허용 대상에 '지역 기업 유치 및 인구 유입'을 추가하고, 시·도지사가 인정하면 별도 절차 없이 즉시 시행 가능하도록 절차를 간소화. 지방 이전기업 종사자·지역 정착 이주자 주거지원 확대.
출처: 국토교통부 보도자료(2026-06-14 발표), 주택공급에 관한 규칙(국가법령정보센터). 사실은 한국경제·서울경제·파이낸셜뉴스·뉴스핌 등 국토부 인용 보도로 교차검증.`,
} as const;

const GEN: GenerateResult = {
  type: 'PROGRAM',
  category: 'SUBSCRIPTION',
  title: "민영주택에도 '신생아 특별공급' 신설…6월 15일 시행",
  summary:
    '국토교통부가 민영주택 특별공급 물량의 10%를 신생아 특별공급으로 신설해 2026년 6월 15일 시행했습니다. 혼인 후 7년 요건과 무관하게 만 2세 미만 자녀를 둔 무주택 출산가구가 청약할 수 있습니다.',
  body: `정부가 출산가구의 내 집 마련 기회를 넓히기 위해 민영주택 청약에 '신생아 특별공급'을 새로 만들었습니다. 국토교통부는 이런 내용을 담은 '주택공급에 관한 규칙' 개정안을 2026년 6월 14일 발표하고, 다음 날인 6월 15일부터 시행했습니다.

## 민영주택 신생아 특별공급 신설

이번 개정의 핵심은 민영주택 특별공급 물량의 10%를 '신생아 특별공급'으로 따로 배정한 것입니다. 그동안 민영주택에서는 신혼부부 특별공급(전체 물량의 약 23%)이나 생애최초 특별공급 안에서 신생아 가구에 일부를 우선 배정하는 데 그쳤는데, 이번에 출산가구를 위한 별도 물량이 독립된 공급 유형으로 처음 분리됐습니다.

대상은 입주자모집공고일 기준 만 2세 미만 자녀(태아와 입양아 포함)를 둔 무주택세대구성원입니다. 특히 혼인 후 7년 이내라는 신혼부부 특별공급 요건과 관계없이, 출산 사실만 있으면 청약할 수 있습니다. 혼인 여부나 혼인 시점과 무관하게 출산가구라면 신청 길이 열린 것입니다. 소득요건은 생애최초 특별공급과 같은 기준인 전년도 도시근로자 월평균소득 기준을 적용합니다. 물량은 우선공급과 일반공급으로 나눠 배정하며, 신청이 몰려 경쟁이 생기면 추첨으로 당첨자를 가립니다.

## 지방 특별공급 절차도 간소화

같은 개정안에는 지방 특별공급 제도를 손보는 내용도 함께 담겼습니다. 특별공급을 허용할 수 있는 대상에 '지역 기업 유치 및 인구 유입'을 새로 넣어, 지방자치단체가 지역 여건에 맞춰 특별공급을 활용할 수 있게 했습니다. 또 시·도지사가 필요성을 인정하면 별도 절차 없이 바로 특별공급을 시행할 수 있도록 절차를 줄였습니다. 이에 따라 지방으로 이전하는 기업의 종사자나 지역에 정착하려는 이주자에 대한 주거지원이 넓어집니다.

## 청약 전 확인할 점

특별공급은 정책적 배려가 필요한 계층에게 일반공급과 경쟁하지 않고 별도 물량을 배정하는 제도로, 한 세대가 평생 한 번만 받을 수 있습니다. 신청하려면 주택청약종합저축(청약통장)에 가입해 단지가 정한 예치금액과 가입 기간 기준을 충족해야 하고, 세대 구성원 전원이 주택을 소유하지 않은 무주택세대구성원이어야 합니다.

신생아 특별공급은 민영주택에 적용되며, 공급 물량과 세부 청약 자격·일정은 단지별 입주자모집공고에 따라 달라집니다. 청약 자격과 소득·자산 요건, 무주택 여부는 청약홈(applyhome.co.kr)에서 단지별 공고와 함께 확인할 수 있습니다. 출산가구는 신생아 특별공급 외에 신혼부부·생애최초 등 다른 특별공급 자격도 함께 갖출 수 있으므로, 본인에게 맞는 유형을 공고에서 비교한 뒤 신청하면 됩니다. 다만 특별공급에 당첨된 사실이 있으면 이후 다른 주택의 특별공급에는 다시 신청할 수 없으므로, 청약 시점과 단지를 신중히 골라야 합니다.`,
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const guard = runGuardrails({ body: GEN.body, sourceName: SOURCE.sourceName, sourceUrl: SOURCE.sourceUrl });
  const charCount = GEN.body.replace(/\s/g, '').length;

  console.log(
    `\n[${GEN.type}/${GEN.category}] ${GEN.title}\n${GEN.summary}\n${'-'.repeat(60)}\n${GEN.body}\n${'-'.repeat(60)}\n` +
      `가드레일: ${guard.ok ? 'PASS ✅' : 'FAIL ❌ → ' + guard.violations.join(', ')} (공백제외 ${charCount}자)\n`,
  );

  if (dryRun) {
    logger.info({ guardOk: guard.ok, charCount }, 'DRY RUN — DB 미기록');
    return;
  }
  if (!guard.ok) {
    logger.error({ violations: guard.violations }, '가드레일 실패 — 미생성');
    process.exitCode = 1;
    return;
  }

  const res = await createDraft({
    gen: GEN,
    sourceName: SOURCE.sourceName,
    sourceUrl: SOURCE.sourceUrl,
    sourceDate: SOURCE.sourceDate,
    sourceExcerpt: SOURCE.sourceExcerpt.slice(0, 4000),
    dedupeKey: dedupeKey(SOURCE.sourceUrl),
    dateISO: kstDateISO(SOURCE.sourceDate),
    detectedFrom: SOURCE.detectedFrom,
  });

  if (res.status === 'created') {
    logger.info({ slug: res.slug }, 'DRAFT 생성 완료 — /admin/posts에서 검수');
    await notify('info', `신생아 특별공급 토픽 초안 1건 대기: ${GEN.title}`, { slug: res.slug });
  } else if (res.status === 'duplicate') {
    logger.info('이미 생성된 출처(dedupeKey 중복) — 건너뜀');
  } else {
    logger.error({ violations: res.violations }, 'createDraft rejected');
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    logger.error({ err }, 'insert-newborn-special-supply fatal');
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
