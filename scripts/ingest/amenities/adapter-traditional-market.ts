import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';
import type { NormalizedTraditionalMarket } from './types';
import { createHash } from 'node:crypto';

// 전국전통시장표준데이터 (행정안전부 표준데이터). 고유 ID 필드가 없어 name+address 해시로 sourceId 생성.
const BASE_URL = 'https://api.data.go.kr/openapi/tn_pubr_public_trdit_mrkt_api';
const PAGE_SIZE = 1000;

function marketSourceId(name: string, address: string): string {
  return createHash('sha256').update(`${name}|${address}`).digest('hex').slice(0, 32);
}

export function parseTraditionalMarketXml(xml: string): {
  rows: NormalizedTraditionalMarket[];
  totalCount: number;
} {
  const parsed = parseXml(xml);
  const items = getItems(parsed) as Record<string, unknown>[];
  const totalCount = getTotalCount(parsed);

  const rows: NormalizedTraditionalMarket[] = [];
  for (const item of items) {
    const name = String(item.mrktNm ?? '').trim();
    if (!name) continue;

    const address =
      String(item.rdnmadr ?? '').trim() || String(item.lnmadr ?? '').trim();

    const rawLat = Number(item.latitude);
    const rawLng = Number(item.longitude);
    const lat = Number.isFinite(rawLat) && rawLat !== 0 ? rawLat : null;
    const lng = Number.isFinite(rawLng) && rawLng !== 0 ? rawLng : null;

    rows.push({
      sourceId: marketSourceId(name, address),
      name,
      address,
      lat,
      lng,
      marketType: item.mrktType ? String(item.mrktType).trim() : null,
    });
  }

  return { rows, totalCount };
}

export async function fetchAllTraditionalMarkets(): Promise<NormalizedTraditionalMarket[]> {
  const { env } = await import('@/lib/env');
  const { fetchAmenityPage, fetchAllPages } = await import('./http');
  const { enrichWithGeocode } = await import('./geocode-fill');

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

  return enrichWithGeocode(all);
}
