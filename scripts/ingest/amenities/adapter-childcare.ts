import { parseXml, parseCommaNumber } from '@/scripts/ingest/xml-parse';
import type { NormalizedChildcare } from './types';

const BASE_URL =
  'http://api.childcare.go.kr/mediate/rest/cpmsapi030/cpmsapi030/request';

// 한국 영역 bbox — 명세 예제 좌표가 깨져 있어 검증이 필요
const KR_LAT = [33, 39] as const;
const KR_LNG = [124, 132] as const;

function pickStr(item: Record<string, unknown>, key: string): string | null {
  const v = item[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function pickInt(item: Record<string, unknown>, key: string): number | null {
  return parseCommaNumber(item[key] as string | number | null | undefined);
}

function pickDate(item: Record<string, unknown>, key: string): Date | null {
  const v = item[key];
  if (v == null) return null;
  const digits = String(v).trim().replace(/-/g, '');
  if (digits.length !== 8) return null;
  const y = Number(digits.slice(0, 4));
  const m = Number(digits.slice(4, 6));
  const d = Number(digits.slice(6, 8));
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function pickCoord(item: Record<string, unknown>): { lat: number | null; lng: number | null } {
  const lat = item.la != null && item.la !== '' ? Number(item.la) : NaN;
  const lng = item.lo != null && item.lo !== '' ? Number(item.lo) : NaN;
  if (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= KR_LAT[0] && lat <= KR_LAT[1] &&
    lng >= KR_LNG[0] && lng <= KR_LNG[1]
  ) {
    return { lat, lng };
  }
  return { lat: null, lng: null };
}

export function detectChildcareError(body: string): 'key' | 'rate' | 'server' | null {
  if (/\bINFO-100\b|\bINFO-400\b/.test(body)) return 'key';
  if (/\bINFO-300\b/.test(body)) return 'rate';
  if (/\bERROR-100\b|\bERROR-200\b/.test(body)) return 'server';
  return null;
}

export function parseChildcareXml(
  xml: string,
  fallbackArcode: string,
): NormalizedChildcare[] {
  const parsed = parseXml(xml);
  const itemNode = (parsed as any)?.response?.item;
  if (!itemNode) return [];
  const items = (Array.isArray(itemNode) ? itemNode : [itemNode]) as Record<string, unknown>[];

  const rows: NormalizedChildcare[] = [];
  for (const item of items) {
    // Normalize to lowercase keys — real API returns UPPERCASE for count/staff/wait fields
    const lower: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(item)) lower[k.toLowerCase()] = v;

    const sourceId = pickStr(lower, 'stcode');
    const name = pickStr(lower, 'crname');
    // Real stcodes are 11 digits; also filters the unauthorized template/manifest response
    if (!sourceId || !name || !/^\d{11}$/.test(sourceId)) continue;
    const { lat, lng } = pickCoord(lower);

    rows.push({
      sourceId,
      name,
      crType: pickStr(lower, 'crtypename'),
      status: pickStr(lower, 'crstatusname'),
      vehicleOp: pickStr(lower, 'crcargbname'),
      services: pickStr(lower, 'crspec'),
      sido: pickStr(lower, 'sidoname'),
      // Real API uses <sigunname> (not <sigunguname> from spec)
      sigungu: pickStr(lower, 'sigunguname') ?? pickStr(lower, 'sigunname'),
      sigunguCode: fallbackArcode,
      zipcode: pickStr(lower, 'zipcode'),
      address: pickStr(lower, 'craddr') ?? '',
      tel: pickStr(lower, 'crtelno'),
      fax: pickStr(lower, 'crfaxno'),
      homepage: pickStr(lower, 'crhome'),
      repName: pickStr(lower, 'crrepname'),
      lat,
      lng,
      roomCount: pickInt(lower, 'nrtrroomcnt'),
      roomSize: pickInt(lower, 'nrtrroomsize'),
      playgroundCount: pickInt(lower, 'plgrdco'),
      cctvCount: pickInt(lower, 'cctvinstlcnt'),
      staffCount: pickInt(lower, 'chcrtescnt'),
      capacity: pickInt(lower, 'crcapat'),
      currentCount: pickInt(lower, 'crchcnt'),
      confirmDate: pickDate(lower, 'crcnfmdt'),
      pauseBeginDate: pickDate(lower, 'crpausebegindt'),
      pauseEndDate: pickDate(lower, 'crpauseenddt'),
      abolishDate: pickDate(lower, 'crabldt'),
      dataStdDate: pickDate(lower, 'datastdrdt'),
      classCnt00: pickInt(lower, 'class_cnt_00'),
      classCnt01: pickInt(lower, 'class_cnt_01'),
      classCnt02: pickInt(lower, 'class_cnt_02'),
      classCnt03: pickInt(lower, 'class_cnt_03'),
      classCnt04: pickInt(lower, 'class_cnt_04'),
      classCnt05: pickInt(lower, 'class_cnt_05'),
      classCntM2: pickInt(lower, 'class_cnt_m2'),
      classCntM3: pickInt(lower, 'class_cnt_m3'),
      classCntM5: pickInt(lower, 'class_cnt_m5'),
      classCntSp: pickInt(lower, 'class_cnt_sp'),
      classCntTot: pickInt(lower, 'class_cnt_tot'),
      childCnt00: pickInt(lower, 'child_cnt_00'),
      childCnt01: pickInt(lower, 'child_cnt_01'),
      childCnt02: pickInt(lower, 'child_cnt_02'),
      childCnt03: pickInt(lower, 'child_cnt_03'),
      childCnt04: pickInt(lower, 'child_cnt_04'),
      childCnt05: pickInt(lower, 'child_cnt_05'),
      childCntM2: pickInt(lower, 'child_cnt_m2'),
      childCntM3: pickInt(lower, 'child_cnt_m3'),
      childCntM5: pickInt(lower, 'child_cnt_m5'),
      childCntSp: pickInt(lower, 'child_cnt_sp'),
      childCntTot: pickInt(lower, 'child_cnt_tot'),
      // API has no em_cnt_3y band (2y → 4y)
      emTenure0y: pickInt(lower, 'em_cnt_0y'),
      emTenure1y: pickInt(lower, 'em_cnt_1y'),
      emTenure2y: pickInt(lower, 'em_cnt_2y'),
      emTenure4y: pickInt(lower, 'em_cnt_4y'),
      emTenure6y: pickInt(lower, 'em_cnt_6y'),
      emRoleDirector: pickInt(lower, 'em_cnt_a1'),
      emRoleTeacher: pickInt(lower, 'em_cnt_a2'),
      emRoleSpecial: pickInt(lower, 'em_cnt_a3'),
      emRoleTherapy: pickInt(lower, 'em_cnt_a4'),
      emRoleNutrition: pickInt(lower, 'em_cnt_a5'),
      emRoleNurse: pickInt(lower, 'em_cnt_a6'),
      emRoleNurseAssist: pickInt(lower, 'em_cnt_a10'),
      emRoleCook: pickInt(lower, 'em_cnt_a7'),
      emRoleOffice: pickInt(lower, 'em_cnt_a8'),
      emRoleTot: pickInt(lower, 'em_cnt_tot'),
      waitCnt00: pickInt(lower, 'ew_cnt_00'),
      waitCnt01: pickInt(lower, 'ew_cnt_01'),
      waitCnt02: pickInt(lower, 'ew_cnt_02'),
      waitCnt03: pickInt(lower, 'ew_cnt_03'),
      waitCnt04: pickInt(lower, 'ew_cnt_04'),
      waitCnt05: pickInt(lower, 'ew_cnt_05'),
      waitCntM6: pickInt(lower, 'ew_cnt_m6'),
      waitCntTot: pickInt(lower, 'ew_cnt_tot'),
    });
  }
  return rows;
}

export { BASE_URL };

export async function fetchAllChildcare(): Promise<NormalizedChildcare[]> {
  const { env } = await import('@/lib/env');
  const { prisma } = await import('@/lib/db');
  const { fetchAmenityPage } = await import('./http');
  const { enrichWithGeocode } = await import('./geocode-fill');
  const { logger } = await import('@/lib/logger');

  const key = env.CHILDCARE_API_KEY;
  if (!key) throw new Error('CHILDCARE_API_KEY is required');

  const regions = await prisma.region.findMany({
    where: { sigunguCode: { not: null } },
    distinct: ['sigunguCode'],
    select: { sigunguCode: true },
  });
  const arcodes = regions
    .map((r) => r.sigunguCode)
    .filter((c): c is string => !!c)
    .sort();

  logger.info({ arcodes: arcodes.length }, 'childcare ingest: arcode 순회 시작');

  const all: NormalizedChildcare[] = [];
  let done = 0;
  for (const arcode of arcodes) {
    const body = await fetchAmenityPage(BASE_URL, { key, arcode, stcode: '' });
    const errKind = detectChildcareError(body);
    if (errKind === 'key') throw new Error(`childcare 인증키 오류(INFO-100/400) arcode=${arcode}`);
    if (errKind === 'rate') throw new Error(`childcare 일 요청 한도 초과(INFO-300) arcode=${arcode} — 재실행 필요`);
    if (errKind === 'server') throw new Error(`childcare 서버 오류(ERROR) arcode=${arcode}`);

    const rows = parseChildcareXml(body, arcode);
    all.push(...rows);
    done++;
    if (done === 1 || done % 30 === 0) {
      logger.info({ done, total: arcodes.length, fetched: all.length }, 'childcare 진행');
    }
  }

  return enrichWithGeocode(all);
}
