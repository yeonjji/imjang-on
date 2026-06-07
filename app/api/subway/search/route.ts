import { prisma } from '@/lib/db';
import { normalizeName } from '@/lib/slug';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 1) return Response.json({ stations: [] });
  const norm = normalizeName(q);
  const prefix = `${norm}%`;
  const rows = await prisma.$queryRaw<Array<{ id: bigint; name: string; lines: string[] }>>`
    SELECT id, name, lines FROM "SubwayStation"
    WHERE "nameNorm" % ${norm} OR "nameNorm" ILIKE ${prefix}
    ORDER BY ("nameNorm" ILIKE ${prefix})::int DESC, similarity("nameNorm", ${norm}) DESC
    LIMIT 8
  `;
  return Response.json(
    { stations: rows.map((r) => ({ id: String(r.id), name: r.name, lines: r.lines })) },
    { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } },
  );
}
