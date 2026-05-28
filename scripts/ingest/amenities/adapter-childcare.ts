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
  const lat = Number(item.la);
  const lng = Number(item.lo);
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
  if (/INFO-100|INFO-400/.test(body)) return 'key';
  if (/INFO-300/.test(body)) return 'rate';
  if (/ERROR-100|ERROR-200/.test(body)) return 'server';
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
    const sourceId = pickStr(item, 'stcode');
    const name = pickStr(item, 'crname');
    if (!sourceId || !name) continue;
    const { lat, lng } = pickCoord(item);

    rows.push({
      sourceId,
      name,
      crType: pickStr(item, 'crtypename'),
      status: pickStr(item, 'crstatusname'),
      vehicleOp: pickStr(item, 'crcargbname'),
      services: pickStr(item, 'crspec'),
      sido: pickStr(item, 'sidoname'),
      sigungu: pickStr(item, 'sigunguname'),
      sigunguCode: fallbackArcode,
      zipcode: pickStr(item, 'zipcode'),
      address: pickStr(item, 'craddr') ?? '',
      tel: pickStr(item, 'crtelno'),
      fax: pickStr(item, 'crfaxno'),
      homepage: pickStr(item, 'crhome'),
      repName: pickStr(item, 'crrepname'),
      lat,
      lng,
      roomCount: pickInt(item, 'nrtrroomcnt'),
      roomSize: pickInt(item, 'nrtrroomsize'),
      playgroundCount: pickInt(item, 'plgrdco'),
      cctvCount: pickInt(item, 'cctvinstlcnt'),
      staffCount: pickInt(item, 'chcrtescnt'),
      capacity: pickInt(item, 'crcapat'),
      currentCount: pickInt(item, 'crchcnt'),
      confirmDate: pickDate(item, 'crcnfmdt'),
      pauseBeginDate: pickDate(item, 'crpausebegindt'),
      pauseEndDate: pickDate(item, 'crpauseenddt'),
      abolishDate: pickDate(item, 'crabldt'),
      dataStdDate: pickDate(item, 'datastdrdt'),
      classCnt00: pickInt(item, 'class_cnt_00'),
      classCnt01: pickInt(item, 'class_cnt_01'),
      classCnt02: pickInt(item, 'class_cnt_02'),
      classCnt03: pickInt(item, 'class_cnt_03'),
      classCnt04: pickInt(item, 'class_cnt_04'),
      classCnt05: pickInt(item, 'class_cnt_05'),
      classCntM2: pickInt(item, 'class_cnt_m2'),
      classCntM3: pickInt(item, 'class_cnt_m3'),
      classCntM5: pickInt(item, 'class_cnt_m5'),
      classCntSp: pickInt(item, 'class_cnt_sp'),
      classCntTot: pickInt(item, 'class_cnt_tot'),
      childCnt00: pickInt(item, 'child_cnt_00'),
      childCnt01: pickInt(item, 'child_cnt_01'),
      childCnt02: pickInt(item, 'child_cnt_02'),
      childCnt03: pickInt(item, 'child_cnt_03'),
      childCnt04: pickInt(item, 'child_cnt_04'),
      childCnt05: pickInt(item, 'child_cnt_05'),
      childCntM2: pickInt(item, 'child_cnt_m2'),
      childCntM3: pickInt(item, 'child_cnt_m3'),
      childCntM5: pickInt(item, 'child_cnt_m5'),
      childCntSp: pickInt(item, 'child_cnt_sp'),
      childCntTot: pickInt(item, 'child_cnt_tot'),
      emTenure0y: pickInt(item, 'em_cnt_0y'),
      emTenure1y: pickInt(item, 'em_cnt_1y'),
      emTenure2y: pickInt(item, 'em_cnt_2y'),
      emTenure4y: pickInt(item, 'em_cnt_4y'),
      emTenure6y: pickInt(item, 'em_cnt_6y'),
      emRoleDirector: pickInt(item, 'em_cnt_a1'),
      emRoleTeacher: pickInt(item, 'em_cnt_a2'),
      emRoleSpecial: pickInt(item, 'em_cnt_a3'),
      emRoleTherapy: pickInt(item, 'em_cnt_a4'),
      emRoleNutrition: pickInt(item, 'em_cnt_a5'),
      emRoleNurse: pickInt(item, 'em_cnt_a6'),
      emRoleNurseAssist: pickInt(item, 'em_cnt_a10'),
      emRoleCook: pickInt(item, 'em_cnt_a7'),
      emRoleOffice: pickInt(item, 'em_cnt_a8'),
      emRoleTot: pickInt(item, 'em_cnt_tot'),
      waitCnt00: pickInt(item, 'ew_cnt_00'),
      waitCnt01: pickInt(item, 'ew_cnt_01'),
      waitCnt02: pickInt(item, 'ew_cnt_02'),
      waitCnt03: pickInt(item, 'ew_cnt_03'),
      waitCnt04: pickInt(item, 'ew_cnt_04'),
      waitCnt05: pickInt(item, 'ew_cnt_05'),
      waitCntM6: pickInt(item, 'ew_cnt_m6'),
      waitCntTot: pickInt(item, 'ew_cnt_tot'),
    });
  }
  return rows;
}

export { BASE_URL };
