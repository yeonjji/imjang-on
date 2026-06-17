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
 * 청년 자산형성 통장 2종(서울시 희망두배 + 정부 청년내일저축계좌)의 사실만 옮긴 근거 자료.
 * 단일 제도는 공공기록 사실량이 적어 1000자 하한 미달 → 매칭형 통장 2종 묶음으로 확장.
 * 원자료(전부 공식): 서울시 보도자료(2026-06-15, 복지정책과) news.seoul.go.kr/welfare/archives/581505,
 *   서울시 자산형성지원사업 안내(account.welfare.seoul.kr), 보건복지부 자활정책과 청년내일저축계좌 보도자료.
 * 검증 불확실한 2026 변경(청년미래적금·중위 50~100% 구간)은 제외 — 추측·미명시 수치 금지.
 */
const SOURCE = {
  sourceName: '서울특별시·보건복지부',
  sourceUrl: 'https://news.seoul.go.kr/welfare/archives/581505',
  sourceDate: new Date('2026-06-15T00:00:00+09:00'),
  detectedFrom: 'topic:youth-asset-accounts',
  sourceText: `[청년 자산형성 통장 안내 — 임장온 정리]
원자료: 서울특별시 복지정책과(2026년 6월 15일), 보건복지부 자활정책과.
아래는 일하는 청년이 본인 저축액에 공공기관이 같은 금액 이상을 얹어 목돈을 만들어 주는 '매칭형 자산형성 통장' 두 가지의 사실 정리다.

[1] 서울특별시 '희망두배 청년통장'
운영은 서울시와 서울사회복지공동모금회, 서울시복지재단이 함께 맡는다. 서울시는 2026년 신규 참가자 1만 명을 모집하며, 신청 접수는 6월 8일(월)부터 6월 19일(금)까지 서울시 자산형성지원사업 누리집(account.welfare.seoul.kr)에서 온라인으로 받는다. 최종 선정자는 11월 3일(화) 발표하고 저축은 11월부터 시작한다.
지원 대상은 서울에 거주하는 만 18세부터 34세까지(1991년 1월 1일부터 2008년 12월 31일 사이 출생)의 근로 청년이다. 4대 보험 가입 이력이나 원천징수영수증 등으로 최근 1년간 3개월 이상 근로한 사실을 증빙해야 하고, 본인의 세전 월 소득은 255만 원 이하, 부양의무자(부모·배우자)의 소득은 연 1억 원 미만·재산은 9억 원 미만이어야 한다.
참가자가 매월 15만 원을 저축하면 서울시가 같은 금액인 15만 원을 매칭한다. 약정 기간은 2년(24개월) 또는 3년(36개월) 중 선택하며, 2년이면 720만 원, 3년이면 본인 540만 원과 서울시 540만 원을 더한 1,080만 원에 이자까지 받는다. 만기 적립금은 주거비, 교육비, 창업·운영 자금, 결혼 자금에 쓴다.
적립 기간 동안 서울에 연속 거주해야 하고, 저축과 근로를 각각 50% 이상 유지하며, 금융교육을 연 1회 이상 이수해야 한다(서울시가 32종 제공). 2026년에는 공공마이데이터 도입으로 가족관계증명서·4대 보험 가입정보 제출이 간소화됐다. 문의는 콜센터 1688-1453.

[2] 정부 '청년내일저축계좌'
보건복지부(자활정책과)가 운영하는 전국 단위 사업이다. 지원 대상은 가구 소득이 기준 중위소득 50% 이하인 일하는 청년으로, 신청 당시 만 15세부터 39세까지이며 근로·사업소득이 매월 10만 원 이상 발생해야 한다.
본인이 매월 10만 원부터 50만 원까지 저축하면 정부가 월 30만 원을 지원한다(가구 소득 기준 중위소득 50% 이하 기준). 약정 기간은 3년이며, 3년 만기 시 본인 저축금 360만 원과 정부 지원금을 더해 총 1,440만 원에 적금 이자(최대 연 5%)까지 받는다.
만기 자금을 받으려면 근로활동을 지속하고, 자립역량교육 10시간을 이수하며, 자금활용계획서를 제출해야 한다. 2026년 신청은 5월 4일부터 5월 20일까지였고, 복지로(bokjiro.go.kr) 온라인 또는 읍·면·동 행정복지센터에서 접수했다.

[공통점과 차이]
두 사업 모두 본인 저축액에 공공이 같은 금액 이상을 매칭해 목돈을 만들어 주는 자산형성 지원이다. 희망두배는 서울 거주 청년이 서울시 예산으로, 청년내일저축계좌는 전국의 기준 중위소득 50% 이하 일하는 청년이 정부 예산으로 지원받는다. 운영 주체, 소득·거주 요건, 매칭액과 만기 수령액, 신청 시기와 창구가 서로 다르다.`,
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
    await notify('warn', '청년 자산형성 통장 토픽 초안 가드레일 실패 — 미생성', { violations: guard.violations });
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
    await notify('info', `청년 자산형성 통장 토픽 초안 1건 대기: ${gen.title}`, { slug: res.slug });
  } else if (res.status === 'duplicate') {
    logger.info('이미 생성된 출처(dedupeKey 중복) — 건너뜀');
  } else {
    logger.error({ violations: res.violations }, 'createDraft rejected');
    await notify('warn', '청년 자산형성 통장 토픽 초안 rejected', { violations: res.violations });
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
