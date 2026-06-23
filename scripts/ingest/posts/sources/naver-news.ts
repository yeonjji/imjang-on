import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { BoardCandidate } from '../candidate';
import { dedupeKey } from '../keys';
import { isRelevant, MIN_SOURCE_CHARS } from '../relevance';
import { htmlToText } from '../rss';

const NAVER_SEARCH_URL = 'https://openapi.naver.com/v1/search/news.json';
const TIMEOUT_MS = 10_000;

/**
 * 부처별 검색 쿼리. 각 쿼리의 agency는 AGENCY_WHITELIST 멤버여야 한다.
 * 실제 기사 내 키워드 체크(isRelevant)로 교통·기타 무관 뉴스를 2차 필터.
 */
const QUERIES: { q: string; agency: string }[] = [
  { q: '국토교통부 부동산 주택 정책', agency: '국토교통부' },
  { q: '금융위원회 주택담보대출 가계대출', agency: '금융위원회' },
  { q: '국토교통부 청약 분양 공고', agency: '국토교통부' },
  { q: '한국은행 기준금리 주택담보', agency: '한국은행' },
];

interface NaverItem {
  title: string;
  link: string;
  originallink: string;
  description: string;
  pubDate: string;
}

async function searchNews(q: string, clientId: string, secret: string): Promise<NaverItem[]> {
  const url = new URL(NAVER_SEARCH_URL);
  url.searchParams.set('query', q);
  url.searchParams.set('display', '5');
  url.searchParams.set('sort', 'date');

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: ctrl.signal,
      headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': secret },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: NaverItem[] };
    return json.items ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

/**
 * 네이버 뉴스 API로 부처별 최신 뉴스를 검색한다.
 * API가 제공하는 description(요약 스니펫)만 사용하며, 언론사 기사 본문은 수집하지 않는다.
 * description이 MIN_SOURCE_CHARS 미만인 경우(대부분) 후보에서 제외된다.
 * 자격증명 미설정 시 빈 배열 반환(graceful).
 */
export async function collectNaverNewsCandidates(): Promise<BoardCandidate[]> {
  const clientId = env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = env.NAVER_SEARCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  const seen = new Set<string>();
  const candidates: BoardCandidate[] = [];

  for (const { q, agency } of QUERIES) {
    const items = await searchNews(q, clientId, clientSecret);
    for (const item of items) {
      const sourceUrl = item.originallink || item.link;
      if (seen.has(sourceUrl)) continue;
      seen.add(sourceUrl);

      const title = htmlToText(item.title);
      const bodyText = htmlToText(item.description);

      // API 스니펫은 대부분 MIN_SOURCE_CHARS 미만 — 생성 불가로 사전 제외
      if (bodyText.length < MIN_SOURCE_CHARS) continue;
      if (!isRelevant({ agency, title, bodyText })) continue;

      candidates.push({
        sourceKey: 'naver-news',
        agency,
        title,
        link: sourceUrl,
        pubDate: new Date(item.pubDate),
        bodyText,
        dedupeKey: dedupeKey(sourceUrl),
      });
    }
  }

  logger.info({ candidates: candidates.length }, 'naver news candidates collected');
  return candidates;
}
