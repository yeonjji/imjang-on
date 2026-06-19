/**
 * 보드 생성 후보의 공통 형태. 출처 종류(보도자료 RSS / FIRST_PARTY 우리 DB 집계)에 무관하게
 * 동일 파이프라인(dedupe→랭킹→생성→가드레일)을 타도록 통일한다.
 */
export interface BoardCandidate {
  /** 출처 식별자: 'korea' | 'bok' | 'fp:subscription' 등. detectedFrom 폴백·로깅용. */
  sourceKey: string;
  /** Post.sourceName (예: '국토교통부', '임장ON 청약 집계(원자료: 청약홈·LH)'). */
  agency: string;
  /** 랭킹/제목 힌트. 최종 제목은 LLM이 생성. */
  title: string;
  /** Post.sourceUrl. */
  link: string;
  /** Post.sourceDate. */
  pubDate: Date | null;
  /** 생성 입력 sourceText(= Post.sourceExcerpt 근거). */
  bodyText: string;
  /** 중복 방지 키. */
  dedupeKey: string;
}
