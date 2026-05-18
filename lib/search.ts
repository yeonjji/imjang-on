import { prisma } from '@/lib/db';
import { normalizeName } from '@/lib/slug';

export interface AutocompleteResult {
  properties: Array<{ id: string; name: string; address: string; region: string; type: string }>;
  regions: Array<{ code: string; fullName: string }>;
}

export async function autocomplete(q: string): Promise<AutocompleteResult> {
  if (!q || q.trim().length < 2) return { properties: [], regions: [] };
  const norm = normalizeName(q);
  const prefix = `${norm}%`;

  const props = await prisma.$queryRaw<Array<{ id: bigint; name: string; address: string; full_name: string; type: string }>>`
    SELECT p.id, p.name, p.address, r."fullName" AS full_name, p."propertyType"::text AS type
    FROM "Property" p
    JOIN "Region" r ON r.code = p."regionCode"
    WHERE p."nameNorm" % ${norm} OR p."nameNorm" ILIKE ${prefix}
    ORDER BY
      (p."nameNorm" ILIKE ${prefix})::int DESC,
      similarity(p."nameNorm", ${norm}) DESC,
      p."txCount12m" DESC
    LIMIT 10
  `;

  const regions = await prisma.$queryRaw<Array<{ code: string; full_name: string }>>`
    SELECT code, "fullName" AS full_name
    FROM "Region"
    WHERE level >= 2 AND "isAbolished" = false
      AND ("fullName" ILIKE ${'%' + q + '%'} OR "fullName" % ${q})
    ORDER BY level, "fullName"
    LIMIT 10
  `;

  return {
    properties: props.map((p) => ({
      id: String(p.id),
      name: p.name,
      address: p.address,
      region: p.full_name,
      type: p.type,
    })),
    regions: regions.map((r) => ({ code: r.code, fullName: r.full_name })),
  };
}
