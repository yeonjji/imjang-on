/**
 * `SubscriptionUnit.area`가 공급면적인지 전용면적인지 판정한다.
 * 어댑터가 `area: num(SUPLY_AR) ?? num(EXCLUSE_AR)`로 채워 컬럼 의미가 섞여 있다.
 * 실측 25,255 units: SUPLY_AR 20,156 · EXCLUSE_AR만 3,107 · 둘 다 없음 1,992.
 */
export function unitAreaBasis(rawJson: unknown): 'supply' | 'exclusive' | null {
  if (!rawJson || typeof rawJson !== 'object') return null;
  const r = rawJson as Record<string, unknown>;
  if (r.SUPLY_AR != null && r.SUPLY_AR !== '') return 'supply';
  if (r.EXCLUSE_AR != null && r.EXCLUSE_AR !== '') return 'exclusive';
  return null;
}

export function areaBasisLabel(basis: 'supply' | 'exclusive' | null): string {
  return basis === 'supply' ? '공급' : basis === 'exclusive' ? '전용' : '';
}
