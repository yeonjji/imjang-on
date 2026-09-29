import { logger } from '@/lib/logger';

/**
 * 조회 하나가 실패해도 페이지 전체를 죽이지 않는다.
 *
 * 상세 페이지는 13개 조회를 한 Promise.all에 묶는다. 그중 하나가 rejected 되면 페이지가
 * throw되어 500이 나가는데, 사용자가 보는 건 "섹션 하나가 비었다"가 아니라 "페이지가 죽었다"다.
 * 크롤러에게도 마찬가지다.
 *
 * fallback을 돌려주되 **반드시 로그를 남긴다.** 조용히 삼키면 근본 원인을 추적할 수 없다.
 */
export async function safe<T>(p: Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await p;
  } catch (err) {
    logger.error({ err, label }, 'detail page query failed, using fallback');
    return fallback;
  }
}
