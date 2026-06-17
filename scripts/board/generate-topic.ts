/**
 * 토픽 지정 생성: 사용자가 고른 주제를 공식 출처 본문으로 generateDraft → createDraft 하여
 * 운영 DB에 DRAFT 1건을 만든다(게시판은 비공개라 노출 X). 검수는 /admin/posts.
 *
 * 피드 자동 수집(runner.ts)과 달리, 피드에 안 잡히는 주제(지자체 상품 등)를 손으로 1건 올릴 때 쓴다.
 * 출처 본문(SOURCE.sourceText)에 있는 사실만 기사가 된다 — 프로젝트 사실 원칙(추측·전망·추천 금지).
 *
 * 실행(OPENAI_API_KEY 필요):
 *   pnpm tsx scripts/board/generate-topic.ts            # DRAFT 생성(DB 기록)
 *   pnpm tsx scripts/board/generate-topic.ts --dry-run  # 생성만 하고 DB 미기록(로그 출력)
 * GitHub Actions: generate-board-topic.yml (workflow_dispatch).
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { notify } from '@/scripts/ingest/notify';
import { generateDraft, createOpenAiClient } from '@/lib/board/generate';
import { createDraft } from '@/lib/board/create-draft';
import { runGuardrails } from '@/lib/board/guardrails';
import { dedupeKey, kstDateISO } from '@/scripts/ingest/posts/keys';

/**
 * 서울시 공식 자료의 사실만 옮긴 근거 자료(추측·미명시 수치 추가 금지).
 * 출처: 서울특별시 보도자료(2026-06-15, 복지기획관 복지정책과)
 *       https://news.seoul.go.kr/welfare/archives/581505
 *       + 서울시 자산형성지원사업 공식 안내(account.welfare.seoul.kr) — 사업 개요·자격·적립·유지조건.
 */
const SOURCE = {
  sourceName: '서울특별시',
  sourceUrl: 'https://news.seoul.go.kr/welfare/archives/581505',
  sourceDate: new Date('2026-06-15T00:00:00+09:00'),
  detectedFrom: 'topic:heemang-2bae',
  sourceText: `[서울특별시 자료] 2026년 6월 15일 · 복지기획관 복지정책과
제목: 일하는 청년의 목돈 마련을 돕는 '희망두배 청년통장' 2026년 신규 참가자 모집

[사업 취지]
희망두배 청년통장은 학자금 대출, 주거비, 비정규직 취업 등으로 어려움을 겪는 근로 청년이 목돈을 마련해 경제적으로 자립하고 미래를 계획할 수 있도록 돕는 서울시 자산형성 지원 사업이다. 운영은 서울시와 서울사회복지공동모금회, 서울시복지재단이 함께 맡는다.

[2026년 모집 개요와 일정]
서울특별시는 2026년 신규 참가자 1만 명을 모집한다. 신청 접수는 6월 8일(월)부터 6월 19일(금)까지이며, 서울시 자산형성지원사업 누리집(account.welfare.seoul.kr)에서 온라인으로 받는다. 최종 선정자는 11월 3일(화) 발표하며, 저축은 11월부터 시작한다.

[지원 대상]
서울에 거주하는 만 18세부터 34세까지(1991년 1월 1일부터 2008년 12월 31일 사이 출생)의 근로 청년이 대상이다. 4대 보험 가입 이력이나 원천징수영수증 등으로 최근 1년간 3개월 이상 근로한 사실을 증빙할 수 있어야 한다. 본인의 세전 월 소득은 255만 원 이하여야 하고, 부양의무자(부모·배우자)의 소득은 연 1억 원 미만, 재산은 9억 원 미만이어야 한다.

[적립 구조]
참가자가 매월 15만 원을 저축하면 서울시가 같은 금액인 15만 원을 매칭해 함께 적립한다. 약정 기간은 24개월(2년) 또는 36개월(3년) 중 본인이 선택한다. 2년을 저축하면 720만 원, 3년을 저축하면 본인 저축액 540만 원과 서울시 지원금 540만 원을 더한 1,080만 원에 이자까지 받는다.

[만기금 사용 용도]
만기 적립금은 주거비, 교육비, 창업·운영 자금, 결혼 자금 용도로 사용한다.

[약정 유지 조건]
적립 기간 동안 서울에 연속해 거주해야 하고, 저축과 근로를 각각 50% 이상 유지해야 하며, 금융교육을 연 1회 이상 이수해야 한다. 서울시는 연말정산, 보험 관리 등 32종의 금융교육을 제공한다.

[신청 간소화]
2026년에는 공공마이데이터를 새로 도입해 가족관계증명서와 4대 보험 가입정보 등을 간편하게 제출할 수 있다.

[문의]
사업에 관한 문의는 희망두배 청년통장 콜센터(1688-1453)로 하면 된다.`,
} as const;

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const client = createOpenAiClient(env.OPENAI_API_KEY);
  const gen = await generateDraft(
    client,
    { sourceText: SOURCE.sourceText, sourceName: SOURCE.sourceName },
    env.OPENAI_MODEL,
  );
  const guard = runGuardrails({ body: gen.body, sourceName: SOURCE.sourceName, sourceUrl: SOURCE.sourceUrl });
  const charCount = gen.body.replace(/\s/g, '').length;

  logger.info({ type: gen.type, category: gen.category, title: gen.title, charCount, guardOk: guard.ok }, 'topic draft generated');
  // Actions 로그/콘솔에서 본문을 눈으로 확인할 수 있게 전문 출력.
  console.log(
    `\n[${gen.type}/${gen.category}] ${gen.title}\n${gen.summary}\n${'-'.repeat(60)}\n${gen.body}\n${'-'.repeat(60)}\n` +
      `가드레일: ${guard.ok ? 'PASS ✅' : 'FAIL ❌ → ' + guard.violations.join(', ')} (공백제외 ${charCount}자)\n`,
  );

  if (dryRun) {
    logger.info('DRY RUN — DB 미기록');
    return;
  }
  if (!guard.ok) {
    await notify('warn', '희망두배 토픽 초안 가드레일 실패 — 미생성', { violations: guard.violations });
    process.exitCode = 1;
    return;
  }

  const res = await createDraft({
    gen,
    sourceName: SOURCE.sourceName,
    sourceUrl: SOURCE.sourceUrl,
    sourceDate: SOURCE.sourceDate,
    sourceExcerpt: SOURCE.sourceText.slice(0, 4000),
    dedupeKey: dedupeKey(SOURCE.sourceUrl),
    dateISO: kstDateISO(SOURCE.sourceDate),
    detectedFrom: SOURCE.detectedFrom,
  });

  if (res.status === 'created') {
    logger.info({ slug: res.slug }, 'DRAFT 생성 완료 — /admin/posts에서 검수');
    await notify('info', `희망두배 토픽 초안 1건 대기: ${gen.title}`, { slug: res.slug });
  } else if (res.status === 'duplicate') {
    logger.info('이미 생성된 출처(dedupeKey 중복) — 건너뜀');
  } else {
    logger.error({ violations: res.violations }, 'createDraft rejected');
    await notify('warn', '희망두배 토픽 초안 rejected', { violations: res.violations });
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    logger.error({ err }, 'generate-topic fatal');
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
