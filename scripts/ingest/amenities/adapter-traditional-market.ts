import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';
import { decodeEntities } from '@/lib/text/decode-entities';
import type { NormalizedTraditionalMarket } from './types';
import { strOrNull, boolFromYn, parseRefDate, intInRange, clip } from './parse-helpers';
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
      // sourceId는 원본 name+address 해시로 유지(디코딩 시 해시가 바뀌면 기존 행과 매칭 깨져 중복 발생).
      // 저장값만 디코딩한다.
      sourceId: marketSourceId(name, address),
      name: decodeEntities(name),
      address: decodeEntities(address),
      lat,
      lng,
      marketType: item.mrktType ? String(item.mrktType).trim() : null,
      storeCount: intInRange(item.storNumber, 1, 100_000),
      openCycle: clip(strOrNull(item.mrktEstblCycle), 40),
      establishedYear: intInRange(item.estblYear, 1700, new Date().getUTCFullYear()),
      products: clip(
        item.trtmntPrdlst != null ? decodeEntities(String(item.trtmntPrdlst).trim()) || null : null,
        300,
      ),
      hasParking: boolFromYn(item.prkplceYn),
      hasToilet: boolFromYn(item.pblicToiletYn),
      // parseTagValue가 하이픈 없는 번호를 숫자로 바꿔 앞자리 0이 사라진다 → 문자열로 온 값만 신뢰.
      tel: typeof item.phoneNumber === 'string' ? clip(strOrNull(item.phoneNumber), 30) : null,
      homepage: clip(strOrNull(item.homepageUrl), 200),
      referenceDate: parseRefDate(item.referenceDate),
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
      // 미지정 시 JSON 응답 → XML 파서가 0건으로 조용히 끝난다.
      type: 'xml',
    });
    const { rows, totalCount } = parseTraditionalMarketXml(xml);
    all.push(...rows);
    return { items: rows, totalCount };
  });

  return enrichWithGeocode(all);
}
