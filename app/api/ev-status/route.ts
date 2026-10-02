import { fetchChargerStatus, isValidStatId } from '@/lib/urban/ev-status';

// 충전소 실시간 상태. 상세 페이지 렌더에서 부르면 크롤러 방문마다 외부 API 일일 한도를 써서
// 월간 수집이 첫 페이지부터 429로 막혔다(2026-08~10). 사용자가 버튼을 누를 때만 여기로 온다.
// /api/는 robots.txt에서 크롤 금지.
export async function GET(req: Request) {
  const statId = new URL(req.url).searchParams.get('statId');
  if (!isValidStatId(statId)) {
    return Response.json({ error: 'invalid statId' }, { status: 400 });
  }
  const statuses = await fetchChargerStatus(statId);
  return Response.json({ statuses }, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
