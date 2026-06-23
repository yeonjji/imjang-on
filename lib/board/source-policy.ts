export type KoglType = '1' | '2' | '3' | '4' | 'unknown';

/**
 * 본문 추출을 허용하는 공공 도메인. **'자유이용 보증'이 아니라 '뉴스 배제용 1차 필터'.**
 * .or.kr은 민간 협회·재단도 쓰므로 와일드카드 금지 — 검증된 공공기관 호스트만 개별 등재.
 */
const OR_KR_ALLOWLIST = new Set<string>(['bok.or.kr', 'www.bok.or.kr']);

export function isAllowedDomain(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).host.toLowerCase();
  } catch {
    return false;
  }
  if (host === 'korea.kr' || host === 'www.korea.kr') return true;
  if (host === 'go.kr' || host.endsWith('.go.kr')) return true;
  if (OR_KR_ALLOWLIST.has(host)) return true;
  return false;
}

const KOGL_HINT = /공공누리|kogl/i;

/** 페이지 HTML에서 공공누리 유형(1~4)을 탐지. 마커/유형 불명이면 'unknown'. */
export function detectKoglType(html: string): KoglType {
  if (!KOGL_HINT.test(html)) return 'unknown';
  for (const t of ['1', '2', '3', '4'] as const) {
    const re = new RegExp(`제\\s*${t}\\s*유형|유형\\s*${t}|opentype0?${t}|type0?${t}`, 'i');
    if (re.test(html)) return t;
  }
  return 'unknown';
}

/** 우리는 상업·변형 이용을 하므로 제1유형만 사용 가능. 그 외/unknown은 배제(보수적). */
export function isUsableLicense(type: KoglType): boolean {
  return type === '1';
}

const DOMAIN_LABEL: Record<string, string> = {
  'korea.kr': '정책브리핑',
  'www.korea.kr': '정책브리핑',
  'bok.or.kr': '한국은행',
  'www.bok.or.kr': '한국은행',
};

export function domainLabel(host: string): string {
  return DOMAIN_LABEL[host] ?? host;
}
