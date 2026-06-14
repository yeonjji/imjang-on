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
