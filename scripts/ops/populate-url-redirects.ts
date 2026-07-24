// 방식 B1: 구 orphan 삭제 전에 구→신 URL 매핑을 UrlRedirect에 스냅샷한다(멱등).
//   pnpm tsx scripts/ops/populate-url-redirects.ts
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { pickRedirectTarget, type Candidate } from './property-redirect-match';

function propertyPath(propertyType: string, id: bigint): string {
  const prefix =
    propertyType === 'APARTMENT' ? '/apt' : propertyType === 'OFFICETEL' ? '/officetel' : '/villa';
  return `${prefix}/${id}`;
}

interface PropRow {
  id: bigint;
  propertyType: string;
  redirectToId: bigint;
}
interface SchoolRow {
  id: bigint;
  name: string;
  schoolKind: string | null;
  sigunguCode: string | null;
  lat: number | null;
  lng: number | null;
}

async function upsertRedirects(kind: 'property' | 'school', rows: Array<{ from: bigint; to: string }>) {
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map((r) =>
        prisma.urlRedirect.upsert({
          where: { kind_fromId: { kind, fromId: r.from } },
          create: { kind, fromId: r.from, toPath: r.to },
          update: { toPath: r.to },
        }),
      ),
    );
  }
}

async function snapshotProperty(): Promise<number> {
  const rows = await prisma.$queryRaw<PropRow[]>`
    SELECT id, "propertyType"::text AS "propertyType", "redirectToId"
    FROM "Property" WHERE "redirectToId" IS NOT NULL`;
  await upsertRedirects(
    'property',
    rows.map((r) => ({ from: r.id, to: propertyPath(r.propertyType, r.redirectToId) })),
  );
  return rows.length;
}

async function snapshotSchool(): Promise<{ matched: number; unmatched: number }> {
  const load = (clause: string) =>
    prisma.$queryRawUnsafe<SchoolRow[]>(
      `SELECT id, name, "schoolKind", "sigunguCode",
              ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
       FROM "School" WHERE ${clause}`,
    );
  const olds = await load(`"sigunguCode" LIKE '29%' OR "sigunguCode" LIKE '46%'`);
  const news = await load(`"sigunguCode" LIKE '12%'`);

  type NewCand = Candidate & { sigunguCode: string | null };
  const idx = new Map<string, NewCand[]>();
  for (const n of news) {
    const key = `${n.schoolKind ?? ''}::${n.name}`;
    let arr = idx.get(key);
    if (!arr) {
      arr = [];
      idx.set(key, arr);
    }
    arr.push({ id: n.id, lat: n.lat, lng: n.lng, sigunguCode: n.sigunguCode });
  }

  let matched = 0;
  let unmatched = 0;
  const ups: Array<{ from: bigint; to: string }> = [];
  for (const o of olds) {
    const cands = idx.get(`${o.schoolKind ?? ''}::${o.name}`) ?? [];
    const toId = pickRedirectTarget({ lat: o.lat, lng: o.lng }, cands);
    const target = toId ? cands.find((c) => c.id === toId) : undefined;
    if (target) {
      ups.push({ from: o.id, to: `/school/${target.sigunguCode}/${target.id}` });
      matched++;
    } else {
      unmatched++;
    }
  }
  await upsertRedirects('school', ups);
  return { matched, unmatched };
}

async function main() {
  const property = await snapshotProperty();
  logger.info({ property }, 'url-redirect snapshot: property');
  const school = await snapshotSchool();
  logger.info({ school }, 'url-redirect snapshot: school');
  const total = await prisma.urlRedirect.count();
  logger.info({ total }, 'url-redirect snapshot done');
  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'url-redirect snapshot fatal');
  process.exit(1);
});
