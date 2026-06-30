/**
 * 1회성: 게시된(PUBLISHED) guide 글을 핵심요약+섹션 구조로 재구조화한다.
 * 결과는 status=DRAFT, reviewedAt=null로 되돌려 어드민 검수 큐로 보낸다.
 *
 * 실행(OPENAI_API_KEY 필요):
 *   pnpm dlx dotenv -e .env.local -- tsx scripts/guide/restructure.ts --limit 5 --dry-run
 *   pnpm dlx dotenv -e .env.local -- tsx scripts/guide/restructure.ts --limit 5
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
  const dryRun = process.argv.includes('--dry-run');
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
    await prisma.guide.update({
      where: { id: guide.id },
      data: { body: newBody, status: 'DRAFT', reviewedAt: null },
    });
    logger.info({ id: String(guide.id) }, 'DRAFT로 되돌림 — 어드민에서 검수');
  }
}

main()
  .catch((err) => { logger.error({ err }, 'guide restructure fatal'); process.exit(1); })
  .finally(() => { void prisma.$disconnect(); });
