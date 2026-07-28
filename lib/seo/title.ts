/**
 * 시설 상세 제목을 조립한다. 제목 조립의 유일한 지점.
 *
 * qualifier가 비어 있으면 접미사 없이 기존과 동일한 문자열을 낸다 —
 * 지역 해석 실패가 제목 회귀를 만들지 않는다.
 * tail은 자체 구분자를 포함한다('— 약국 정보·주변 아파트', '한도·금리 — 주거금융').
 * 라우트마다 꼬리 모양이 달라 구분자를 강제하지 않는다.
 */
export function qualifiedTitle(name: string, qualifier: string | null, tail: string): string {
  return qualifier ? `${name} (${qualifier}) ${tail}` : `${name} ${tail}`;
}
