/** env 값의 개행·공백·끝 슬래시를 제거해 안전한 origin으로 정규화한다. */
export function normalizeSiteUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

/** 사이트 origin (canonical/sitemap/robots 공통). 폴백은 운영 도메인. */
export const SITE_URL = normalizeSiteUrl(
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://imjangon.co.kr',
);
