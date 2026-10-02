// 충전소 원문 필드를 화면 문구로 바꾸는 순수 함수.

/**
 * 시설 구분 대분류. 공식 가이드(docx)는 포털 첨부로만 있어, 공개 프로젝트
 * (github.com/murianwind/ev_charger_map) 표를 쓰되 2026-10-02 실측 표본과 대조했다
 * (H0 행 = 아파트, A0 행 = 공공기관). 표에 없는 코드는 표시하지 않는다.
 */
const FACILITY_KIND: Record<string, string> = {
  A0: '공공시설',
  B0: '주차시설',
  C0: '휴게시설',
  D0: '관광시설',
  E0: '상업시설',
  F0: '차량정비시설',
  G0: '기타시설',
  H0: '공동주택시설',
  I0: '근린생활시설',
  J0: '교육문화시설',
};

export function facilityKindLabel(code: string | null | undefined): string | null {
  return code ? FACILITY_KIND[code] ?? null : null;
}

export function floorLabel(type: string | null | undefined, num: number | null | undefined): string | null {
  if (!num || num < 1 || num > 99) return null;
  if (type === 'B') return `지하 ${num}층`;
  if (type === 'F') return `지상 ${num}층`;
  return null;
}

export function maxOutputKw(units: { outputKw?: number | null }[]): number | null {
  const vals = units.map((u) => u.outputKw).filter((v): v is number => typeof v === 'number');
  return vals.length ? Math.max(...vals) : null;
}

export function installYearRange(units: { installYear?: number | null }[]): string | null {
  const ys = units.map((u) => u.installYear).filter((v): v is number => typeof v === 'number');
  if (!ys.length) return null;
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  return min === max ? `${min}년` : `${min}~${max}년`;
}
