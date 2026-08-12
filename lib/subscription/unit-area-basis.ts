/**
 * `scripts/ingest/subscriptions/adapter-applyhome.ts`의 `num()`이 쓰는 "값 있음" 판정을
 * 그대로 복제한다(lib은 scripts를 import하지 않으므로 로컬에 다시 둠). `SubscriptionUnit.area`는
 * 그 `num()`의 결과값이고, 이 함수는 같은 rawJson 원본을 다시 보고 라벨(공급/전용)을 정하는데,
 * 두 함수가 "값 없음"으로 보는 기준이 어긋나면 화면에 실제 숫자와 다른 라벨이 나란히 찍힌다.
 * 예: rawJson = { SUPLY_AR: '-', EXCLUSE_AR: '59.99' }일 때 어댑터는 '-'를 결측 sentinel로
 * 걸러 area = num('-') ?? num('59.99') = 59.99(전용면적)를 만드는데, 여기서 단순
 * null/'' 체크만 하면 SUPLY_AR이 "있다"고 오판해 59.99 옆에 '공급'이라 표시하게 된다.
 * '-'는 API가 실제로 쓰는 결측 sentinel이라 어댑터의 str()이 명시적으로 걸러낸다(가상의 케이스가
 * 아니다). 마찬가지로 '미정'처럼 숫자로 파싱되지 않는 문자열도 어댑터의 num()에서는 값 없음이다.
 */
function hasNumericValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  if (s === '' || s === '-') return false;
  return Number.isFinite(Number(s.replace(/,/g, '')));
}

/**
 * `SubscriptionUnit.area`가 공급면적인지 전용면적인지 판정한다.
 * 어댑터가 `area: num(SUPLY_AR) ?? num(EXCLUSE_AR)`로 채워 컬럼 의미가 섞여 있다.
 * 실측 25,255 units: SUPLY_AR 20,156 · EXCLUSE_AR만 3,107 · 둘 다 없음 1,992.
 */
export function unitAreaBasis(rawJson: unknown): 'supply' | 'exclusive' | null {
  if (!rawJson || typeof rawJson !== 'object') return null;
  const r = rawJson as Record<string, unknown>;
  if (hasNumericValue(r.SUPLY_AR)) return 'supply';
  if (hasNumericValue(r.EXCLUSE_AR)) return 'exclusive';
  return null;
}

export function areaBasisLabel(basis: 'supply' | 'exclusive' | null): string {
  return basis === 'supply' ? '공급' : basis === 'exclusive' ? '전용' : '';
}
