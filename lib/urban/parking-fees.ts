export interface FeeInput {
  chargeInfo: string | null;
  basicTime: number | null;
  basicCharge: number | null;
  addUnitTime: number | null;
  addUnitCharge: number | null;
  dayCmmtkt: number | null;
  monthCmmtkt: number | null;
}

export interface FeeItem { label: string; value: string; }

export interface FeeResult {
  free: boolean;
  items: FeeItem[];
}

function fmtKrw(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}

export function normalizeFees(f: FeeInput): FeeResult {
  if (f.chargeInfo === '무료') return { free: true, items: [] };

  const items: FeeItem[] = [];
  if (f.basicTime && f.basicCharge) items.push({ label: '기본요금', value: `${f.basicTime}분 ${f.basicCharge.toLocaleString('ko-KR')}원` });
  if (f.addUnitTime && f.addUnitCharge) items.push({ label: '추가단위', value: `${f.addUnitTime}분 ${f.addUnitCharge.toLocaleString('ko-KR')}원` });
  if (f.dayCmmtkt && f.dayCmmtkt > 0) items.push({ label: '1일권', value: fmtKrw(f.dayCmmtkt) });
  if (f.monthCmmtkt && f.monthCmmtkt > 0) items.push({ label: '월정기', value: fmtKrw(f.monthCmmtkt) });

  return { free: false, items };
}
