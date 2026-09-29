/**
 * 공개 게시판(/board) 노출 여부.
 *
 * (2026-06-18: `NEXT_PUBLIC_BOARD_ENABLED` 토글 제거 — env 스위치 없이 전체 공개.)
 * (2026-09-29: AdSense 6차 신청 동안 비공개 — AI 생성 글이 '질' 거절 요인인지 분리 검증.
 *  글·DB는 그대로 두고 노출만 끈다. 다시 열려면 true로 되돌리면 된다.)
 * 내비 메뉴·홈/상세 브리핑 섹션·`/board`·`/board/[id]`(+thumbnail)·사이트맵·robots 모두
 * 이 함수로 공개 여부를 본다. false면 페이지는 404, 링크·사이트맵에서 전부 빠진다.
 */
export function isBoardPublic(): boolean {
  return false;
}

/**
 * 관리자 미리보기: `?preview=<BOARD_PREVIEW_TOKEN>` 가 일치하면 공개 OFF여도 렌더 허용.
 * 토큰 미설정이면 항상 false(미리보기 비활성). 토큰은 서버 전용(비공개).
 */
export function isBoardPreview(token: string | undefined): boolean {
  const secret = process.env.BOARD_PREVIEW_TOKEN;
  return !!secret && !!token && token === secret;
}

/** 공개(toggle) 또는 관리자 미리보기(token)면 게시판 페이지 렌더 허용. */
export function canViewBoard(previewToken?: string): boolean {
  return isBoardPublic() || isBoardPreview(previewToken);
}
