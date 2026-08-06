/**
 * 손수 작성 게시글 여러 건을 JSON에서 읽어 운영 DB에 DRAFT로 일괄 삽입한다(게시판 비공개라 노출 X).
 * insert-manual.ts와 동일 원칙: OpenAI 미사용, createDraft 재사용(dedupe·가드레일·slug). 검수는 /admin/posts.
 *
 * 입력 JSON(기본 scripts/board/batch-articles.json): 아래 형태의 배열.
 *   [{ title, summary, type, category, body, sourceName, sourceUrl, sourceDate("YYYY-MM-DD"), sourceExcerpt, detectedFrom }]
 *
 * 실행:
 *   pnpm tsx scripts/board/insert-batch.ts --dry-run                      # 가드레일·분량만 확인(DB 미접속)
 *   pnpm exec dotenv -e .env.local -- tsx scripts/board/insert-batch.ts   # 운영 DB에 DRAFT 일괄 생성
 *   (파일 경로 지정: 마지막 인자로 JSON 경로)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import type { GenerateResult } from '@/lib/board/generate';
import type { PostType, PostCategory } from '@prisma/client';
import { createDraft } from '@/lib/board/create-draft';
import { runGuardrails } from '@/lib/board/guardrails';
import { dedupeKey, kstDateISO } from '@/scripts/ingest/posts/keys';

interface ArticleInput {
  title: string;
  summary: string;
  type: PostType;
  category: PostCategory;
  body: string;
  sourceName: string;
  sourceUrl: string;
  sourceDate: string; // YYYY-MM-DD (KST)
  sourceExcerpt: string;
  detectedFrom?: string;
}

function nonWs(s: string): number {
  return s.replace(/\s/g, '').length;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const jsonArg = args.find((a) => !a.startsWith('--'));
  const jsonPath = resolve(jsonArg ?? 'scripts/board/batch-articles.json');

  const articles: ArticleInput[] = JSON.parse(readFileSync(jsonPath, 'utf8'));
  logger.info({ count: articles.length, jsonPath, dryRun }, 'batch insert start');

  const summary: { title: string; status: string; detail?: string }[] = [];

  for (const a of articles) {
    const guard = runGuardrails({ body: a.body, sourceName: a.sourceName, sourceUrl: a.sourceUrl });
    const len = nonWs(a.body);
    const head = `[${a.type}/${a.category}] ${a.title}`;

    if (!guard.ok) {
      console.log(`❌ ${head}\n   가드레일 FAIL (${len}자): ${guard.violations.join(', ')}\n`);
      summary.push({ title: a.title, status: 'GUARDRAIL_FAIL', detail: `${len}자 / ${guard.violations.join(', ')}` });
      continue;
    }
    console.log(`✅ ${head}\n   가드레일 PASS (공백제외 ${len}자) · 출처: ${a.sourceName}\n`);

    if (dryRun) {
      summary.push({ title: a.title, status: 'DRY_OK', detail: `${len}자` });
      continue;
    }

    const gen: GenerateResult = {
      type: a.type, category: a.category, title: a.title, summary: a.summary, body: a.body,
    };
    const sourceDate = new Date(`${a.sourceDate}T00:00:00+09:00`);
    const res = await createDraft({
      gen,
      sourceName: a.sourceName,
      sourceUrl: a.sourceUrl,
      sourceDate,
      sourceDateIsPublication: true, // 사람이 원문 발행일을 확인해 JSON에 적었다
      sourceExcerpt: a.sourceExcerpt.slice(0, 4000),
      dedupeKey: dedupeKey(a.sourceUrl),
      dateISO: kstDateISO(sourceDate),
      detectedFrom: a.detectedFrom ?? 'manual:batch',
    });
    summary.push({ title: a.title, status: res.status, detail: res.status === 'created' ? res.slug : (res.status === 'rejected' ? res.violations.join(', ') : undefined) });
    logger.info({ title: a.title, ...res }, 'createDraft result');
  }

  console.log('\n==== 요약 ====');
  for (const s of summary) console.log(`- ${s.status}\t${s.title}${s.detail ? `  (${s.detail})` : ''}`);
  const created = summary.filter((s) => s.status === 'created').length;
  if (!dryRun && created > 0) {
    await notify('info', `배치 초안 ${created}건 생성 — /admin/posts 검수 대기`, { created });
  }
}

main()
  .catch((err) => {
    logger.error({ err }, 'insert-batch fatal');
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
