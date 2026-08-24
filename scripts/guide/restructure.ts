/**
 * ⚠️ 2026-08-24 실행 중지. 공유 함수 `restructureBody`가 board 쪽 요구로 방향이 반전됐다
 * (핵심요약 골격 '부여' → '제거'). 이 스크립트는 그 변경에 맞춰 정비되지 않았고,
 * 지금 돌리면 가이드 본문을 조용히 손상시킨다:
 *
 *   1. 선택 조건이 아직 `NOT contains '## 핵심 요약'`이라, 골격이 없는 가이드를 골라
 *      골격을 제거하는 프롬프트에 태운다(무의미한 재작성 + 과금).
 *   2. 새 프롬프트 6번이 라벨형 소제목을 서술구로 바꾸는데, `lib/guide/insert-blocks.ts`가
 *      `## 완속·급속 충전 방식, 무엇이 다를까?` 등 **정확한 소제목 문자열 13개**에
 *      `[[data:<키>]]` 블록을 앵커링한다. 소제목이 바뀌면 앵커가 끊긴다.
 *   3. `runGuideGuardrails`는 출처·금지표현·길이만 본다 — 끊긴 앵커를 잡지 못한다.
 *
 * 가이드 쪽을 진행하려면 먼저 앵커 소제목 보존을 프롬프트/후처리로 보장해야 한다.
 * 그때까지 이 스크립트는 실행되지 않는다.
 *
 * 실행(정비 후):
 *   pnpm dlx dotenv -e .env.local -- tsx scripts/guide/restructure.ts --limit 5 --dry-run
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { createOpenAiClient } from '@/lib/board/generate';
import { restructureBody } from '@/lib/board/restructure';
import { runGuideGuardrails } from '@/lib/guide/guardrails';

function argNum(flag: string, def: number): number {
  const i = process.argv.indexOf(flag);
  if (i === -1) return def;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : def;
}

async function main() {
  // 위 헤더 주석 참고. 공유 프롬프트 반전 이후 정비 전까지 실행 금지 — data 블록 앵커가 끊긴다.
  // 정비를 마치면 이 가드 블록을 지운다(환경변수로 우회하라는 뜻이 아니다).
  if (!process.env.GUIDE_RESTRUCTURE_ANCHORS_VERIFIED) {
    logger.error(
      'scripts/guide/restructure.ts는 실행 중지 상태다(헤더 주석 참고). ' +
        'lib/guide/insert-blocks.ts의 앵커 소제목 13개가 보존되는지 확인·정비한 뒤 이 가드를 제거하라.',
    );
    process.exitCode = 1;
    return;
  }

  const dryRun = process.argv.includes('--dry-run');
  const inPlace = process.argv.includes('--in-place');
  const limit = argNum('--limit', 5);
  const client = createOpenAiClient(env.OPENAI_API_KEY);

  const guides = await prisma.guide.findMany({
    where: { status: 'PUBLISHED', NOT: { body: { contains: '## 핵심 요약' } } },
    orderBy: { publishedAt: 'asc' },
    take: limit,
  });
  logger.info({ count: guides.length, dryRun }, 'guide restructure 대상');

  for (const guide of guides) {
    const newBody = await restructureBody(client, guide.body, env.OPENAI_MODEL, 6000);
    const guard = runGuideGuardrails({ body: newBody, sourceName: guide.sourceName, sourceUrl: guide.sourceUrl });
    const charCount = newBody.replace(/\s/g, '').length;
    logger.info({ id: String(guide.id), title: guide.title, charCount, guardOk: guard.ok }, 'restructured');
    console.log(`\n[#${guide.id}] ${guide.title}\n${'-'.repeat(60)}\n${newBody}\n${'-'.repeat(60)}\n가드레일: ${guard.ok ? 'PASS ✅' : 'FAIL ❌ → ' + guard.violations.join(', ')} (공백제외 ${charCount}자)\n`);

    if (dryRun) continue;
    if (!guard.ok) {
      logger.warn({ id: String(guide.id), violations: guard.violations }, '가드레일 실패 — 건너뜀(원본 유지)');
      continue;
    }
    if (inPlace) {
      await prisma.guide.update({ where: { id: guide.id }, data: { body: newBody } });
      logger.info({ id: String(guide.id) }, 'in-place 수정(게시·게시일 유지)');
    } else {
      await prisma.guide.update({
        where: { id: guide.id },
        data: { body: newBody, status: 'DRAFT', reviewedAt: null },
      });
      logger.info({ id: String(guide.id) }, 'DRAFT로 되돌림 — 어드민에서 검수');
    }
  }
}

main()
  .catch((err) => { logger.error({ err }, 'guide restructure fatal'); process.exit(1); })
  .finally(() => { void prisma.$disconnect(); });
