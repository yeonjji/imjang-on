import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { parseNemcPage } from '@/lib/hospital/nemc';

const BASE_URL = 'https://apis.data.go.kr/B552657/HsptlAsembySearchService/getHsptlMdcncListInfoInqire';
export const PAGE_SIZE = 5000; // 2026-10-27 실측: 5000건 한 번에 2.3초
const TIMEOUT_MS = 30_000;

/** 한 페이지 XML. 시간 제한 + 1회 재시도, resultCode≠00이면 throw. */
export async function fetchNemcPage(pageNo: number): Promise<string> {
  if (!env.PUBLIC_DATA_KEY) throw new Error('PUBLIC_DATA_KEY 미설정');
  const url = new URL(BASE_URL);
  url.searchParams.set('serviceKey', env.PUBLIC_DATA_KEY);
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('numOfRows', String(PAGE_SIZE));
  let last: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      const code = parseNemcPage(xml).resultCode;
      if (code !== '00') throw new Error(`resultCode ${code || '(없음)'}: ${xml.slice(0, 200)}`);
      return xml;
    } catch (err) {
      last = err;
      logger.warn({ pageNo, attempt, err }, 'hospital-nemc page failed');
    }
  }
  throw last;
}
