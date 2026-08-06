/**
 * 손수 작성 게시글 1건을 운영 DB에 DRAFT로 넣는다. 검수는 /admin/posts.
 * insert-manual.ts와 동일 패턴(OpenAI 미사용, createDraft 재사용 → dedupe·가드레일·slug).
 *
 * 본문의 모든 수치는 아래 공식 출처에서 교차검증했다(2026-06-19 기준).
 * - 법제처 국가법령정보센터(law.go.kr): 지방세법 제11조(취득세율)·제13조의2(다주택 중과)·제20조(신고납부)·
 *   제151조(지방교육세), 지방세특례제한법 제36조의3(생애최초 주택 취득세 감면)
 * - 찾기쉬운 생활법령정보(easylaw.go.kr): 농어촌특별세 85㎡ 기준·0.2%
 * 시의성 주의: 생애최초 감면은 종전 2025-12-31 일몰에서 2028-12-31로 연장(시행 2026-06-02, 법률 제21738호).
 * 다주택 중과는 2022-12-21 정부 완화안이 미입법되어 종전 세율(2주택 8%·3주택이상/법인 12%)이 그대로 시행 중.
 *
 * 실행:
 *   pnpm tsx scripts/board/insert-acquisition-tax.ts --dry-run                      # 가드레일·분량만 확인(DB 미접속)
 *   pnpm exec dotenv -e .env.local -- tsx scripts/board/insert-acquisition-tax.ts   # 운영 DB에 DRAFT 생성
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import type { GenerateResult } from '@/lib/board/generate';
import { createDraft } from '@/lib/board/create-draft';
import { runGuardrails } from '@/lib/board/guardrails';
import { dedupeKey, kstDateISO } from '@/scripts/ingest/posts/keys';

const SOURCE = {
  sourceName: '법제처 국가법령정보센터(지방세법·지방세특례제한법)',
  sourceUrl: 'https://www.law.go.kr/법령/지방세법',
  sourceDate: new Date('2026-06-19T00:00:00+09:00'),
  detectedFrom: 'manual:acquisition-tax-2026',
  sourceExcerpt: `주택 취득세 안내 — 공식 출처 정리(2026-06-19 기준)
[세율] 지방세법 제11조 제1항 제8호: 개인 1주택 유상취득 세율 = 6억원 이하 1%, 6억 초과~9억 이하 누진(세율% = (취득당시가액(억원) × 2/3 − 3), 7.5억원→2.0%), 9억원 초과 3%. (law.go.kr)
[부가세] 지방교육세는 취득세율의 10%(제151조). 농어촌특별세는 전용 85㎡ 초과 시 0.2%, 85㎡ 이하 비과세(농특세법, easylaw.go.kr). 예: 6억 이하·85㎡ 초과 = 1%+0.1%+0.2%=1.3%.
[신고납부] 지방세법 제20조: 유상취득은 취득일부터 60일 이내 소재지 시·군·구청 신고·납부.
[생애최초 감면] 지방세특례제한법 제36조의3: 취득가 12억원 이하 + 본인·배우자 무주택(생애최초). 2023년 개정으로 소득·연령·혼인 요건 폐지. 감면 한도 일반 200만원(소형 전용 60㎡ 이하 등 300만원), 한도 이하 전액 면제·초과 시 한도 공제. 적용기한 2028-12-31 취득분까지(시행 2026-06-02, 법률 제21738호).
[추징] 제36조의3 제3항: 취득일부터 3개월 내 전입·실거주 미개시, 3개월 내 추가주택 취득(상속 제외), 3년 내 매각·증여(배우자 제외)·임대 시 감면액 추징.
[다주택 중과] 지방세법 제13조의2: 조정대상지역 2주택 8%·3주택 이상 12%, 비조정 3주택 8%·4주택 이상 12%, 법인 12%. 2022-12-21 완화안 미입법으로 종전 세율 현행 유지.`,
} as const;

const GEN: GenerateResult = {
  type: 'PROGRAM',
  category: 'REALESTATE',
  title: '주택 취득세, 세율부터 생애최초 200만원 감면까지',
  summary:
    '집을 살 때 내는 취득세를 6억·9억원 구간 세율, 함께 붙는 지방교육세·농어촌특별세, 생애최초 구입 시 감면, 다주택 중과로 나눠 공공 법령 기준으로 정리했습니다.',
  body: `집을 사면 취득에 대한 지방세인 취득세를 낸다. 유상거래로 주택을 취득하면 취득한 날부터 60일 이내에 주택 소재지 시·군·구청에 신고·납부해야 한다. 세율은 취득가액과 보유 주택 수에 따라 달라지고, 생애 처음 집을 사는 경우 일정액을 감면받는다. 국가법령정보센터에 공개된 지방세법과 지방세특례제한법(2026년 6월 기준)을 토대로 정리했다.

## 주택 취득세율 — 6억·9억원이 기준선

개인이 1주택을 유상취득할 때 세율은 취득가액 6억원과 9억원을 경계로 나뉜다(지방세법 제11조). 6억원 이하는 1%, 9억원 초과는 3%다. 6억원 초과 9억원 이하 구간은 가격에 비례해 1%에서 3%까지 오르며, 세율(%)은 '(취득가액(억원) × 2/3 − 3)'으로 계산한다. 예를 들어 7억5천만원이면 2.0%다. 6억원이면 1%, 9억원이면 3%로 양 끝 값이 맞아떨어진다.

## 함께 붙는 지방교육세·농어촌특별세

취득세에는 지방교육세가 더해진다. 세율은 취득세율의 10%로, 취득세가 1%면 지방교육세는 0.1%다. 전용면적 85㎡를 넘는 주택에는 농어촌특별세 0.2%가 추가되고, 85㎡ 이하는 농어촌특별세가 면제된다. 따라서 6억원 이하이면서 85㎡를 넘는 주택은 취득세 1%에 지방교육세 0.1%, 농어촌특별세 0.2%를 더해 합계 1.3%를 부담한다.

## 생애최초로 사면 200만원까지 감면

생애 처음 주택을 사면 취득세를 감면받는다(지방세특례제한법 제36조의3). 취득 당시 가액 12억원 이하 주택이 대상이고, 본인과 배우자가 과거 주택을 소유한 적이 없어야 한다. 2023년 개정으로 소득·연령·혼인 요건은 없어졌다. 감면액은 산출된 취득세가 200만원 이하면 전액 면제하고, 200만원을 넘으면 200만원을 공제한 나머지만 낸다. 전용면적 60㎡ 이하 등 소형주택은 한도가 300만원이다. 이 감면은 2028년 12월 31일까지 취득하는 분에 적용된다.

## 감면 뒤에는 실거주 조건이 따른다

감면을 받은 뒤 요건을 어기면 감면액을 다시 추징한다. 취득일부터 3개월 안에 전입해 실제 거주를 시작하지 않거나, 3개월 안에 다른 주택을 추가로 취득하거나(상속 제외), 3년 안에 해당 주택을 팔거나 증여(배우자 증여 제외)·임대하면 추징 대상이 된다.

## 2주택부터는 세율이 올라간다

보유 주택 수가 늘면 세율이 중과된다(지방세법 제13조의2). 조정대상지역에서는 2주택 8%, 3주택 이상 12%이고, 비조정대상지역에서는 3주택 8%, 4주택 이상 12%다. 법인은 주택 수·지역과 무관하게 12%다. 2022년 말 정부가 중과 완화안을 발표했으나 법 개정이 이뤄지지 않아 2026년 6월 현재 종전 세율이 그대로 유지된다.`,
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
    sourceDateIsPublication: true, // 사람이 원문 발행일을 확인해 넣었다
    sourceExcerpt: SOURCE.sourceExcerpt.slice(0, 4000),
    dedupeKey: dedupeKey(SOURCE.sourceUrl),
    dateISO: kstDateISO(SOURCE.sourceDate),
    detectedFrom: SOURCE.detectedFrom,
  });

  if (res.status === 'created') {
    logger.info({ slug: res.slug }, 'DRAFT 생성 완료 — /admin/posts에서 검수');
    await notify('info', `취득세 토픽 초안 1건 대기: ${GEN.title}`, { slug: res.slug });
  } else if (res.status === 'duplicate') {
    logger.info('이미 생성된 출처(dedupeKey 중복) — 건너뜀');
  } else {
    logger.error({ violations: res.violations }, 'createDraft rejected');
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    logger.error({ err }, 'insert-acquisition-tax fatal');
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
