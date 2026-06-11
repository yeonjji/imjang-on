import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

// 서비스명이 2회 반복되는 실제 경로(가이드 없음, 실측 확인).
const URL_BASE =
  'https://apis.data.go.kr/B553701/LoanProductSearchingInfo/LoanProductSearchingInfo/getLoanProductSearchingInfo';
const TIMEOUT_MS = 15_000;
const SLEEP_MS = 80;
const MAX_RETRIES = 3;

export async function fetchLoanPage(pageNo: number, numOfRows = 100): Promise<string> {
  if (!env.PUBLIC_DATA_KEY) throw new Error('PUBLIC_DATA_KEY is required');

  const url = new URL(URL_BASE);
  url.searchParams.set('serviceKey', env.PUBLIC_DATA_KEY);
  url.searchParams.set('numOfRows', String(numOfRows));
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('dataType', 'XML');

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
          Accept: 'application/xml,text/xml',
        },
      });
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          const backoff = SLEEP_MS * Math.pow(3, attempt);
          logger.warn({ status: res.status, attempt, backoff }, 'loan http retry');
          await sleep(backoff);
          continue;
        }
        throw new Error(`HTTP ${res.status} for loan page ${pageNo}`);
      }
      return await res.text();
    } catch (err: unknown) {
      if (attempt < MAX_RETRIES) {
        const backoff = SLEEP_MS * Math.pow(3, attempt);
        logger.warn({ err, attempt, backoff }, 'loan http error retry');
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
