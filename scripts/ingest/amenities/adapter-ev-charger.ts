import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';
import type { NormalizedEvCharger, NormalizedEvChargerUnit } from './types';

const FAST_TYPES = new Set(['01', '03', '04', '05', '06', '07']);
const BASE_URL = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo';
const PAGE_SIZE = 9999;

export interface EvChargerParseResult {
  stations: NormalizedEvCharger[];
  units: NormalizedEvChargerUnit[];
}

function buildEvChargerData(items: Record<string, unknown>[]): EvChargerParseResult {
  const stationMap = new Map<string, NormalizedEvCharger>();
  const units: NormalizedEvChargerUnit[] = [];
  const seenUnitKeys = new Set<string>();

  for (const item of items) {
    const statId = String(item.statId ?? '').trim();
    // fast-xml-parser가 '01' → 1로 변환할 수 있어 zero-padding으로 정규화
    const chgerId = String(item.chgerId ?? '').trim().padStart(2, '0');
    if (!statId || !chgerId || chgerId === '00') continue;

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

    const unitKey = `${statId}-${chgerId}`;
    if (seenUnitKeys.has(unitKey)) continue;
    seenUnitKeys.add(unitKey);
    units.push({
      sourceId: unitKey,
      stationSourceId: statId,
      chgerId,
      chgerType,
      isFast,
    });
  }

  // 충전소 미생성된 unit 제외 (lat/lng 누락 등)
  const validStationIds = new Set(stationMap.keys());
  return {
    stations: Array.from(stationMap.values()),
    units: units.filter((u) => validStationIds.has(u.stationSourceId)),
  };
}

export function parseEvChargerXml(xml: string): EvChargerParseResult & { totalCount: number } {
  const parsed = parseXml(xml);
  const items = getItems(parsed) as Record<string, unknown>[];
  const totalCount = getTotalCount(parsed);
  return { ...buildEvChargerData(items), totalCount };
}

export async function fetchAllEvChargers(): Promise<EvChargerParseResult> {
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

  return buildEvChargerData(allItems);
}
