/**
 * 좌표가 없어 비공개할 청약 공고 id 목록을 모듈로 생성한다.
 *
 *   pnpm exec dotenv -e .env.qa.local -- tsx scripts/subscription/generate-gone-ids.ts
 *
 * ⚠️ .env.local이 아니다. 이 프로젝트의 .env.local·.env.test는 둘 다 빈 로컬 docker DB를
 *    가리킨다(2026-07-31 실측) — 헤더를 안 보고 .env.local로 돌리면 결과가 0건이라 목록을
 *    조용히 비운다. 운영 DB 읽기전용 SSH 터널 절차는 프로젝트 메모리 feedback_readonly_tunnel_qa 참고.
 *
 * ⚠️ 지오코딩 백필을 다시 돌렸을 때만이 아니라, **매일 도는 적재(scripts/ingest/subscriptions/runner.ts)도
 *    지오코딩을 한다** — 청약홈이 주소를 정정해 좌표를 새로 얻으면 목록에 남은 공고가 계속 410이 된다.
 *    좌표를 얻은 공고가 목록에 남아 있으면 멀쩡한 페이지가 410이 되므로, 백필이든 일간 적재든
 *    location이 바뀔 때마다 이 스크립트를 다시 돌려라.
 */
import { writeFileSync } from 'node:fs';
import { prisma } from '@/lib/db';

const OUT = 'lib/subscription/gone-ids.ts';

async function main() {
  const rows = await prisma.$queryRaw<Array<{ id: bigint }>>`
    SELECT id FROM "SubscriptionNotice" WHERE location IS NULL ORDER BY id
  `;
  const ids = rows.map((r) => String(r.id));

  // 쿼리 결과가 0건이면 십중팔구 DATABASE_URL이 운영이 아니라 빈 로컬 docker DB를 가리킨다 —
  // 그대로 쓰면 410 게이트가 통째로 죽은 채 CI가 통과한다(생성물이 빈 Set이어도 테스트가
  // 비어 있는 걸 검증하지 않으면 그린이 뜬다). 의도적으로 빈 목록을 쓰려는 경우에만 우회한다.
  if (ids.length === 0 && !process.argv.includes('--allow-empty')) {
    console.error(
      '쿼리 결과 0건 — DATABASE_URL이 운영 DB가 아니라 빈 로컬 docker DB를 가리키고 있을 가능성이 높다.\n' +
        '헤더의 .env.qa.local(운영 읽기전용 터널)로 다시 실행하거나, 정말 빈 목록을 쓰려면 --allow-empty를 붙여라.',
    );
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);

  const body = `/**
 * 생성된 파일 — scripts/subscription/generate-gone-ids.ts가 덮어쓴다. 손으로 고치지 마라.
 *
 * 좌표가 없는 청약 공고. 지도·주변 실거래·인프라가 통째로 빠져 공급표와 공용 블록만 남는
 * near-duplicate라 비공개한다. noindex가 아니라 410인 이유: 애드센스 심사는 자체 크롤러라
 * noindex가 보이지 않는다.
 */
export const GONE_IDS_GENERATED_AT = '${today}';

export const GONE_SUBSCRIPTION_IDS: ReadonlySet<string> = new Set([
${ids.map((id) => `  '${id}',`).join('\n')}
]);
`;
  writeFileSync(OUT, body);
  console.log(`${OUT}: ${ids.length}건 (${today})`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => { void prisma.$disconnect(); });
