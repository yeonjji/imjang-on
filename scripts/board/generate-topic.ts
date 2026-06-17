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
 * 서울특별시 보도자료(2026-06-15, 복지기획관 복지정책과)의 사실만 옮긴 근거 자료.
 * 출처: https://news.seoul.go.kr/welfare/archives/581505
 * 본문에 없는 수치(가구소득 기준 등)는 의도적으로 넣지 않는다.
 */
const SOURCE = {
  sourceName: '서울특별시',
  sourceUrl: 'https://news.seoul.go.kr/welfare/archives/581505',
  sourceDate: new Date('2026-06-15T00:00:00+09:00'),
  detectedFrom: 'topic:heemang-2bae',
  sourceText: `[서울특별시 보도자료] 2026년 6월 15일 · 복지기획관 복지정책과
제목: 일하는 청년의 목돈 마련을 돕는 '희망두배 청년통장' 2026년 신규 참가자 모집

서울특별시는 일하는 청년의 목돈 마련을 지원하기 위해 '희망두배 청년통장' 2026년 신규 참가자 1만 명을 모집한다. 신청 기간은 6월 8일(월)부터 6월 19일(금)까지이며, 서울시 자산형성지원사업 누리집(account.welfare.seoul.kr)에서 온라인으로 신청할 수 있다.

희망두배 청년통장은 참가자가 매월 15만 원을 저축하면 서울시가 같은 금액인 15만 원을 매칭해 함께 적립해 주는 자산형성 지원 사업이다. 약정 기간은 본인이 선택할 수 있으며, 2년을 저축하면 720만 원, 3년을 저축하면 1,080만 원을 적립할 수 있다(이자 별도).

지원 대상은 서울에 거주하는 만 18세부터 34세까지의 근로 청년이다. 본인의 월평균 소득이 255만 원 이하여야 하며, 최근 1년 내 3개월 이상 근로했거나 현재 3개월 이상 근로 중임을 증빙해야 한다.

신청은 6월 8일부터 6월 19일까지 서울시 자산형성지원사업 누리집(account.welfare.seoul.kr)에서 받는다. 사업에 관한 문의는 희망두배 청년통장 콜센터(1688-1453)로 하면 된다.`,
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
