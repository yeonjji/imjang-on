import { getPropertyList, serializeProperty } from '@/lib/property';
import { parseListParams } from '@/lib/list-params';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams) as Record<string, string>;
  const p = parseListParams(sp);

  const { rows, total, totalCapped, page, perPage, totalPages } = await getPropertyList({
    types: p.types,
    deal: p.deal,
    priceMin: p.priceMin,
    priceMax: p.priceMax,
    areaRange: p.areaRange,
    sort: p.sort,
    sigunguCode: p.sigunguCode,
    sido: p.sido,
    q: p.q,
    page: p.page,
    perPage: 30,
    stationId: p.stationId,
  });

  return Response.json(
    { items: rows.map(serializeProperty), total, totalCapped, page, perPage, totalPages },
    { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300' } },
  );
}
