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

/** n.news.naver.com 기사 본문 추출. dic_area 안의 텍스트를 평문으로 반환. */
async function fetchArticleBody(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'imjang-on/1.0 (+https://imjang-on.com)' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const idx = html.indexOf('id="dic_area"');
    if (idx === -1) return null;
    const bodyStart = html.indexOf('>', idx) + 1;
    const text = htmlToText(html.slice(bodyStart, bodyStart + 6000));
    return text.length >= MIN_SOURCE_CHARS ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * 네이버 뉴스 API로 부처별 최신 뉴스를 검색하고, n.news.naver.com 본문을
 * 원문 소스로 사용하는 후보를 반환한다.
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

      // 본문 fetch는 n.news.naver.com만 지원 (구조 일관성 보장)
      if (!item.link.includes('n.news.naver.com')) continue;

      const title = htmlToText(item.title);
      const bodyText = await fetchArticleBody(item.link);
      if (!bodyText) continue;

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
