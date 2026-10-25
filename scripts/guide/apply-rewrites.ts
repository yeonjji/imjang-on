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
  /** 재검증 요청 성공 여부(실패하면 최대 하루 옛 본문이 보인다 — 수동 확인 필요) */
  revalidated: boolean;
  skipped: { slug: string; reason: string }[];
}

export async function applyGuideRewrites(opts: {
  dir: string;
  apply: boolean;
  revalidate?: (paths: string[], routes: string[]) => Promise<boolean>;
}): Promise<ApplyResult> {
  const revalidate = opts.revalidate ?? revalidatePaths;
  const files = readdirSync(opts.dir).filter((f) => f.endsWith('.md')).sort();
  const result: ApplyResult = { wouldUpdate: [], updated: [], skipped: [], revalidated: false };
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
  const counts = await prisma.$transaction(
    targets.map((t) =>
      // 검증과 쓰기 사이에 상태가 바뀌어도 게시된 글만 바꾼다.
      prisma.guide.updateMany({
        where: { slug: t.slug, status: 'PUBLISHED' },
        data: { title: t.draft.title, summary: t.draft.summary, body: t.draft.body, reviewedAt },
      }),
    ),
  );
  result.updated = targets.filter((_, i) => counts[i].count === 1).map((t) => t.slug);
  // 한글 slug 경로를 직접 넘기지 않고 동적 라우트 형태로 무효화한다(admin 게시 경로와 같은 방식).
  result.revalidated = await revalidate(['/guide'], ['/guide/[slug]']);
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
