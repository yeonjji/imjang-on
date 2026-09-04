/**
 * 게시된 board 글의 링크·합계·출처 표기를 검사한다. 읽기 전용 — 아무것도 쓰지 않는다.
 *
 * 실행:
 *   pnpm exec dotenv -e .env.local -- tsx scripts/board/audit-content.ts
 *   pnpm exec dotenv -e .env.qa.local -- tsx scripts/board/audit-content.ts --all   # DRAFT까지
 *
 * 종료 코드: 지적 사항이 하나라도 있으면 1.
 */
import { prisma } from '@/lib/db';
import { auditLinks, auditUnitSums, auditSourceAgency } from '@/lib/board/content-audit';

async function main() {
  const all = process.argv.includes('--all');
  const posts = await prisma.post.findMany({
    where: all ? {} : { status: 'PUBLISHED' },
    select: { id: true, title: true, body: true, summary: true, sourceName: true, sourceUrl: true },
    orderBy: { id: 'asc' },
  });

  let problems = 0;
  for (const post of posts) {
    const lines: string[] = [];

    for (const f of auditLinks(post.body)) lines.push(`  링크(${f.issue}): ${f.href}`);
    for (const f of auditUnitSums(post.body)) {
      lines.push(
        `  합계(${f.kind}): 적힌 값 ${f.stated.toLocaleString('ko-KR')} ≠ 실제 합 ${f.expected.toLocaleString('ko-KR')} — ${f.items.join('+')}\n    ${f.sentence.slice(0, 90)}`,
      );
    }
    const agency = auditSourceAgency(post);
    if (agency) {
      lines.push(
        `  출처: 표시 기관명 '${agency.agency}' ↔ 링크 도메인 ${agency.host} (기대: ${agency.expectedHosts.join(', ')})`,
      );
    }

    if (lines.length) {
      problems += lines.length;
      console.log(`\n/board/${post.id} — ${post.title}`);
      console.log(lines.join('\n'));
    }
  }

  console.log(`\n검사 ${posts.length}편 / 지적 ${problems}건`);
  if (problems) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
