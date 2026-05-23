import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';
import type { NormalizedPark } from './types';

const BASE_URL = 'https://apis.data.go.kr/1613000/NatUrPkInfoService/getNatUrPkInfo';
const PAGE_SIZE = 1000;

export function parseParkXml(xml: string): {
  rows: NormalizedPark[];
  totalCount: number;
} {
  const parsed = parseXml(xml);
  const items = getItems(parsed) as Record<string, unknown>[];
  const totalCount = getTotalCount(parsed);

  const rows: NormalizedPark[] = [];
  for (const item of items) {
    const lat = Number(item.latitude);
    const lng = Number(item.longitude);
    if (!lat || !lng) continue;

    const sourceId = String(item.parkId ?? '').trim();
    if (!sourceId) continue;

    const rawArea = item.parkAr;
    const area =
      rawArea !== undefined && rawArea !== null && rawArea !== ''
        ? Number(rawArea) || null
        : null;

    rows.push({
      sourceId,
      name: String(item.parkNm ?? '').trim(),
      address: String(item.rdnmadr ?? '').trim(),
      lat,
      lng,
      parkType: item.parkSe ? String(item.parkSe).trim() : null,
      area,
    });
  }

  return { rows, totalCount };
}

export async function fetchAllParks(): Promise<NormalizedPark[]> {
  const { env } = await import('@/lib/env');
  const { fetchAmenityPage, fetchAllPages } = await import('./http');

  const serviceKey = env.PUBLIC_DATA_KEY;
  if (!serviceKey) throw new Error('PUBLIC_DATA_KEY is required');

  const all: NormalizedPark[] = [];

  await fetchAllPages(async (pageNo) => {
    const xml = await fetchAmenityPage(BASE_URL, {
      serviceKey,
      pageNo,
      numOfRows: PAGE_SIZE,
    });
    const { rows, totalCount } = parseParkXml(xml);
    all.push(...rows);
    return { items: rows, totalCount };
  });

  return all;
}
