/**
 * 출처명(sourceName) 정제·정규화.
 *
 * `Post.sourceName`은 RSS 제목 접두어·LLM 서술·수동 입력이 뒤섞여, 크롤 네비 텍스트가
 * 붙거나('…부처별 뉴스 이동') 장황한 서술형('한국주택금융공사(HF) 디딤돌대출 상품소개·금리안내')
 * 이거나 raw host('www.sejong.go.kr')로 저장된 값이 있다.
 *
 * - {@link sanitizeSourceName}: 크롤 찌꺼기만 제거(비손실). ETL 저장 직전에 적용해 오염 유입 차단.
 * - {@link canonicalizeSourceName}: 정제 + 정식 기관명으로 축약(표시용). 목록·레일·상세 등 화면 표시 지점에 적용.
 */

/** 기관명 뒤에 붙는 크롤 네비게이션 텍스트(공백 없이 붙는 경우가 많다). */
const JUNK_FRAGMENTS = ['부처별 뉴스 이동', '본문 바로가기', '출처 이동', '뉴스 이동'];

/** 정식 기관명 매핑: raw에 패턴이 있으면 정식명으로 축약. 위에서부터 우선(임장ON 자체집계 → 청약홈보다 먼저). */
const CANONICAL: Array<[RegExp, string]> = [
  [/임장ON/, '임장ON 청약 집계'],
  [/정책브리핑|korea\.kr/i, '정책브리핑'],
  [/국토교통부/, '국토교통부'],
  [/한국주택금융공사|주택금융공사|\bHF\b/, '한국주택금융공사'],
  [/청약홈/, '청약홈'],
  [/한국토지주택공사|\bLH\b/, 'LH'],
  [/한국은행/, '한국은행'],
  [/한국부동산원/, '한국부동산원'],
  [/주택도시보증공사|\bHUG\b|HOUSTA/i, '주택도시보증공사'],
  [/주택도시기금/, '주택도시기금'],
  [/금융위원회/, '금융위원회'],
  [/국가법령정보센터|법제처/, '국가법령정보센터'],
  [/국가통계포털|kosis/i, '국가통계포털'],
  [/국토연구원/, '국토연구원'],
  [/한국개발연구원|\bKDI\b/, '한국개발연구원'],
  [/보건복지부/, '보건복지부'],
];

/** 크롤 네비 찌꺼기 제거 + 공백 정리(비손실). */
export function sanitizeSourceName(raw: string): string {
  let s = (raw ?? '').trim();
  for (const j of JUNK_FRAGMENTS) s = s.split(j).join(' ');
  return s.replace(/\s{2,}/g, ' ').trim();
}

/** 정제 + 정식 기관명 축약. 매핑 없으면: raw host는 스킴·www 제거, 그 외는 정제값 유지. */
export function canonicalizeSourceName(raw: string): string {
  const s = sanitizeSourceName(raw);
  if (!s) return s;
  for (const [re, name] of CANONICAL) if (re.test(s)) return name;
  // 매핑 없는 raw host(www.xxx.go.kr, https://…) → 읽기 쉽게 스킴·www 제거.
  if (/^(https?:\/\/)?(www\.)?[\w-]+\.[\w.-]+/i.test(s) && !/\s/.test(s)) {
    return s.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  }
  return s;
}
