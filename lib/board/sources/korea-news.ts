import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { XMLParser } from 'fast-xml-parser';
import { htmlToText } from '@/lib/board/html-text';

const ENDPOINT = 'https://apis.data.go.kr/1371000/policyNewsService/policyNewsList';
const FETCH_TIMEOUT_MS = 10_000;
const NUM_OF_ROWS = 100; // 페이지당
const MAX_PAGES = 5;     // firehose 상한(레이턴시·쿼터 통제)
const CACHE_TTL_MS = 30 * 60_000;

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: true, trimValues: true });

export interface KoreaNewsArticle {
  title: string;
  url: string;
  body: string;
  agency: string;
}

export interface KoreaNewsDeps {
  fetchImpl?: typeof fetch;
  serviceKey?: string;
}

interface CacheEntry { at: number; articles: KoreaNewsArticle[] }
const cache = new Map<string, CacheEntry>();

export function _resetKoreaNewsCache(): void {
  cache.clear();
}

interface RawKoreaNewsItem {
  Title?: unknown;
  title?: unknown;
  OriginalUrl?: unknown;
  originalUrl?: unknown;
  DataContents?: unknown;
  dataContents?: unknown;
}

interface ParsedKoreaNewsResponse {
  response?: {
    body?: {
      items?: '' | { item?: RawKoreaNewsItem | RawKoreaNewsItem[] };
    };
  };
}

function getItems(parsed: Record<string, unknown>): RawKoreaNewsItem[] {
  const items = (parsed as ParsedKoreaNewsResponse)?.response?.body?.items;
  if (!items) return [];
  const item = items.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

/** 실측 필드명(Task 0에서 확정). 다르면 이 접근자만 교정. */
function toArticle(item: RawKoreaNewsItem): KoreaNewsArticle | null {
  const title = String(item.Title ?? item.title ?? '').trim();
  const url = String(item.OriginalUrl ?? item.originalUrl ?? '').trim();
  const rawBody = String(item.DataContents ?? item.dataContents ?? '');
  const body = htmlToText(rawBody).trim();
  if (!title || !url || !body) return null;
  return { title, url, body, agency: '정책브리핑' };
}

async function fetchOnePage(url: string, doFetch: typeof fetch): Promise<KoreaNewsArticle[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await doFetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'imjang-on/1.0 (+https://imjang-on.com)', Accept: 'application/xml,text/xml' },
    });
    if (!res.ok) return [];
    const parsed = parser.parse(await res.text()) as Record<string, unknown>;
    return getItems(parsed).map(toArticle).filter((a): a is KoreaNewsArticle => a !== null);
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

/** 날짜창(YYYYMMDD)으로 정책뉴스 코퍼스 수집. 키 없음/오류 시 [](graceful). 윈도우 단위 캐시. */
export async function fetchWindow(startDate: string, endDate: string, deps: KoreaNewsDeps = {}): Promise<KoreaNewsArticle[]> {
  const serviceKey = deps.serviceKey ?? env.PUBLIC_DATA_KEY;
  if (!serviceKey) return [];

  const cacheKey = `${startDate}|${endDate}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.articles;

  const doFetch = deps.fetchImpl ?? fetch;
  const out: KoreaNewsArticle[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(ENDPOINT);
    url.searchParams.set('serviceKey', serviceKey);
    url.searchParams.set('startDate', startDate);
    url.searchParams.set('endDate', endDate);
    url.searchParams.set('pageNo', String(page));
    url.searchParams.set('numOfRows', String(NUM_OF_ROWS));
    const items = await fetchOnePage(url.toString(), doFetch);
    if (items.length === 0) break;
    out.push(...items);
    if (items.length < NUM_OF_ROWS) break;
  }
  logger.info({ startDate, endDate, count: out.length }, 'korea-news: window fetched');
  cache.set(cacheKey, { at: Date.now(), articles: out });
  return out;
}

const WINDOW_DAYS = 90;
const MATCH_LIMIT = 3;
const MIN_SCORE = 3; // 제목 토큰 1개 또는 본문 토큰 3개 이상
const TITLE_WEIGHT = 3;
const BODY_WEIGHT = 1;

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^0-9a-z가-힣]+/i)
    .filter((t) => t.length >= 2);
}

export function scoreArticle(article: KoreaNewsArticle, tokens: string[]): number {
  const title = article.title.toLowerCase();
  const body = article.body.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (title.includes(t)) score += TITLE_WEIGHT;
    if (body.includes(t)) score += BODY_WEIGHT;
  }
  return score;
}

export function matchArticles(articles: KoreaNewsArticle[], topic: string, limit: number): KoreaNewsArticle[] {
  const tokens = tokenize(topic);
  if (tokens.length === 0) return [];
  return articles
    .map((a) => ({ a, s: scoreArticle(a, tokens) }))
    .filter((x) => x.s >= MIN_SCORE)
    .sort((x, y) => y.s - x.s)
    .slice(0, limit)
    .map((x) => x.a);
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** 주제 → 최근 90일 정책뉴스에서 상위 매칭 기사(본문 포함). */
export async function collectKoreaNews(topic: string, today: Date, deps: KoreaNewsDeps = {}): Promise<KoreaNewsArticle[]> {
  const start = new Date(today.getTime() - WINDOW_DAYS * 86_400_000);
  const articles = await fetchWindow(ymd(start), ymd(today), deps);
  return matchArticles(articles, topic, MATCH_LIMIT);
}
