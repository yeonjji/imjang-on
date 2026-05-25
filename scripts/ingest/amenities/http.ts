// scripts/ingest/amenities/http.ts
import { logger } from '@/lib/logger';

// 9999 row XML 응답은 20초로 부족 → 60초로 상향
const TIMEOUT_MS = 60_000;
const SLEEP_MS = 250;
const MAX_RETRIES = 5;
// rate limit(429) 전용 큰 backoff — 일반 retry보다 훨씬 길게
const RATE_LIMIT_BACKOFF_MS = 5_000;

export async function fetchAmenityPage(
  baseUrl: string,
  params: Record<string, string | number>,
): Promise<string> {
  const url = new URL(baseUrl);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  let attempt = 0;
  while (true) {
    attempt++;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'imjang-on/1.0 (+https://imjang-on.com)',
          Accept: 'application/xml,text/xml,application/json',
        },
      });
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          const backoff =
            res.status === 429
              ? RATE_LIMIT_BACKOFF_MS * Math.pow(2, attempt - 1)
              : SLEEP_MS * Math.pow(3, attempt);
          logger.warn({ status: res.status, attempt, backoff }, 'amenity http retry');
          await sleep(backoff);
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${baseUrl}`);
      }
      await sleep(SLEEP_MS);
      return await res.text();
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const backoff = SLEEP_MS * Math.pow(3, attempt);
        logger.warn({ err, attempt, backoff }, 'amenity http error retry');
        await sleep(backoff);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(t);
    }
  }
}

const MAX_PAGES = 1000;

export async function fetchAllPages<T>(
  fetcher: (pageNo: number) => Promise<{ items: T[]; totalCount: number }>,
): Promise<T[]> {
  const all: T[] = [];
  let pageNo = 1;
  while (pageNo <= MAX_PAGES) {
    const { items, totalCount } = await fetcher(pageNo);
    all.push(...items);
    if (pageNo === 1 || pageNo % 10 === 0) {
      logger.info({ pageNo, fetched: all.length, totalCount }, 'amenity page fetched');
    }
    if (all.length >= totalCount || items.length === 0) break;
    pageNo++;
  }
  return all;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
