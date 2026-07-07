import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { XMLParser } from 'fast-xml-parser';
import { htmlToText } from '@/lib/board/html-text';
import type { KoglType } from '@/lib/board/source-policy';

const ENDPOINT = 'https://apis.data.go.kr/1371000/policyNewsService/policyNewsList';
const FETCH_TIMEOUT_MS = 10_000;
const NUM_OF_ROWS = 100; // 페이지당
const MAX_PAGES = 3;     // firehose 상한(레이턴시·쿼터 통제)
const CACHE_TTL_MS = 30 * 60_000;
const DAY_MS = 86_400_000;
/** API가 startDate~endDate 범위를 최대 3일로 제한(THREE_DAYS_OVER_ERROR) → 3일 청크로 쪼개 조회. */
const CHUNK_DAYS = 3;
/** 최근 며칠치 코퍼스를 훑을지. 최근 이슈 커버가 목적(에버그린은 네이버 경로가 받음). */
const LOOKBACK_DAYS = 30;

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: true, trimValues: true });

export interface KoreaNewsArticle {
  title: string;
  url: string;
  body: string;
  agency: string;
  koglType: KoglType;
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
  OriginalUrl?: unknown;
  DataContents?: unknown;
  KoglType?: unknown;
}

interface ParsedKoreaNewsResponse {
  response?: {
    body?: {
      // 실제 응답은 <body><NewsItem>...(단일 또는 배열). 표준 <items><item>이 아님.
      NewsItem?: RawKoreaNewsItem | RawKoreaNewsItem[];
    };
  };
}

function getItems(parsed: Record<string, unknown>): RawKoreaNewsItem[] {
  const news = (parsed as ParsedKoreaNewsResponse)?.response?.body?.NewsItem;
  if (!news) return [];
  return Array.isArray(news) ? news : [news];
}

/** API의 KoglType 값('1'~'4' 숫자문자열)을 KoglType으로. 그 외/빈값은 unknown. */
function normalizeKogl(v: unknown): KoglType {
  const s = String(v ?? '').trim();
  return s === '1' || s === '2' || s === '3' || s === '4' ? (s as KoglType) : 'unknown';
}

/**
 * 본문에서 언론 제공 사진 블록·캡션을 제거한다.
 * 정책기사 DataContents에는 뉴스통신사 사진과 "(ⓒ뉴스1, 무단 전재-재배포 금지)" 같은
 * 제3자 저작권 캡션이 섞여 있어, 그대로 근거로 쓰면 언론 저작물이 딸려 들어온다.
 */
function stripThirdPartyMedia(rawHtml: string): string {
  return rawHtml
    .replace(/<figure[\s\S]*?<\/figure>/gi, ' ')
    .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, ' ')
    .replace(/<div[^>]*class="[^"]*imageWrap[^"]*"[^>]*>[\s\S]*?<\/div>/gi, ' ');
}

function stripCopyrightLines(text: string): string {
  // "무단 전재"가 들어간 줄은 언론 저작권 고지 캡션의 잔재 → 배제.
  return text
    .split('\n')
    .filter((line) => !/무단\s*전재/.test(line))
    .join('\n');
}

function toArticle(item: RawKoreaNewsItem): KoreaNewsArticle | null {
  const title = String(item.Title ?? '').trim();
  const url = String(item.OriginalUrl ?? '').trim();
  const koglType = normalizeKogl(item.KoglType);
  const cleanedHtml = stripThirdPartyMedia(String(item.DataContents ?? ''));
  const body = stripCopyrightLines(htmlToText(cleanedHtml)).trim();
  if (!title || !url || !body) return null;
  return { title, url, body, agency: '정책브리핑', koglType };
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

/** 단일 날짜창(YYYYMMDD, ≤3일)으로 정책뉴스 조회. 키 없음/오류 시 [](graceful). 윈도우 단위 캐시. */
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
  // 빈/실패 윈도우는 캐시하지 않는다(403·일시 오류가 TTL 동안 고착되는 것 방지).
  if (out.length > 0) cache.set(cacheKey, { at: Date.now(), articles: out });
  return out;
}

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

/** 최근 LOOKBACK_DAYS를 3일 청크로 나눈 [start,end] 목록(비중첩). */
function chunkWindows(today: Date): Array<[string, string]> {
  const windows: Array<[string, string]> = [];
  for (let offset = 0; offset < LOOKBACK_DAYS; offset += CHUNK_DAYS) {
    const end = new Date(today.getTime() - offset * DAY_MS);
    const start = new Date(end.getTime() - (CHUNK_DAYS - 1) * DAY_MS);
    windows.push([ymd(start), ymd(end)]);
  }
  return windows;
}

/** 주제 → 최근 30일 정책뉴스(3일 청크 합집합)에서 상위 매칭 기사(본문 포함). */
export async function collectKoreaNews(topic: string, today: Date, deps: KoreaNewsDeps = {}): Promise<KoreaNewsArticle[]> {
  if (tokenize(topic).length === 0) return []; // 빈 주제면 API 호출 스킵
  const windows = chunkWindows(today);
  const batches = await Promise.all(windows.map(([start, end]) => fetchWindow(start, end, deps)));
  const seen = new Set<string>();
  const articles = batches.flat().filter((a) => !seen.has(a.url) && seen.add(a.url));
  logger.info({ topic, windows: windows.length, corpus: articles.length }, 'korea-news: corpus collected');
  return matchArticles(articles, topic, MATCH_LIMIT);
}
