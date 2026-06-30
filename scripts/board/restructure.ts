/**
 * 1회성: 게시된(PUBLISHED) board 글을 핵심요약+섹션 구조로 재구조화한다.
 * 결과는 status=DRAFT, reviewedAt=null로 되돌려 /admin/posts 검수 큐로 보낸다(어드민이 재게시).
 * 사실은 보존하고 구조만 바꾼다(추가·삭제 금지).
 *
 * 실행(OPENAI_API_KEY 필요):
 *   pnpm dlx dotenv -e .env.local -- tsx scripts/board/restructure.ts --limit 5 --dry-run
 *   pnpm dlx dotenv -e .env.local -- tsx scripts/board/restructure.ts --limit 5
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { createOpenAiClient } from '@/lib/board/generate';
import { restructureBody } from '@/lib/board/restructure';
import { runGuardrails } from '@/lib/board/guardrails';

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

  // 아직 핵심요약이 없는 게시글만(재실행 안전). 오래된 글부터.
  const posts = await prisma.post.findMany({
    where: { status: 'PUBLISHED', NOT: { body: { contains: '## 핵심 요약' } } },
    orderBy: { publishedAt: 'asc' },
    take: limit,
  });
  logger.info({ count: posts.length, dryRun }, 'board restructure 대상');

  for (const post of posts) {
    const newBody = await restructureBody(client, post.body, env.OPENAI_MODEL, 2200);
    const guard = runGuardrails({ body: newBody, sourceName: post.sourceName, sourceUrl: post.sourceUrl });
    const charCount = newBody.replace(/\s/g, '').length;
    logger.info({ id: String(post.id), title: post.title, charCount, guardOk: guard.ok }, 'restructured');
    console.log(`\n[#${post.id}] ${post.title}\n${'-'.repeat(60)}\n${newBody}\n${'-'.repeat(60)}\n가드레일: ${guard.ok ? 'PASS ✅' : 'FAIL ❌ → ' + guard.violations.join(', ')} (공백제외 ${charCount}자)\n`);

    if (dryRun) continue;
    if (!guard.ok) {
      logger.warn({ id: String(post.id), violations: guard.violations }, '가드레일 실패 — 건너뜀(원본 유지)');
      continue;
    }
    await prisma.post.update({
      where: { id: post.id },
      data: { body: newBody, status: 'DRAFT', reviewedAt: null },
    });
    logger.info({ id: String(post.id) }, 'DRAFT로 되돌림 — /admin/posts에서 검수');
  }
}

main()
  .catch((err) => { logger.error({ err }, 'board restructure fatal'); process.exit(1); })
  .finally(() => { void prisma.$disconnect(); });
