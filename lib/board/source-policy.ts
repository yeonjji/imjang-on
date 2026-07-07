export type KoglType = '1' | '2' | '3' | '4' | 'unknown';

/**
 * 본문 추출을 허용하는 공공 도메인. **'자유이용 보증'이 아니라 '뉴스 배제용 1차 필터'.**
 * .or.kr은 민간 협회·재단도 쓰므로 와일드카드 금지 — 검증된 공공기관 호스트만 개별 등재.
 */
const OR_KR_ALLOWLIST = new Set<string>([
  'bok.or.kr', 'www.bok.or.kr',        // 한국은행
  'reb.or.kr', 'www.reb.or.kr',        // 한국부동산원
  'khug.or.kr', 'www.khug.or.kr',      // 주택도시보증공사(HUG)
]);

/**
 * .re.kr 도메인 중 검증된 공공 연구기관만 개별 등재.
 */
const RE_KR_ALLOWLIST = new Set<string>([
  'krihs.re.kr', 'www.krihs.re.kr',    // 국토연구원
  'kdi.re.kr', 'www.kdi.re.kr',        // 한국개발연구원(KDI)
]);

/**
 * .kr 도메인 중 검증된 공공기관.
 */
const KR_ALLOWLIST = new Set<string>([
  'kosis.kr', 'www.kosis.kr',          // 통계청 국가통계포털
]);

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
  if (RE_KR_ALLOWLIST.has(host)) return true;
  if (KR_ALLOWLIST.has(host)) return true;
  return false;
}

const KOGL_HINT = /공공누리|kogl/i;

/**
 * 페이지 HTML에서 공공누리 유형(1~4)을 탐지.
 * - 공공누리 마커가 없으면 'unknown'.
 * - 명시적 제한 유형(제2·3·4유형)이 하나라도 있으면 가장 제한적인 유형을 반환(→ 이용 배제 대상).
 * - 제1유형만 있으면 '1'.
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
  // 제한 유형(2·3·4)이 하나라도 있으면 가장 제한적인 것을 반환(상업·변형 불가 → 배제).
  if (found.has('4')) return '4';
  if (found.has('3')) return '3';
  if (found.has('2')) return '2';
  return found.has('1') ? '1' : 'unknown';
}

/**
 * 우리 이용 형태(상업·변형) 기준 사용 가능 여부.
 * 제1유형 또는 마커 없음(unknown)은 사용 가능, 제2·3·4유형(상업금지/변경금지)은 배제.
 * unknown 허용 근거: 저작권법 제24조의2(공공저작물 자유이용) — 공공누리 배지가 없어도
 * 국가·지자체·공공기관이 업무상 작성·공표한 저작물은 자유 이용 가능. 신뢰 기준은
 * 엄선된 공식 도메인 allowlist + 뉴스 본문 비복제 + 사람 검수. 명시적 제한 표시만 존중해 배제.
 */
export function isUsableLicense(type: KoglType): boolean {
  return type === '1' || type === 'unknown';
}

/** 표시용 라벨. unknown은 공공누리 표시가 없는 공공저작물(자유이용 근거: 저작권법 제24조의2). */
export function licenseLabel(type: KoglType): string {
  return type === 'unknown' ? '공공저작물(공공누리 표시 없음)' : `공공누리 제${type}유형`;
}

const DOMAIN_LABEL: Record<string, string> = {
  'korea.kr': '정책브리핑',
  'www.korea.kr': '정책브리핑',
  'bok.or.kr': '한국은행',
  'www.bok.or.kr': '한국은행',
  'kosis.kr': '국가통계포털',
  'www.kosis.kr': '국가통계포털',
  'reb.or.kr': '한국부동산원',
  'www.reb.or.kr': '한국부동산원',
  'khug.or.kr': '주택도시보증공사',
  'www.khug.or.kr': '주택도시보증공사',
  'krihs.re.kr': '국토연구원',
  'www.krihs.re.kr': '국토연구원',
  'kdi.re.kr': '한국개발연구원',
  'www.kdi.re.kr': '한국개발연구원',
};

export function domainLabel(host: string): string {
  return DOMAIN_LABEL[host] ?? host;
}
