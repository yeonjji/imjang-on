import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';
import type { NormalizedSchool } from './types';

const BASE_URL = 'https://apis.data.go.kr/1741000/baseSchoolInfo/getBaseSchoolList';
const PAGE_SIZE = 1000;

export function parseSchoolXml(xml: string): {
  rows: NormalizedSchool[];
  totalCount: number;
} {
  const parsed = parseXml(xml);
  const items = getItems(parsed) as Record<string, unknown>[];
  const totalCount = getTotalCount(parsed);

  const rows: NormalizedSchool[] = [];
  for (const item of items) {
    const lat = Number(item.latitude);
    const lng = Number(item.longitude);
    if (!lat || !lng) continue;

    const sourceId = String(item.schoolId ?? '').trim();
    if (!sourceId) continue;

    rows.push({
      sourceId,
      name: String(item.schoolNm ?? '').trim(),
      address: String(item.rdnmadr ?? '').trim(),
      lat,
      lng,
      schoolLevel: String(item.schlSe ?? '').trim(),
      schoolType: item.fondScCd ? String(item.fondScCd).trim() : null,
    });
  }

  return { rows, totalCount };
}

export async function fetchAllSchools(): Promise<NormalizedSchool[]> {
  const { env } = await import('@/lib/env');
  const { fetchAmenityPage, fetchAllPages } = await import('./http');

  const serviceKey = env.PUBLIC_DATA_KEY;
  if (!serviceKey) throw new Error('PUBLIC_DATA_KEY is required');

  const all: NormalizedSchool[] = [];

  await fetchAllPages(async (pageNo) => {
    const xml = await fetchAmenityPage(BASE_URL, {
      serviceKey,
      pageNo,
      numOfRows: PAGE_SIZE,
    });
    const { rows, totalCount } = parseSchoolXml(xml);
    all.push(...rows);
    return { items: rows, totalCount };
  });

  return all;
}
