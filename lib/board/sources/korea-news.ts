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
