/**
 * 공개 게시판(/board) 노출 여부. 게시판은 상시 공개한다.
 *
 * (2026-06-18: `NEXT_PUBLIC_BOARD_ENABLED` 토글 제거 — env 스위치 없이 전체 공개.)
 * 내비 메뉴·`/board`·`/board/[slug]`·사이트맵·robots 모두 이 함수로 공개 여부를 본다.
 */
export function isBoardPublic(): boolean {
  return true;
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
