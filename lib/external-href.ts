/**
 * DB의 homepage 값이 프로토콜 없이 저장된 경우(예: "cafe.daum.net/starlight7053")
 * <a href>에 그대로 넣으면 크롤러가 상대경로로 해석해
 * /childcare/{code}/cafe.daum.net/starlight7053 같은 존재하지 않는 URL(404)을 만든다.
 * 스킴을 보정해 항상 절대 외부 링크로 만든다.
 */
export function externalHref(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

/**
 * 값이 실제로 링크할 수 있는 주소인지. 공공 API의 '사이트' 필드에는 URL이 아니라
 * 안내 문구가 들어오는 경우가 있다(예: LoanProduct.rawJson.rltsite = "취급은행 홈페이지").
 * 그대로 {@link externalHref}에 넣으면 `https://취급은행 홈페이지` → 브라우저가 호스트를
 * punycode로 바꿔 `https://xn--%20-fc9lt22h9ia15l9wktkn5veemc/` 같은 존재하지 않는 링크가 된다.
 * 링크로 만들지 말지 판단할 때 쓴다(false면 문구로만 표시).
 */
export function isLinkableUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  // http(s)가 아닌 스킴(mailto:, tel:, javascript: …)은 externalHref가 https를 덧붙이면
  // `https://mailto:a@b.co.kr`처럼 엉뚱한 호스트로 파싱된다. 덧붙이기 전에 걸러낸다.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return false;
  let parsed: URL;
  try {
    parsed = new URL(externalHref(trimmed));
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  // 호스트는 점을 포함한 ASCII 도메인이어야 한다. 경로·쿼리의 한글은 무관하다
  // (예: https://www.law.go.kr/법령/종합부동산세법 은 정상 링크).
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(parsed.hostname)) return false;
  // 원문에 없던 xn--가 생겼다면 비ASCII 호스트가 punycode로 변환된 것 → 링크 불가.
  return !(parsed.hostname.includes('xn--') && !trimmed.toLowerCase().includes('xn--'));
}
