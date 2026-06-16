/**
 * 공식 보도자료 피드 레지스트리(SSOT). 새 소스는 한 줄 추가.
 * 라이브 검증된 RSS만 등록(2026-06-16). 확장 후보·제약은 플랜 3b 문서 참고.
 */
export interface BoardFeed {
  key: string;
  label: string;
  rssUrl: string;
  /** 아이템 제목에 `[기관]` 접두어가 없을 때 채울 기본 기관명. 전부처 허브(korea.kr)는 null. */
  defaultAgency: string | null;
}

export const BOARD_FEEDS: BoardFeed[] = [
  {
    key: 'korea',
    label: '정책브리핑(전부처)',
    rssUrl: 'https://www.korea.kr/rss/pressrelease.xml',
    defaultAgency: null, // 제목 `[부처명]` 접두어로 기관 식별
  },
  {
    key: 'bok',
    label: '한국은행',
    rssUrl: 'https://www.bok.or.kr/portal/bbs/B0000552/news.rss?menuNo=200690',
    defaultAgency: '한국은행',
  },
];
