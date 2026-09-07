/**
 * 공동주택 단지정보 API 호출.
 *
 * 엔드포인트 경로는 추측으로 찾을 수 없다(모든 변형이 NO_OPENAPI_SERVICE_ERROR).
 * 아래는 2026-09-07 실호출로 확인한 값이다. 응답은 JSON이 기본이다.
 * 시군구 30개 조회 중 13개가 타임아웃한 실측이 있어 재시도를 반드시 건다.
 */
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

const LIST_BASE = 'https://apis.data.go.kr/1613000/AptListService4';
const INFO_BASE = 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV5';
const TIMEOUT_MS = 25_000;
const SLEEP_MS = 80;
const MAX_RETRIES = 3;

/** 일일 트래픽 한도 초과. 재시도하지 않고 즉시 중단해야 한다. */
export class QuotaExceededError extends Error {
  constructor() {
    super('daily traffic quota exceeded');
    this.name = 'QuotaExceededError';
  }
}

/** 응답 본문 어디에 있든 한도 초과 문구를 감지한다(래핑 구조가 오류마다 다르다). */
export function assertNotQuotaExceeded(payload: unknown): void {
  const s = typeof payload === 'string' ? payload : JSON.stringify(payload ?? '');
  if (s.includes('LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS')) {
    throw new QuotaExceededError();
  }
}

async function getJson(url: URL, label: string): Promise<unknown> {
  if (!env.PUBLIC_DATA_KEY) throw new Error('PUBLIC_DATA_KEY is required');
  url.searchParams.set('serviceKey', env.PUBLIC_DATA_KEY);

  let attempt = 0;
  for (;;) {
    attempt++;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), {
        signal: ctrl.signal,
        headers: {
          // data.go.kr WAF가 빈 UA 요청을 차단한다.
          'User-Agent': 'imjang-on/1.0 (+https://imjang-on.com)',
          Accept: 'application/json',
        },
      });
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      assertNotQuotaExceeded(parsed); // 한도 초과는 재시도 대상이 아니다
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          const backoff = SLEEP_MS * Math.pow(3, attempt);
          logger.warn({ status: res.status, attempt, backoff, label }, 'apt-complex http retry');
          await sleep(backoff);
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${label}`);
      }
      await sleep(SLEEP_MS);
      return parsed;
    } catch (err: unknown) {
      if (err instanceof QuotaExceededError) throw err;
      if (attempt < MAX_RETRIES) {
        const backoff = SLEEP_MS * Math.pow(3, attempt);
        logger.warn({ err, attempt, backoff, label }, 'apt-complex http error retry');
        await sleep(backoff);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(t);
    }
  }
}

export async function fetchAptListPage(pageNo: number, numOfRows = 1000): Promise<unknown> {
  const url = new URL(`${LIST_BASE}/getTotalAptList4`);
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('numOfRows', String(numOfRows));
  return getJson(url, `list p${pageNo}`);
}

export async function fetchAptBasis(kaptCode: string): Promise<unknown> {
  const url = new URL(`${INFO_BASE}/getAphusBassInfoV5`);
  url.searchParams.set('kaptCode', kaptCode);
  return getJson(url, `basis ${kaptCode}`);
}

export async function fetchAptDetail(kaptCode: string): Promise<unknown> {
  const url = new URL(`${INFO_BASE}/getAphusDtlInfoV5`);
  url.searchParams.set('kaptCode', kaptCode);
  return getJson(url, `detail ${kaptCode}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
