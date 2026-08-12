/**
 * 청약 공고 좌표 보강 — 적재 시(runner.ts)와 1회성 백필(geocode-fill.ts)이 공유한다.
 *
 * 원문 주소를 그대로 지오코딩하면 카카오가 못 찾는다(운영 40건 표본 0/40) — 청약 주소가
 * `… 김포신곡6지구 도시개발사업구역 A3BL`처럼 사업지구 서술형이기 때문이다. 좁은 후보부터
 * 순서대로 시도하고, 후보가 좌표를 줘도 지역이 어긋나면 버리고 다음 후보를 마저 시도한다 —
 * 첫 후보에서 바로 멈추면, 뒤 후보라면 맞았을 좌표까지 놓친다. 이 검증 로직으로 운영 전량
 * dry-run에서 96.7%(2,285/2,364) 성공을 실측했다. 두 소비자가 각자 이 루프를 베끼면
 * 한쪽만 고치고 다른 쪽을 잊는 사고가 나므로 여기 한 곳에만 둔다.
 */
import { geocode, geocodeKeyword, type Coord } from '@/scripts/ingest/geocoder';
import { logger } from '@/lib/logger';
import { parseAddressRegion, regionMatches, geocodeCandidates } from '@/lib/subscription/geo-validate';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface GeocodeResolution {
  coord: Coord | null;
  /** 지역이 어긋나 버려진 후보가 하나라도 있었는지 — "결과없음"과 "지역불일치"를 구분하는 데 쓴다. */
  sawInvalidCoord: boolean;
}

/**
 * 주소 하나를 후보 목록(좁은 것부터)으로 지오코딩해, 지역이 검증된 첫 좌표를 반환한다.
 * 주소검색이 비면 키워드검색으로 폴백한다. `logContext`는 실패 로그에 곁들일 식별자(예: 공고 id)다.
 */
export async function resolveGeocode(
  address: string,
  logContext: Record<string, unknown> = {},
): Promise<GeocodeResolution> {
  const addr = parseAddressRegion(address);
  let sawInvalidCoord = false;

  for (const q of geocodeCandidates(address)) {
    let coord = await geocode(q);
    if (!coord) {
      await sleep(100); // 카카오 로컬 API 호출 간격 — 주소검색과 키워드검색 사이에도 간격을 둔다
      coord = await geocodeKeyword(q);
    }
    await sleep(100); // 카카오 로컬 API 호출 간격

    if (!coord) continue;
    if (regionMatches(addr, coord)) return { coord, sawInvalidCoord };
    sawInvalidCoord = true;
    logger.warn(
      { ...logContext, addr, got: { region1: coord.region1, region2: coord.region2 } },
      '지역 불일치 — 다음 후보 시도',
    );
  }

  return { coord: null, sawInvalidCoord };
}

interface Coordable {
  address: string | null;
  lat: number | null;
  lng: number | null;
}

/**
 * upsert 직전에 좌표 없는 공고들을 배열째로 채운다(제자리 수정). 이미 좌표가 있거나 주소가
 * 없는 행은 API를 부르지 않고 건너뛴다. 지역이 어긋나면 채우지 않는다 —
 * 틀린 좌표는 빈 값보다 나쁘다.
 */
export async function enrichNoticesWithGeocode<T extends Coordable>(rows: T[]): Promise<void> {
  let filled = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.lat != null && row.lng != null) continue;
    if (!row.address) {
      skipped++;
      continue;
    }
    const { coord } = await resolveGeocode(row.address);
    if (!coord) {
      skipped++;
      continue;
    }
    row.lat = coord.lat;
    row.lng = coord.lng;
    filled++;
  }

  if (filled || skipped) {
    logger.info({ filled, skipped, total: rows.length }, 'subscription geocode enrichment');
  }
}
