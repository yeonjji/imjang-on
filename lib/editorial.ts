import { SITE_URL } from '@/lib/site';

/**
 * 사이트의 단일 편집·운영 주체(1인 운영자). E-E-A-T의 "누가 만들었는가" 신호로
 * board 바이라인·JSON-LD author·/about에 일관되게 사용한다. (AdSense P0-B)
 *
 * 포스트마다 다른 작성자를 두지 않는다 — 실제로 1인이 운영하므로 단일 신원이 정직하다.
 */
export const EDITORIAL = {
  /** 공개 표기명(필명/핸들) */
  name: '임장ON 편집자',
  /** 역할 */
  role: '공공데이터 수집·정제 운영자',
  /** 프로필 앵커(소개 페이지) */
  url: `${SITE_URL}/about`,
  /** 연락 */
  email: 'contact@imjangon.co.kr',
} as const;
