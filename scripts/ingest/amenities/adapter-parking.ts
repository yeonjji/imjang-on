import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';
import type { NormalizedParking } from './types';

const BASE_URL = 'https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api';
const PAGE_SIZE = 1000;

function strOrNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function coordOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

function boolFromYn(v: unknown): boolean | null {
  const s = strOrNull(v);
  if (s === null) return null;
  if (s === 'Y') return true;
  if (s === 'N') return false;
  return null;
}

function parseRefDate(v: unknown): Date | null {
  const s = strOrNull(v);
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function parseParkingXml(xml: string): {
  rows: NormalizedParking[];
  totalCount: number;
} {
  const parsed = parseXml(xml);
  const items = getItems(parsed) as Record<string, unknown>[];
  const totalCount = getTotalCount(parsed);

  const rows: NormalizedParking[] = [];
  for (const item of items) {
    const sourceId = strOrNull(item.prkplceNo);
    if (!sourceId) continue;

    const rdnmadr = strOrNull(item.rdnmadr);
    const lnmadr = strOrNull(item.lnmadr);
    const address = rdnmadr ?? lnmadr ?? '';

    rows.push({
      sourceId,
      name: strOrNull(item.prkplceNm) ?? '',
      prkplceSe: strOrNull(item.prkplceSe),
      prkplceType: strOrNull(item.prkplceType),
      rdnmadr,
      lnmadr,
      address,
      lat: coordOrNull(item.latitude),
      lng: coordOrNull(item.longitude),
      prkcmprt: numOrNull(item.prkcmprt),
      feedingSe: strOrNull(item.feedingSe),
      enforceSe: strOrNull(item.enforceSe),
      operDay: strOrNull(item.operDay),
      // 공공데이터 응답의 원본 필드명에 오타가 있는 채로 표준화돼 있어 그대로 매핑한다.
      weekdayOpenHhmm: strOrNull(item.weekdayOperOpenHhmm),
      weekdayCloseHhmm: strOrNull(item.weekdayOperColseHhmm),
      satOpenHhmm: strOrNull(item.satOperOperOpenHhmm),
      satCloseHhmm: strOrNull(item.satOperCloseHhmm),
      holidayOpenHhmm: strOrNull(item.holidayOperOpenHhmm),
      holidayCloseHhmm: strOrNull(item.holidayCloseOpenHhmm),
      chargeInfo: strOrNull(item.parkingchrgeInfo),
      basicTime: numOrNull(item.basicTime),
      basicCharge: numOrNull(item.basicCharge),
      addUnitTime: numOrNull(item.addUnitTime),
      addUnitCharge: numOrNull(item.addUnitCharge),
      dayCmmtkt: numOrNull(item.dayCmmtkt),
      monthCmmtkt: numOrNull(item.monthCmmtkt),
      metpay: strOrNull(item.metpay),
      spcmnt: strOrNull(item.spcmnt),
      pwdbsPpkZoneYn: boolFromYn(item.pwdbsPpkZoneYn),
      institutionNm: strOrNull(item.institutionNm),
      phoneNumber: strOrNull(item.phoneNumber),
      insttCode: strOrNull(item.insttCode),
      insttNm: strOrNull(item.insttNm),
      referenceDate: parseRefDate(item.referenceDate),
    });
  }

  return { rows, totalCount };
}

export async function fetchAllParkings(): Promise<NormalizedParking[]> {
  const { env } = await import('@/lib/env');
  const { fetchAmenityPage, fetchAllPages } = await import('./http');
  const { enrichWithGeocode } = await import('./geocode-fill');

  const serviceKey = env.PUBLIC_DATA_KEY;
  if (!serviceKey) throw new Error('PUBLIC_DATA_KEY is required');

  const all: NormalizedParking[] = [];

  await fetchAllPages(async (pageNo) => {
    const xml = await fetchAmenityPage(BASE_URL, {
      serviceKey,
      pageNo,
      numOfRows: PAGE_SIZE,
      type: 'xml',
    });
    const { rows, totalCount } = parseParkingXml(xml);
    all.push(...rows);
    return { items: rows, totalCount };
  });

  return enrichWithGeocode(all);
}
