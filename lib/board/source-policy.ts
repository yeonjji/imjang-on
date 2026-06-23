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

/**
 * 페이지 HTML에서 공공누리 유형(1~4)을 탐지. 마커가 없으면(불명) 'unknown',
 * 서로 다른 유형이 2개 이상 섞여 있으면(상충) 보수적으로 'unknown'을 반환한다.
 * (unknown은 근거에서 배제 — isUsableLicense=false)
 *
 * 느슨한 매칭으로 CSS/JS 파일명의 stray 'type1' 토큰이 제1유형으로 오인되지 않도록,
 * 텍스트 마커("제N유형"/"유형 N")와 배지 이미지 파일명(opentypeNN.png 등)·kogl-typeN만 인정한다.
 */
export function detectKoglType(html: string): KoglType {
  if (!KOGL_HINT.test(html)) return 'unknown';
  const found = new Set<KoglType>();
  for (const t of ['1', '2', '3', '4'] as const) {
    const re = new RegExp(
      `제\\s*${t}\\s*유형|유형\\s*${t}(?![0-9])|opentype0?${t}\\.(?:png|gif|jpe?g|svg)|kogl[-_]?type0?${t}(?![0-9])`,
      'i',
    );
    if (re.test(html)) found.add(t);
  }
  return found.size === 1 ? [...found][0] : 'unknown';
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
