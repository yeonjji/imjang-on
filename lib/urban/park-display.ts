// 공원 원문 필드(시설 문자열·면적·지정 고시일)를 화면 문구로 바꾸는 순수 함수.
import { formatParkArea } from '@/lib/urban/adapters/park';

/** 국제 규격 축구장 1면(105m × 68m). */
export const SOCCER_FIELD_M2 = 7140;

/**
 * 실측(2026-09-30) 구분자는 '+'가 대부분이고 ',' '/'가 섞여 있다.
 * 괄호 안의 구분자는 항목의 일부다 — '다목적구장(배드민턴+족구)2'는 한 칩이어야 한다.
 */
export function splitFacilities(s: string | null | undefined): string[] {
  if (!s) return [];
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === '+' || ch === ',' || ch === '/')) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return Array.from(new Set(parts.map((x) => x.trim()).filter(Boolean)));
}

export interface ParkFacilityGroup {
  label: string;
  items: string[];
}

const GROUPS = [
  { key: 'facilityPlay', label: '놀이시설' },
  { key: 'facilitySport', label: '운동시설' },
  { key: 'facilityConvenience', label: '편의시설' },
  { key: 'facilityCulture', label: '교양시설' },
] as const;

export function parkFacilityGroups(r: {
  facilityPlay?: string | null;
  facilitySport?: string | null;
  facilityConvenience?: string | null;
  facilityCulture?: string | null;
}): ParkFacilityGroup[] {
  return GROUPS.map((g) => ({ label: g.label, items: splitFacilities(r[g.key]) })).filter(
    (g) => g.items.length > 0,
  );
}

export function soccerFieldCount(area: number | null | undefined): number | null {
  if (!area) return null;
  // 내림: 반 면짜리 공원을 "약 1개"로 부풀리지 않는다(과장 금지).
  const n = Math.floor(area / SOCCER_FIELD_M2);
  return n >= 1 ? n : null;
}

export function buildParkHeroLine(r: { area?: number | null; designatedAt?: Date | null }): string | null {
  const parts: string[] = [];
  const area = formatParkArea(r.area);
  if (area) parts.push(`면적 ${area}`);
  const fields = soccerFieldCount(r.area);
  if (fields) parts.push(`축구장 약 ${fields.toLocaleString('ko-KR')}개 크기`);
  if (r.designatedAt) parts.push(`${r.designatedAt.getUTCFullYear()}년 지정`);
  return parts.length ? parts.join(' · ') : null;
}
