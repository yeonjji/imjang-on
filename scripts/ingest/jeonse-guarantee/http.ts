import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

const BASE = 'https://apis.data.go.kr/B551408/jnse-rcmd-info-v2';
const TIMEOUT_MS = 15_000;
const SLEEP_MS = 80;
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** JSON 오퍼레이션 1건 호출. serviceKey는 디코딩 키 저장 → URLSearchParams가 인코딩(loan 패턴 동일). */
async function getJson(op: string, params: Record<string, string>): Promise<unknown> {
  if (!env.PUBLIC_DATA_KEY) throw new Error('PUBLIC_DATA_KEY is required');
  const url = new URL(`${BASE}/${op}`);
  url.searchParams.set('serviceKey', env.PUBLIC_DATA_KEY);
  url.searchParams.set('dataType', 'JSON');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let attempt = 0;
  while (true) {
    attempt++;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'imjang-on/1.0 (+https://imjang-on.com)', Accept: 'application/json' },
      });
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          await sleep(SLEEP_MS * Math.pow(3, attempt));
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${op}`);
      }
      return JSON.parse(await res.text());
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        logger.warn({ err, op, attempt }, 'jeonse http retry');
        await sleep(SLEEP_MS * Math.pow(3, attempt));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(t);
    }
  }
}

/** op3: 보증구분코드별 상품 상세. */
export function fetchProductDetail(grntDvcd: string): Promise<unknown> {
  return getJson('jnse-prod-dtl-info-v2', { grntDvcd });
}

/** op4: 보증구분코드별 지역별 최대임차보증금(전 지역). */
export function fetchRegionLimits(grntDvcd: string): Promise<unknown> {
  return getJson('jnse-max-rent-amt-list-v2', { grntDvcd, numOfRows: '300', pageNo: '1' });
}
