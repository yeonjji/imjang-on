import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';
import type { NormalizedPark } from './types';

const BASE_URL = 'https://api.data.go.kr/openapi/tn_pubr_public_cty_park_info_api';
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
    const lat = Number(item.LATITUDE);
    const lng = Number(item.LONGITUDE);
    if (!lat || !lng) continue;

    const sourceId = String(item.MANAGE_NO ?? '').trim();
    if (!sourceId) continue;

    const rawArea = item.PARK_AR;
    const area =
      rawArea !== undefined && rawArea !== null && rawArea !== ''
        ? Number(rawArea) || null
        : null;

    rows.push({
      sourceId,
      name: String(item.PARK_NM ?? '').trim(),
      address: String(item.RDNMADR ?? '').trim(),
      lat,
      lng,
      parkType: item.PARK_SE ? String(item.PARK_SE).trim() : null,
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
      type: 'xml',
    });
    const { rows, totalCount } = parseParkXml(xml);
    all.push(...rows);
    return { items: rows, totalCount };
  });

  return all;
}
