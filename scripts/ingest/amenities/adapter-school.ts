import { logger } from '@/lib/logger';
import type { NormalizedSchool } from './types';
import { clip } from './parse-helpers';

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

/** '해당없음'은 값이 아니다(초·중·특수학교의 고교 계열 칸). */
function pickValue(item: Record<string, unknown>, key: string): string | null {
  const v = pick(item, key);
  return v === '해당없음' ? null : v;
}

/**
 * 1월 1일 개교기념일은 자리표시다(예: 1974년 설립 방송통신고들이 일괄 '20020101').
 * 학년도는 3월에 시작하므로 실제 개교일이 1월 1일일 가능성은 낮다.
 */
function realAnniversary(d: Date | null): Date | null {
  return d && !(d.getUTCMonth() === 0 && d.getUTCDate() === 1) ? d : null;
}

/** 나이스 날짜(YYYYMMDD). 8자리가 아니거나 존재하지 않는 날짜는 null. */
export function parseYyyymmdd(v: unknown): Date | null {
  if (v == null) return null;
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(v).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
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
      hsType: clip(pickValue(item, 'HS_SC_NM'), 20),
      hsTrack: clip(pickValue(item, 'HS_GNRL_BUSNS_SC_NM'), 20),
      specialPurpose: clip(pickValue(item, 'SPCLY_PURPS_HS_ORD_NM'), 40),
      admissionPeriod: clip(pickValue(item, 'ENE_BFE_SEHF_SC_NM'), 10),
      foundedAt: parseYyyymmdd(item.FOND_YMD),
      anniversaryAt: realAnniversary(parseYyyymmdd(item.FOAS_MEMRD)),
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
    // NEIS는 Accept에 application/json|xml을 명시하면 500을 반환한다. */* 로 호출.
    const body = await fetchAmenityPage(
      BASE_URL,
      { KEY: apiKey, Type: 'json', pIndex, pSize: PAGE_SIZE },
      { Accept: '*/*' },
    );
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
