import { logger } from '@/lib/logger';
import type { NormalizedSchool } from './types';

const BASE_URL = 'https://open.neis.go.kr/hub/schoolInfo';
const PAGE_SIZE = 1000;
const MAX_PAGES = 1000;

// NEIS 응답: { schoolInfo: [ { head: [ {list_total_count}, {RESULT} ] }, { row: [...] } ] }
// 데이터 없음: { RESULT: { CODE: 'INFO-200', MESSAGE: '...' } } (schoolInfo 키 자체가 없음)
interface NeisResult {
  CODE?: string;
  MESSAGE?: string;
}

function pick(item: Record<string, unknown>, key: string): string | null {
  const v = item[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export function parseSchoolJson(body: string): {
  rows: NormalizedSchool[];
  totalCount: number;
} {
  const parsed = JSON.parse(body) as Record<string, unknown>;

  // 최상위 RESULT만 있는 경우 = 데이터 없음/에러
  const topResult = parsed.RESULT as NeisResult | undefined;
  if (topResult?.CODE && topResult.CODE !== 'INFO-000') {
    if (topResult.CODE === 'INFO-200') return { rows: [], totalCount: 0 };
    throw new Error(`NEIS error ${topResult.CODE}: ${topResult.MESSAGE}`);
  }

  const blocks = parsed.schoolInfo as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(blocks)) return { rows: [], totalCount: 0 };

  const head = (blocks[0]?.head as Array<Record<string, unknown>>) ?? [];
  const totalCount = Number(head.find((h) => 'list_total_count' in h)?.list_total_count ?? 0);

  const result = head.find((h) => 'RESULT' in h)?.RESULT as NeisResult | undefined;
  if (result?.CODE && result.CODE !== 'INFO-000') {
    if (result.CODE === 'INFO-200') return { rows: [], totalCount: 0 };
    throw new Error(`NEIS error ${result.CODE}: ${result.MESSAGE}`);
  }

  const items = (blocks[1]?.row as Array<Record<string, unknown>>) ?? [];
  const rows: NormalizedSchool[] = [];
  for (const item of items) {
    const sourceId = pick(item, 'SD_SCHUL_CODE');
    const name = pick(item, 'SCHUL_NM');
    if (!sourceId || !name) continue;

    rows.push({
      sourceId,
      name,
      address: pick(item, 'ORG_RDNMA') ?? '',
      lat: null,
      lng: null,
      schoolKind: pick(item, 'SCHUL_KND_SC_NM'),
      foundType: pick(item, 'FOND_SC_NM'),
      coeduType: pick(item, 'COEDU_SC_NM'),
      region: pick(item, 'LCTN_SC_NM'),
      eduOffice: pick(item, 'ATPT_OFCDC_SC_NM'),
      tel: pick(item, 'ORG_TELNO'),
      homepage: pick(item, 'HMPG_ADRES'),
    });
  }

  return { rows, totalCount };
}

export async function fetchAllSchools(): Promise<NormalizedSchool[]> {
  const { env } = await import('@/lib/env');
  const { fetchAmenityPage } = await import('./http');
  const { enrichWithGeocode } = await import('./geocode-fill');

  const apiKey = env.NEIS_API_KEY;
  if (!apiKey) throw new Error('NEIS_API_KEY is required');

  const all: NormalizedSchool[] = [];
  let pIndex = 1;
  while (pIndex <= MAX_PAGES) {
    const body = await fetchAmenityPage(BASE_URL, {
      KEY: apiKey,
      Type: 'json',
      pIndex,
      pSize: PAGE_SIZE,
    });
    const { rows, totalCount } = parseSchoolJson(body);
    all.push(...rows);
    if (pIndex === 1 || pIndex % 5 === 0) {
      logger.info({ pIndex, fetched: all.length, totalCount }, 'school page fetched');
    }
    if (rows.length === 0 || all.length >= totalCount) break;
    pIndex++;
  }

  return enrichWithGeocode(all);
}
