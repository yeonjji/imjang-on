/**
 * 공개 게시판(/board) 노출 여부. 콘텐츠가 충분히 쌓일 때까지 기본 비공개.
 *
 * 공개 전환: 환경변수 `NEXT_PUBLIC_BOARD_ENABLED=true` 설정 후 재배포.
 * 비공개일 때: 내비 메뉴 숨김 + `/board`·`/board/[slug]` 404 + 사이트맵/robots 제외.
 * 어드민(`/admin/posts`)은 이 플래그와 무관하게 항상 동작 — 숨긴 채로 초안 생성·검수·게시 가능.
 *
 * (server/client 공용: NEXT_PUBLIC_ 변수는 빌드 시 인라인되므로 lib/env.ts 대신 raw 접근.)
 */
export function isBoardPublic(): boolean {
  return process.env.NEXT_PUBLIC_BOARD_ENABLED === 'true';
}
