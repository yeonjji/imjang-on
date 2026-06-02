export function formatOpenedDate(d: Date | null): string | null {
  if (!d) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

export interface InfoRow {
  label: string;
  value: string;
}

interface InfoSource {
  typeName: string | null;
  openedAt: Date | null;
  tel: string | null;
  zipcode: string | null;
  sido: string | null;
  sigungu: string | null;
  eupmyeondong: string | null;
}

export function buildPharmacyInfoRows(p: InfoSource): InfoRow[] {
  const rows: InfoRow[] = [];
  if (p.typeName) rows.push({ label: '종별', value: p.typeName });
  const opened = formatOpenedDate(p.openedAt);
  if (opened) rows.push({ label: '개설일', value: opened });
  if (p.tel) rows.push({ label: '전화', value: p.tel });
  if (p.zipcode) rows.push({ label: '우편번호', value: p.zipcode });
  if (p.sido) rows.push({ label: '시도', value: p.sido });
  if (p.sigungu) rows.push({ label: '시군구', value: p.sigungu });
  if (p.eupmyeondong) rows.push({ label: '읍면동', value: p.eupmyeondong });
  return rows;
}
