import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';
import type { NormalizedEvCharger } from './types';

const FAST_TYPES = new Set(['01', '03', '04', '05', '06', '07']);
const BASE_URL = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo';
const PAGE_SIZE = 9999;

function groupChargerItems(items: Record<string, unknown>[]): NormalizedEvCharger[] {
  const stationMap = new Map<string, NormalizedEvCharger>();

  for (const item of items) {
    const statId = String(item.statId ?? '').trim();
    if (!statId) continue;

    const chgerType = String(item.chgerType ?? '').trim().padStart(2, '0');
    const isFast = FAST_TYPES.has(chgerType);

    if (stationMap.has(statId)) {
      const existing = stationMap.get(statId)!;
      existing.chargerCount += 1;
      if (isFast) existing.chargeSpeed = '급속';
    } else {
      const lat = Number(item.lat);
      const lng = Number(item.lng);
      if (!lat || !lng) continue;

      stationMap.set(statId, {
        sourceId: statId,
        name: String(item.statNm ?? '').trim(),
        address: String(item.addr ?? '').trim(),
        lat,
        lng,
        chargeSpeed: isFast ? '급속' : '완속',
        chargerCount: 1,
        operatorName: item.busiNm ? String(item.busiNm).trim() : null,
      });
    }
  }

  return Array.from(stationMap.values());
}

export function parseEvChargerXml(xml: string): {
  rows: NormalizedEvCharger[];
  totalCount: number;
} {
  const parsed = parseXml(xml);
  const items = getItems(parsed) as Record<string, unknown>[];
  const totalCount = getTotalCount(parsed);
  return { rows: groupChargerItems(items), totalCount };
}

export async function fetchAllEvChargers(): Promise<NormalizedEvCharger[]> {
  const { env } = await import('@/lib/env');
  const { fetchAmenityPage, fetchAllPages } = await import('./http');

  const serviceKey = env.PUBLIC_DATA_KEY;
  if (!serviceKey) throw new Error('PUBLIC_DATA_KEY is required');

  const allItems: Record<string, unknown>[] = [];

  await fetchAllPages(async (pageNo) => {
    const xml = await fetchAmenityPage(BASE_URL, { serviceKey, pageNo, numOfRows: PAGE_SIZE });
    const parsed = parseXml(xml);
    const items = getItems(parsed) as Record<string, unknown>[];
    const totalCount = getTotalCount(parsed);
    allItems.push(...items);
    return { items, totalCount };
  });

  return groupChargerItems(allItems);
}
