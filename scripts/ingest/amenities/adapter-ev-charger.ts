import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';
import type { NormalizedEvCharger, NormalizedEvChargerUnit } from './types';

const FAST_TYPES = new Set(['01', '03', '04', '05', '06', '07']);
const BASE_URL = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo';
// 9999는 응답 크기가 커서 timeout 위험 → 안정성 우선으로 1000
const PAGE_SIZE = 1000;
// 페이지를 모아 한 번에 DB로 flush하는 단위 (20 × 1000 = 20k행). 메모리/쓰기 빈도 균형.
const PAGES_PER_FLUSH = 20;
const MAX_PAGES = 1000;

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

export interface EvChargerFlush {
  result: EvChargerParseResult;
  lastPage: number;
}

// 페이지를 startPage부터 받아 PAGES_PER_FLUSH 단위로 onFlush 콜백에 넘긴다.
// 50만건 전체를 메모리에 모은 뒤 쓰면 마지막 페이지 429에 모두 폐기되므로,
// 받는 즉시 DB에 쓰고 진행 페이지를 체크포인트로 남길 수 있게 스트리밍한다.
// 429로 retry가 소진되면 던지지 않고 멈춰서 partial로 반환한다 (다음 실행이 이어받음).
export async function streamEvChargers(
  startPage: number,
  onFlush: (flush: EvChargerFlush) => Promise<void>,
): Promise<{ lastPage: number; complete: boolean }> {
  const { env } = await import('@/lib/env');
  const { fetchAmenityPage } = await import('./http');
  const { enrichWithGeocode } = await import('./geocode-fill');
  const { logger } = await import('@/lib/logger');

  const serviceKey = env.PUBLIC_DATA_KEY;
  if (!serviceKey) throw new Error('PUBLIC_DATA_KEY is required');

  let pageNo = Math.max(1, startPage);
  let fetchedTotal = (pageNo - 1) * PAGE_SIZE;
  let totalCount = Number.POSITIVE_INFINITY;
  let buffer: Record<string, unknown>[] = [];
  let bufferStartPage = pageNo;
  let lastFlushedPage = pageNo - 1;
  let complete = false;

  const flush = async (uptoPage: number) => {
    if (buffer.length === 0) return;
    const result = buildEvChargerData(buffer);
    await enrichWithGeocode(result.stations);
    await onFlush({ result, lastPage: uptoPage });
    lastFlushedPage = uptoPage;
    buffer = [];
    bufferStartPage = uptoPage + 1;
  };

  while (pageNo <= MAX_PAGES) {
    let xml: string;
    try {
      xml = await fetchAmenityPage(BASE_URL, { serviceKey, pageNo, numOfRows: PAGE_SIZE });
    } catch (err) {
      if (String(err).includes('429')) {
        logger.warn(
          { pageNo, lastFlushedPage },
          'ev-charger 429 — stopping; will resume from checkpoint next run',
        );
        break;
      }
      throw err;
    }

    const parsed = parseXml(xml);
    const items = getItems(parsed) as Record<string, unknown>[];
    const tc = getTotalCount(parsed);
    if (tc) totalCount = tc;
    buffer.push(...items);
    fetchedTotal += items.length;

    const reachedEnd = items.length === 0 || fetchedTotal >= totalCount;
    if (pageNo - bufferStartPage + 1 >= PAGES_PER_FLUSH || reachedEnd) {
      await flush(pageNo);
    }
    if (reachedEnd) {
      complete = true;
      break;
    }
    pageNo++;
  }

  return { lastPage: lastFlushedPage, complete };
}
