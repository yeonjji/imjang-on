import { normalizeName } from '@/lib/slug';

/** 주제 → dedupe·detectedFrom용 slug. normalizeName(공백·부호 제거+소문자) 후 40자 컷. */
export function manualSlug(topic: string): string {
  return normalizeName(topic).slice(0, 40);
}

/** 같은 날 같은 주제 재생성 차단(다른 날은 허용). */
export function manualDedupeKey(topic: string, dateISO: string): string {
  return `manual:${manualSlug(topic)}:${dateISO}`;
}

/** UTC Date → KST(+9h) 기준 YYYY-MM-DD. */
export function kstDateISO(d: Date): string {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
