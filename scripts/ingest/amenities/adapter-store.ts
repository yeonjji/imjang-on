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
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!lat || !lng) continue;

    const sourceId = String(item.bizesId ?? '').trim();
    if (!sourceId) continue;

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

  return all;
}
