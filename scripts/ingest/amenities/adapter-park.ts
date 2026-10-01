import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';
import type { NormalizedPark } from './types';
import { strOrNull, parseRefDate, clip } from './parse-helpers';

const BASE_URL = 'https://api.data.go.kr/openapi/tn_pubr_public_cty_park_info_api';
const PAGE_SIZE = 1000;

/** 1900-01-01 같은 자리표시 날짜는 버린다. 1940년대 조선시가지계획 지정일은 실제 값이라 유지. */
function realDesignationDate(d: Date | null): Date | null {
  return d && d.getUTCFullYear() > 1900 ? d : null;
}

export function parseParkXml(xml: string): {
  rows: NormalizedPark[];
  totalCount: number;
} {
  const parsed = parseXml(xml);
  const items = getItems(parsed) as Record<string, unknown>[];
  const totalCount = getTotalCount(parsed);

  const rows: NormalizedPark[] = [];
  for (const item of items) {
    const sourceId = String(item.manageNo ?? '').trim();
    if (!sourceId) continue;

    const rawLat = Number(item.latitude);
    const rawLng = Number(item.longitude);
    const lat = Number.isFinite(rawLat) && rawLat !== 0 ? rawLat : null;
    const lng = Number.isFinite(rawLng) && rawLng !== 0 ? rawLng : null;

    const rawArea = item.parkAr;
    const area =
      rawArea !== undefined && rawArea !== null && rawArea !== ''
        ? Number(rawArea) || null
        : null;

    // 도로명주소(rdnmadr) 비어있으면 지번주소(lnmadr)로 fallback
    const address = String(item.rdnmadr ?? '').trim() || String(item.lnmadr ?? '').trim();

    rows.push({
      sourceId,
      name: String(item.parkNm ?? '').trim(),
      address,
      lat,
      lng,
      parkType: item.parkSe ? String(item.parkSe).trim() : null,
      area,
      referenceDate: parseRefDate(item.referenceDate),
      facilitySport: clip(strOrNull(item.mvmFclty), 300),
      facilityPlay: clip(strOrNull(item.amsmtFclty), 300),
      facilityConvenience: clip(strOrNull(item.cnvnncFclty), 300),
      facilityCulture: clip(strOrNull(item.cltrFclty), 300),
      designatedAt: realDesignationDate(parseRefDate(item.appnNtfcDate)),
      managingOrg: clip(strOrNull(item.institutionNm), 100),
      // parseTagValue가 하이픈 없는 번호를 숫자로 바꿔 앞자리 0이 사라진다 → 문자열로 온 값만 신뢰.
      tel: typeof item.phoneNumber === 'string' ? clip(strOrNull(item.phoneNumber), 30) : null,
    });
  }

  return { rows, totalCount };
}

export async function fetchAllParks(): Promise<NormalizedPark[]> {
  const { env } = await import('@/lib/env');
  const { fetchAmenityPage, fetchAllPages } = await import('./http');
  const { enrichWithGeocode } = await import('./geocode-fill');

  const serviceKey = env.PUBLIC_DATA_KEY;
  if (!serviceKey) throw new Error('PUBLIC_DATA_KEY is required');

  const all: NormalizedPark[] = [];

  await fetchAllPages(async (pageNo) => {
    const xml = await fetchAmenityPage(BASE_URL, {
      serviceKey,
      pageNo,
      numOfRows: PAGE_SIZE,
      type: 'xml',
    });
    const { rows, totalCount } = parseParkXml(xml);
    all.push(...rows);
    return { items: rows, totalCount };
  });

  return enrichWithGeocode(all);
}
