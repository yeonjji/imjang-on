/**
 * 1회성(2026-10, 로드맵 5-3): 게시된 가이드 본문을 content/guides/<slug>.md 재작성본으로 교체한다.
 * 가이드 본문은 DB에만 있어(생성·admin 게시 경로) 코드 배포만으로는 바뀌지 않는다.
 * 게시된(PUBLISHED) 글만 대상, 게시일(publishedAt)은 유지, 검수일(reviewedAt)만 갱신한다.
 * 초안 하나라도 검증에 실패하면 아무것도 쓰지 않는다. 쓰기 전 운영 DB 백업은 별도로 받는다(PR 본문 참고).
 *
 *   docker compose ... run --rm etl pnpm tsx scripts/guide/apply-rewrites.ts            # dry-run
 *   docker compose ... run --rm etl pnpm tsx scripts/guide/apply-rewrites.ts --apply
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '@/lib/db';
import { parseGuideDraft, validateGuideDraft, type GuideDraft } from '@/lib/guide/rewrite';
import { revalidatePaths } from '@/scripts/ingest/revalidator';

export interface ApplyResult {
  wouldUpdate: string[];
  updated: string[];
  skipped: { slug: string; reason: string }[];
}

export async function applyGuideRewrites(opts: {
  dir: string;
  apply: boolean;
  revalidate?: (paths: string[]) => Promise<void>;
}): Promise<ApplyResult> {
  const revalidate = opts.revalidate ?? revalidatePaths;
  const files = readdirSync(opts.dir).filter((f) => f.endsWith('.md')).sort();
  const result: ApplyResult = { wouldUpdate: [], updated: [], skipped: [] };
  const targets: { slug: string; draft: GuideDraft }[] = [];
  const failures: string[] = [];

  for (const f of files) {
    const slug = f.slice(0, -3);
    const g = await prisma.guide.findUnique({ where: { slug }, select: { status: true, sourceName: true, sourceUrl: true } });
    if (!g) {
      result.skipped.push({ slug, reason: '해당 slug 없음' });
      continue;
    }
    if (g.status !== 'PUBLISHED') {
      result.skipped.push({ slug, reason: `게시 상태 아님(${g.status})` });
      continue;
    }
    let draft: GuideDraft;
    try {
      draft = parseGuideDraft(readFileSync(join(opts.dir, f), 'utf8'));
    } catch (err) {
      failures.push(`${slug}: ${(err as Error).message}`);
      continue;
    }
    const errors = validateGuideDraft(draft, g);
    if (errors.length) failures.push(`${slug}: ${errors.join(', ')}`);
    else targets.push({ slug, draft });
  }
  if (failures.length) throw new Error(`검증 실패 — 아무것도 쓰지 않음:\n${failures.join('\n')}`);

  result.wouldUpdate = targets.map((t) => t.slug);
  if (!opts.apply) return result;

  const reviewedAt = new Date();
  await prisma.$transaction(
    targets.map((t) =>
      prisma.guide.update({
        where: { slug: t.slug },
        data: { title: t.draft.title, summary: t.draft.summary, body: t.draft.body, reviewedAt },
      }),
    ),
  );
  result.updated = result.wouldUpdate;
  await revalidate(['/guide', ...result.updated.map((s) => `/guide/${s}`)]);
  return result;
}

if (process.argv[1]?.includes('guide/apply-rewrites')) {
  const apply = process.argv.includes('--apply');
  applyGuideRewrites({ dir: 'content/guides', apply })
    .then((r) => {
      console.log(JSON.stringify({ apply, ...r }, null, 2));
    })
    .catch((err) => {
      console.error(String(err));
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
