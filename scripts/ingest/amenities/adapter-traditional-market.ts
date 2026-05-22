import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';
import type { NormalizedTraditionalMarket } from './types';

const BASE_URL = 'https://apis.data.go.kr/1192000/ldMrktInfo/getLdMrktInfo';
const PAGE_SIZE = 1000;

export function parseTraditionalMarketXml(xml: string): {
  rows: NormalizedTraditionalMarket[];
  totalCount: number;
} {
  const parsed = parseXml(xml);
  const items = getItems(parsed) as Record<string, unknown>[];
  const totalCount = getTotalCount(parsed);

  const rows: NormalizedTraditionalMarket[] = [];
  for (const item of items) {
    const lat = Number(item.la);
    const lng = Number(item.lo);
    if (!lat || !lng) continue;

    const sourceId = String(item.mrktId ?? '').trim();
    if (!sourceId) continue;

    rows.push({
      sourceId,
      name: String(item.mrktNm ?? '').trim(),
      address: String(item.rdnmAdr ?? '').trim(),
      lat,
      lng,
      marketType: item.mrktTypNm ? String(item.mrktTypNm).trim() : null,
    });
  }

  return { rows, totalCount };
}

export async function fetchAllTraditionalMarkets(): Promise<NormalizedTraditionalMarket[]> {
  const { env } = await import('@/lib/env');
  const { fetchAmenityPage, fetchAllPages } = await import('./http');

  const serviceKey = env.PUBLIC_DATA_KEY;
  if (!serviceKey) throw new Error('PUBLIC_DATA_KEY is required');

  const all: NormalizedTraditionalMarket[] = [];

  await fetchAllPages(async (pageNo) => {
    const xml = await fetchAmenityPage(BASE_URL, {
      serviceKey,
      pageNo,
      numOfRows: PAGE_SIZE,
    });
    const { rows, totalCount } = parseTraditionalMarketXml(xml);
    all.push(...rows);
    return { items: rows, totalCount };
  });

  return all;
}
