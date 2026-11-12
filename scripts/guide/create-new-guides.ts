/**
 * content/guides/<slug>.md 중 아직 DB에 없는 새 가이드를 DRAFT로 넣는다(2026-11, 가이드 보강).
 * 새 글은 앞머리에 category·sourceName·sourceUrl·sourceExcerpt·sourceDate·dedupeKey를 함께 적는다
 * (기존 28편은 이 필드가 없어 대상이 아니다). 게시는 /admin/guides 검수 흐름에서 한다.
 * 초안 하나라도 검증에 실패하면 아무것도 쓰지 않는다.
 *
 *   docker compose ... run --rm etl pnpm tsx scripts/guide/create-new-guides.ts            # dry-run
 *   docker compose ... run --rm etl pnpm tsx scripts/guide/create-new-guides.ts --apply
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GuideCategory, PostStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { parseGuideDraft, validateGuideDraft } from '@/lib/guide/rewrite';

export interface CreateResult {
  wouldCreate: string[];
  created: string[];
  skipped: { slug: string; reason: string }[];
}

const META_KEYS = ['category', 'sourceName', 'sourceUrl', 'sourceExcerpt', 'sourceDate', 'dedupeKey'] as const;

function readMeta(text: string): Partial<Record<(typeof META_KEYS)[number], string>> {
  const head = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
  const meta: Partial<Record<(typeof META_KEYS)[number], string>> = {};
  for (const k of META_KEYS) {
    const v = new RegExp(`^${k}:[ \\t]*(.*)$`, 'm').exec(head)?.[1]?.trim();
    if (v) meta[k] = v;
  }
  return meta;
}

export async function createNewGuides(opts: { dir: string; apply: boolean }): Promise<CreateResult> {
  const result: CreateResult = { wouldCreate: [], created: [], skipped: [] };
  const failures: string[] = [];
  const rows: Parameters<typeof prisma.guide.create>[0]['data'][] = [];

  for (const f of readdirSync(opts.dir).filter((n) => n.endsWith('.md')).sort()) {
    const slug = f.slice(0, -3);
    const text = readFileSync(join(opts.dir, f), 'utf8');
    const meta = readMeta(text);
    if (!meta.category) continue; // 기존 재작성본(메타 없음)은 대상 아님

    const missing = META_KEYS.filter((k) => !meta[k]);
    if (missing.length) {
      failures.push(`${slug}: 앞머리 누락 ${missing.join(', ')}`);
      continue;
    }
    if (!(meta.category! in GuideCategory)) {
      failures.push(`${slug}: 알 수 없는 category ${meta.category}`);
      continue;
    }
    const sourceDate = new Date(meta.sourceDate!);
    if (Number.isNaN(sourceDate.getTime())) {
      failures.push(`${slug}: sourceDate 형식 오류`);
      continue;
    }

    const exists = await prisma.guide.findFirst({
      where: { OR: [{ slug }, { dedupeKey: meta.dedupeKey! }] },
      select: { slug: true },
    });
    if (exists) {
      result.skipped.push({ slug, reason: `이미 있음(${exists.slug})` });
      continue;
    }

    let draft;
    try {
      draft = parseGuideDraft(text);
    } catch (err) {
      failures.push(`${slug}: ${(err as Error).message}`);
      continue;
    }
    const source = { sourceName: meta.sourceName!, sourceUrl: meta.sourceUrl! };
    const errors = validateGuideDraft(draft, source);
    if (errors.length) {
      failures.push(`${slug}: ${errors.join(', ')}`);
      continue;
    }
    rows.push({
      slug,
      title: draft.title,
      summary: draft.summary,
      body: draft.body,
      category: meta.category as GuideCategory,
      status: PostStatus.DRAFT,
      ...source,
      sourceDate,
      sourceExcerpt: meta.sourceExcerpt!,
      dedupeKey: meta.dedupeKey!,
    });
  }
  if (failures.length) throw new Error(`검증 실패 — 아무것도 쓰지 않음:\n${failures.join('\n')}`);

  result.wouldCreate = rows.map((r) => r.slug);
  if (!opts.apply) return result;

  await prisma.$transaction(rows.map((data) => prisma.guide.create({ data })));
  result.created = result.wouldCreate;
  return result;
}

if (process.argv[1]?.includes('guide/create-new-guides')) {
  const apply = process.argv.includes('--apply');
  createNewGuides({ dir: 'content/guides', apply })
    .then((r) => console.log(JSON.stringify({ apply, ...r }, null, 2)))
    .catch((err) => {
      console.error(String(err));
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
