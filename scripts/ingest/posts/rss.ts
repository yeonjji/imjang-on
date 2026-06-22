import { XMLParser } from 'fast-xml-parser';
import { logger } from '@/lib/logger';

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });
const TIMEOUT_MS = 15_000;

export interface FeedItem {
  /** 제목의 `[기관명]` 접두어에서 추출. 없으면 null. */
  agency: string | null;
  /** 접두어를 제거한 본문 제목. */
  title: string;
  /** 보도자료 원문 링크(sourceUrl). */
  link: string;
  /** 발표일(sourceDate). 파싱 실패 시 null. */
  pubDate: Date | null;
  /** description HTML에서 태그·엔티티를 제거한 평문(sourceText). */
  bodyText: string;
}

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ',
  middot: '·', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘',
  rsquo: '’', ldquo: '“', rdquo: '”', deg: '°', times: '×',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
}

/** description 등 HTML 조각 → 평문. 블록 태그는 줄바꿈으로, 공백 정리. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(withBreaks)
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** 제목 선행 `[기관명]` 분리. 접두어 없으면 agency=null, title=원본. */
export function splitAgencyPrefix(rawTitle: string): { agency: string | null; title: string } {
  const t = decodeEntities(rawTitle).trim();
  const m = t.match(/^\[([^\]]{1,30})\]\s*(.+)$/s);
  if (m) return { agency: m[1].trim(), title: m[2].trim() };
  return { agency: null, title: t };
}

function pickText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  // fast-xml-parser가 CDATA만 있는 노드를 객체로 줄 때 대비
  if (typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)['#text'] ?? '');
  }
  return '';
}

function parseDate(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** RSS 2.0 XML 문자열 → FeedItem[]. (fetch와 분리해 순수 테스트 가능) */
export function parseRssItems(xml: string): FeedItem[] {
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const channel = (parsed as any)?.rss?.channel;
  if (!channel) return [];
  const raw = channel.item;
  if (!raw) return [];
  const items: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw];

  return items.map((it) => {
    const { agency, title } = splitAgencyPrefix(pickText(it.title));
    return {
      agency,
      title,
      link: pickText(it.link).trim(),
      pubDate: parseDate(pickText(it.pubDate) || pickText(it['dc:date'])),
      bodyText: htmlToText(pickText(it.description)),
    };
  });
}

async function fetchOnce(url: string): Promise<FeedItem[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'imjang-on/1.0 (+https://imjang-on.com)', Accept: 'application/rss+xml,application/xml,text/xml' },
    });
    if (!res.ok) throw new Error(`RSS HTTP ${res.status} for ${url}`);
    return parseRssItems(await res.text());
  } finally {
    clearTimeout(t);
  }
}

/** RSS URL을 받아 fetch + 파싱. 타임아웃/네트워크 오류는 1회 재시도. */
export async function fetchFeed(url: string): Promise<FeedItem[]> {
  try {
    return await fetchOnce(url);
  } catch (firstErr) {
    logger.warn({ err: firstErr, url }, 'fetchFeed failed, retrying once');
    try {
      return await fetchOnce(url);
    } catch (err) {
      logger.warn({ err, url }, 'fetchFeed failed');
      throw err;
    }
  }
}
