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

    const rawLat = Number(item.lat);
    const rawLng = Number(item.lng);
    const lat = Number.isFinite(rawLat) && rawLat !== 0 ? rawLat : null;
    const lng = Number.isFinite(rawLng) && rawLng !== 0 ? rawLng : null;

    if (stationMap.has(statId)) {
      const existing = stationMap.get(statId)!;
      existing.chargerCount += 1;
      if (isFast) existing.chargeSpeed = '급속';
      // 같은 statId의 후속 item에 좌표가 있으면 보강
      if (existing.lat == null && lat != null && lng != null) {
        existing.lat = lat;
        existing.lng = lng;
      }
    } else {
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

  return {
    stations: Array.from(stationMap.values()),
    units,
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
  const { enrichWithGeocode } = await import('./geocode-fill');

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

  const result = buildEvChargerData(allItems);
  await enrichWithGeocode(result.stations);
  return result;
}
