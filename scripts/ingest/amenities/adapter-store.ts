import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';
import type { NormalizedStore } from './types';

const BASE_URL = 'https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInUpjong';
const PAGE_SIZE = 1000;

export function parseStoreXml(
  xml: string,
  sigunguCode: string,
): {
  rows: NormalizedStore[];
  totalCount: number;
} {
  const parsed = parseXml(xml);
  const items = getItems(parsed) as Record<string, unknown>[];
  const totalCount = getTotalCount(parsed);

  const rows: NormalizedStore[] = [];
  for (const item of items) {
    const sourceId = String(item.bizesId ?? '').trim();
    if (!sourceId) continue;

    const rawLat = Number(item.lat);
    const rawLng = Number(item.lon);
    const lat = Number.isFinite(rawLat) && rawLat !== 0 ? rawLat : null;
    const lng = Number.isFinite(rawLng) && rawLng !== 0 ? rawLng : null;

    rows.push({
      sourceId,
      name: String(item.bizesNm ?? '').trim(),
      address: String(item.rdnmAdr ?? '').trim(),
      lat,
      lng,
      industryCode: item.indsLclsCd ? String(item.indsLclsCd).trim() : null,
      industryName: item.indsLclsNm ? String(item.indsLclsNm).trim() : null,
      sigunguCode: item.signguCd ? String(item.signguCd).trim() : sigunguCode,
    });
  }

  return { rows, totalCount };
}

export async function fetchStoresBySigungu(
  sigunguCode: string,
): Promise<NormalizedStore[]> {
  const { env } = await import('@/lib/env');
  const { fetchAmenityPage, fetchAllPages } = await import('./http');
  const { enrichWithGeocode } = await import('./geocode-fill');

  const serviceKey = env.PUBLIC_DATA_KEY;
  if (!serviceKey) throw new Error('PUBLIC_DATA_KEY is required');

  const all: NormalizedStore[] = [];

  await fetchAllPages(async (pageNo) => {
    const xml = await fetchAmenityPage(BASE_URL, {
      serviceKey,
      pageIndex: pageNo,
      pageSize: PAGE_SIZE,
      divId: 'signguCd',
      key: sigunguCode,
    });
    const { rows, totalCount } = parseStoreXml(xml, sigunguCode);
    all.push(...rows);
    return { items: rows, totalCount };
  });

  return enrichWithGeocode(all);
}
