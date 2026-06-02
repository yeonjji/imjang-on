import type { NormalizedPharmacy } from './types';

function str(v: unknown): string { return String(v ?? '').trim(); }
function strOrNull(v: unknown): string | null { const s = str(v); return s || null; }
function dateOrNull(v: unknown): Date | null { return v instanceof Date ? v : null; }
function isKoreaCoord(lat: number | null, lng: number | null): boolean {
  return lat !== null && lng !== null && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}

export function parsePharmacyRows(rows: Record<string, unknown>[]): NormalizedPharmacy[] {
  const result: NormalizedPharmacy[] = [];
  for (const row of rows) {
    const sourceId = str(row['암호화요양기호']);
    if (!sourceId) continue;
    const rawLng = Number(row['좌표(X)']);
    const rawLat = Number(row['좌표(Y)']);
    const lat = Number.isFinite(rawLat) && rawLat !== 0 ? rawLat : null;
    const lng = Number.isFinite(rawLng) && rawLng !== 0 ? rawLng : null;
    result.push({
      sourceId,
      name: str(row['요양기관명']),
      typeCode: strOrNull(String(row['종별코드'] ?? '')),
      typeName: strOrNull(row['종별코드명']),
      sido: strOrNull(row['시도코드명']),
      sigungu: strOrNull(row['시군구코드명']),
      sigunguCode: strOrNull(String(row['시군구코드'] ?? '')),
      eupmyeondong: strOrNull(row['읍면동']),
      zipcode: strOrNull(row['우편번호']),
      address: str(row['주소']),
      tel: strOrNull(row['전화번호']),
      openedAt: dateOrNull(row['개설일자']),
      lat: isKoreaCoord(lat, lng) ? lat : null,
      lng: isKoreaCoord(lat, lng) ? lng : null,
    });
  }
  return result;
}
