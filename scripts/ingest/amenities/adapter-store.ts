import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';
import type { NormalizedStore } from './types';

const BASE_URL = 'https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInUpjong';
const PAGE_SIZE = 1000;

// 전체 상가업소(~280만)는 과도하므로 임장에 의미있는 생활인프라 업종만 수집(~31만).
// 편의점/슈퍼/마트/약국/카페는 소분류(indsSclsCd), 병원/의원은 중분류(indsMclsCd) 단위로 가져온다.
export const STORE_UPJONG_TARGETS: Array<{
  divId: 'indsMclsCd' | 'indsSclsCd';
  code: string;
  label: string;
}> = [
  { divId: 'indsSclsCd', code: 'G20405', label: '편의점' },
  { divId: 'indsSclsCd', code: 'G20404', label: '슈퍼마켓' },
  { divId: 'indsSclsCd', code: 'G20402', label: '대형마트' },
  { divId: 'indsSclsCd', code: 'G21501', label: '약국' },
  { divId: 'indsSclsCd', code: 'I21201', label: '카페' },
  { divId: 'indsMclsCd', code: 'Q101', label: '병원' },
  { divId: 'indsMclsCd', code: 'Q102', label: '의원' },
];

function pickStr(item: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = item[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

export function parseStoreXml(
  xml: string,
  fallbackSigungu = '',
): {
  rows: NormalizedStore[];
  totalCount: number;
} {
  const parsed = parseXml(xml);
  const items = getItems(parsed) as Record<string, unknown>[];
  const totalCount = getTotalCount(parsed);

  const rows: NormalizedStore[] = [];
  for (const item of items) {
    const sourceId = String(item.bizesId ?? '').trim();
    if (!sourceId) continue;

    const rawLat = Number(item.lat);
    const rawLng = Number(item.lon);
    const lat = Number.isFinite(rawLat) && rawLat !== 0 ? rawLat : null;
    const lng = Number.isFinite(rawLng) && rawLng !== 0 ? rawLng : null;

    rows.push({
      sourceId,
      name: String(item.bizesNm ?? '').trim(),
      address: String(item.rdnmAdr ?? '').trim(),
      lat,
      lng,
      // 가장 구체적인 분류(소→중→대)를 우선 저장해 '편의점'/'약국'처럼 의미있게 표시
      industryCode: pickStr(item, 'indsSclsCd', 'indsMclsCd', 'indsLclsCd'),
      industryName: pickStr(item, 'indsSclsNm', 'indsMclsNm', 'indsLclsNm'),
      sigunguCode: item.signguCd ? String(item.signguCd).trim() : fallbackSigungu,
    });
  }

  return { rows, totalCount };
}

export async function fetchStoresByUpjong(
  divId: string,
  code: string,
): Promise<NormalizedStore[]> {
  const { env } = await import('@/lib/env');
  const { fetchAmenityPage, fetchAllPages } = await import('./http');
  const { enrichWithGeocode } = await import('./geocode-fill');

  const serviceKey = env.PUBLIC_DATA_KEY;
  if (!serviceKey) throw new Error('PUBLIC_DATA_KEY is required');

  const all: NormalizedStore[] = [];

  await fetchAllPages(async (pageNo) => {
    const xml = await fetchAmenityPage(BASE_URL, {
      serviceKey,
      divId,
      key: code,
      pageNo,
      numOfRows: PAGE_SIZE,
    });
    const { rows, totalCount } = parseStoreXml(xml);
    all.push(...rows);
    return { items: rows, totalCount };
  });

  return enrichWithGeocode(all);
}
