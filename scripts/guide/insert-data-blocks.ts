/**
 * 1회성: 대상 가이드 본문에 `[[data:<키>]]` 표식을 넣고 `## 자주 묻는 질문` 섹션을 지운다.
 * 어느 편의 어느 소제목에 넣을지는 lib/guide/insert-blocks.ts의 GUIDE_BLOCK_PLACEMENTS가 정한다.
 *
 * 실행:
 *   pnpm dlx dotenv -e .env.prod.local -- tsx scripts/guide/insert-data-blocks.ts            # dry-run(기본)
 *   pnpm dlx dotenv -e .env.prod.local -- tsx scripts/guide/insert-data-blocks.ts --apply
 *
 * 게시 상태·게시일은 건드리지 않는다(재게시 날짜 리셋 방지). 되돌리기는 어드민 편집기로 가능하다.
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { GUIDE_BLOCK_PLACEMENTS, applyGuideBodyEdit } from '@/lib/guide/insert-blocks';
import { runGuideGuardrails } from '@/lib/guide/guardrails';

/** 바뀐 줄 주변만 보여준다 — 본문 전체를 찍으면 검토가 안 된다. */
function printContext(before: string, after: string) {
  const b = before.split('\n');
  const a = after.split('\n');
  let head = 0;
  while (head < b.length && head < a.length && b[head] === a[head]) head++;
  let tail = 0;
  while (tail < b.length - head && tail < a.length - head && b[b.length - 1 - tail] === a[a.length - 1 - tail]) tail++;

  const show = (lines: string[], sign: string) => {
    const seg = lines.slice(Math.max(0, head - 2), lines.length - tail + 2);
    for (const l of seg) console.log(`${sign} ${l}`);
  };
  console.log('  --- 이전 ---');
  show(b, '-');
  console.log('  --- 이후 ---');
  show(a, '+');
}

async function main() {
  const apply = process.argv.includes('--apply');
  logger.info({ apply, targets: GUIDE_BLOCK_PLACEMENTS.length }, 'guide 데이터 블록 표식 삽입');

  let changed = 0;
  for (const placement of GUIDE_BLOCK_PLACEMENTS) {
    const guide = await prisma.guide.findFirst({ where: { dedupeKey: placement.dedupeKey } });
    if (!guide) {
      logger.warn({ dedupeKey: placement.dedupeKey }, '가이드 없음 — 건너뜀');
      continue;
    }

    const result = applyGuideBodyEdit(guide.body, placement);
    if (result.skipReason === 'anchor-not-found') {
      logger.warn(
        { dedupeKey: placement.dedupeKey, anchor: placement.anchorHeading },
        '앵커 소제목 없음 — 본문 건드리지 않고 건너뜀',
      );
      continue;
    }
    if (!result.blockInserted && !result.faqRemoved) {
      logger.info({ dedupeKey: placement.dedupeKey }, '이미 반영됨 — 건너뜀');
      continue;
    }

    const guard = runGuideGuardrails({
      body: result.body,
      sourceName: guide.sourceName,
      sourceUrl: guide.sourceUrl,
    });
    const charCount = result.body.replace(/\s/g, '').length;

    console.log(`\n[${placement.dedupeKey}] ${guide.title}`);
    console.log(
      `  블록=${placement.blockKey} 삽입=${result.blockInserted} FAQ제거=${result.faqRemoved} ` +
        `공백제외 ${guide.body.replace(/\s/g, '').length}자 → ${charCount}자 ` +
        `가드레일=${guard.ok ? 'PASS' : 'FAIL: ' + guard.violations.join(', ')}`,
    );
    printContext(guide.body, result.body);

    if (!guard.ok) {
      logger.warn({ dedupeKey: placement.dedupeKey, violations: guard.violations }, '가드레일 실패 — 건너뜀');
      continue;
    }
    changed++;
    if (!apply) continue;

    await prisma.guide.update({ where: { id: guide.id }, data: { body: result.body } });
    logger.info({ dedupeKey: placement.dedupeKey, slug: guide.slug }, '반영 완료');
  }

  console.log(`\n${apply ? '반영' : 'dry-run'}: ${changed}편`);
  if (!apply && changed) console.log('실제 반영하려면 --apply 를 붙여 다시 실행하세요.');
}

main()
  .catch((err) => {
    logger.error({ err }, 'guide insert-data-blocks fatal');
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
