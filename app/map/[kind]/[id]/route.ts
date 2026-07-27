// 좌표를 URL로 받던 /api/staticmap을 대체한다. 좌표는 서버가 DB에서 조회하므로
// 외부에서 임의 좌표로 NCP 호출을 유발할 수 없고, 캐시 키가 엔티티 수로 묶인다.
// 크기·배율 파라미터를 받지 않는 것도 같은 이유다.
import { isMapEntityKind, parseMapEntityId, getMapEntityLatLng } from '@/lib/seo/map-entity';
import { fetchStaticMapPng, StaticMapUnavailableError } from '@/lib/seo/static-map-fetch';

const CARD = { w: 600, h: 400, level: 16 } as const;

function notFound() {
  return new Response('not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  if (!isMapEntityKind(kind)) return notFound();

  const entityId = parseMapEntityId(id);
  if (entityId === null) return notFound();

  const coord = await getMapEntityLatLng(kind, entityId).catch(() => null);
  if (!coord) return notFound();

  try {
    const png = await fetchStaticMapPng({ ...coord, ...CARD, marker: true });
    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control':
          'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400',
      },
    });
  } catch (e) {
    const status = e instanceof StaticMapUnavailableError ? 503 : 502;
    return new Response('map unavailable', { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
