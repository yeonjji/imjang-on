/**
 * 공공데이터(data.go.kr 등)가 텍스트를 HTML 엔티티로 인코딩해 내려주는 경우가 있다
 * (예: '<주>세븐' → '&lt;주&gt;세븐', '원(리)금' → '원&#40;리&#41;금', 'A&B' → 'A&amp;B').
 * 표시·저장 전에 한 번 디코딩한다. 엔티티가 없는 문자열은 그대로 반환하므로 안전하다.
 *
 * `&amp;`를 마지막에 치환해 단일 인코딩(`&lt;`)은 풀되, 의도치 않은 과디코딩은 피한다.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
