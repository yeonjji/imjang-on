import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

const BASE = 'https://apis.data.go.kr/1613000';
const TIMEOUT_MS = 15_000;
const SLEEP_MS = 80;
const MAX_RETRIES = 3;

export async function fetchPage(params: {
  operation: string;
  lawdCd: string;
  dealYmd: string;
  pageNo: number;
  numOfRows?: number;
}): Promise<string> {
  if (!env.PUBLIC_DATA_KEY) {
    throw new Error('PUBLIC_DATA_KEY is required');
  }
  const url = new URL(`${BASE}/${params.operation}/${params.operation}`);
  url.searchParams.set('serviceKey', env.PUBLIC_DATA_KEY);
  url.searchParams.set('LAWD_CD', params.lawdCd);
  url.searchParams.set('DEAL_YMD', params.dealYmd);
  url.searchParams.set('pageNo', String(params.pageNo));
  url.searchParams.set('numOfRows', String(params.numOfRows ?? 1000));

  let attempt = 0;
  while (true) {
    attempt++;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), { signal: ctrl.signal });
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          const backoff = SLEEP_MS * Math.pow(3, attempt);
          logger.warn({ status: res.status, attempt, backoff }, 'http retry');
          await sleep(backoff);
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${params.operation}`);
      }
      await sleep(SLEEP_MS);
      return await res.text();
    } catch (err: unknown) {
      if (attempt < MAX_RETRIES) {
        const backoff = SLEEP_MS * Math.pow(3, attempt);
        logger.warn({ err, attempt, backoff }, 'http error retry');
        await sleep(backoff);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(t);
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
