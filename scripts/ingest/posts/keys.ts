import crypto from 'node:crypto';

/** 보도자료 URL → 중복 방지 키(sha256 hex). 같은 보도자료 재생성 차단. */
export function dedupeKey(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex');
}

/** Date → KST 기준 YYYY-MM-DD (slug 날짜용). */
export function kstDateISO(d: Date): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}
