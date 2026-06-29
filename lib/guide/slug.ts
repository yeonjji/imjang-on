import { normalizeName } from '@/lib/slug';

/** 상록 가이드 slug: 제목 정규화(60자 컷). board와 달리 날짜 prefix 없음(evergreen). 충돌 시 suffix(>=2). */
export function buildGuideSlug(title: string, suffix?: number): string {
  const base = normalizeName(title).slice(0, 60);
  return suffix && suffix >= 2 ? `${base}-${suffix}` : base;
}
