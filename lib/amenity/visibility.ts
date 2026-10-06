/**
 * 상권·편의(/amenity — 편의점·마트·카페·전통시장) 노출 여부.
 *
 * (2026-10-06: AdSense 심사 중 저가치 페이지 축소(D1) — 코드·DB는 그대로 두고 노출만 끈다.
 *  다시 열려면 true로 되돌리면 된다.)
 * false면 middleware가 /amenity/** 를 404로 돌리고(ISR 캐시보다 앞단), 생활편의 메뉴·푸터·
 * 홈 아이콘·사이트맵에서 빠지며, 상세 '주변 생활 인프라'의 편의·마트/카페/전통시장 블록도 숨긴다.
 * 복구 시 함께: next.config.mjs의 주석 처리된 /amenity 리다이렉트 4개 해제.
 */
export function isAmenityPublic(): boolean {
  return false;
}
