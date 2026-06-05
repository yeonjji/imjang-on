import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

const TIMEOUT_MS = 30_000;
const SLEEP_MS = 150;
const MAX_RETRIES = 5;
const RATE_LIMIT_BACKOFF_MS = 5_000;

const ODCLOUD_BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1';
const LH_BASE = 'https://apis.data.go.kr/B552555';

function requireKey(): string {
  if (!env.PUBLIC_DATA_KEY) throw new Error('PUBLIC_DATA_KEY is required');
  return env.PUBLIC_DATA_KEY;
}

async function fetchJson(url: string): Promise<any> {
  let attempt = 0;
  while (true) {
    attempt++;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'imjang-on/1.0 (+https://imjang-on.com)',
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          const backoff =
            res.status === 429
              ? RATE_LIMIT_BACKOFF_MS * Math.pow(2, attempt - 1)
              : SLEEP_MS * Math.pow(3, attempt);
          logger.warn({ status: res.status, attempt, backoff }, 'subscription http retry');
          await sleep(backoff);
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${url.split('?')[0]}`);
      }
      await sleep(SLEEP_MS);
      return await res.json();
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const backoff = SLEEP_MS * Math.pow(3, attempt);
        logger.warn({ err, attempt, backoff }, 'subscription http error retry');
        await sleep(backoff);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(t);
    }
  }
}

// 청약홈 odcloud: { currentCount, data[], totalCount, ... }
export async function fetchOdcloud(
  operation: string,
  params: Record<string, string | number>,
): Promise<{ data: any[]; totalCount: number }> {
  const url = new URL(`${ODCLOUD_BASE}/${operation}`);
  url.searchParams.set('serviceKey', requireKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const json = await fetchJson(url.toString());
  return { data: json.data ?? [], totalCount: json.totalCount ?? 0 };
}

// LH B552555: 응답이 배열 [ {dsSch..}, {dsList.., resHeader..} ] 형태 → 통째로 반환
export async function fetchLh(
  servicePath: string,
  operation: string,
  params: Record<string, string | number>,
): Promise<any> {
  const url = new URL(`${LH_BASE}/${servicePath}/${operation}`);
  url.searchParams.set('serviceKey', requireKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  return fetchJson(url.toString());
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
