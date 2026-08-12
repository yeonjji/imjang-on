/**
 * 좌표가 없어 비공개할 청약 공고 id 목록을 모듈로 생성한다.
 *
 *   pnpm exec dotenv -e .env.local -- tsx scripts/subscription/generate-gone-ids.ts
 *
 * ⚠️ 지오코딩 백필(scripts/ingest/subscriptions/geocode-fill.ts --apply)을 다시 돌렸다면
 *    반드시 이 스크립트도 다시 돌려라. 좌표를 얻은 공고가 목록에 남아 있으면 멀쩡한 페이지가 410이 된다.
 */
import { writeFileSync } from 'node:fs';
import { prisma } from '@/lib/db';

const OUT = 'lib/subscription/gone-ids.ts';

async function main() {
  const rows = await prisma.$queryRaw<Array<{ id: bigint }>>`
    SELECT id FROM "SubscriptionNotice" WHERE location IS NULL ORDER BY id
  `;
  const ids = rows.map((r) => String(r.id));
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
