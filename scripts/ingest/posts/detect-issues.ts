import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * 네이버 뉴스 검색 = 화제성 신호 전용(본문 사실엔 절대 사용 안 함, 설계 4대 원칙).
 * 후보 보도자료 제목으로 최근 뉴스 건수를 조회해 랭킹 점수로 쓴다.
 * 자격증명 없거나 실패 시 null 반환 → 호출부가 최신순 폴백(파이프라인 안 멈춤, graceful).
 */
const NAVER_NEWS_URL = 'https://openapi.naver.com/v1/search/news.json';
const TIMEOUT_MS = 8_000;

export interface NewsSearchDeps {
  fetchImpl?: typeof fetch;
  clientId?: string;
  clientSecret?: string;
}

/** query에 대한 네이버 뉴스 검색 총건수. 사용 불가/오류 시 null. */
export async function naverNewsCount(query: string, deps: NewsSearchDeps = {}): Promise<number | null> {
  const clientId = deps.clientId ?? env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = deps.clientSecret ?? env.NAVER_SEARCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const doFetch = deps.fetchImpl ?? fetch;

  const url = new URL(NAVER_NEWS_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('display', '1'); // total만 필요
  url.searchParams.set('sort', 'date');

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await doFetch(url.toString(), {
      signal: ctrl.signal,
      headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
    });
    if (!res.ok) {
      logger.warn({ status: res.status, query }, 'naver news search non-OK');
      return null;
    }
    const json = (await res.json()) as { total?: number };
    return typeof json.total === 'number' ? json.total : null;
  } catch (err) {
    logger.warn({ err, query }, 'naver news search failed');
    return null;
  } finally {
    clearTimeout(t);
  }
}
