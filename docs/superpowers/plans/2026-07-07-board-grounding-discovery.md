# 게시판 근거 발견 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어드민 "주제 던지기" 글 생성이 근거를 못 찾아 막히는 문제를, korea.kr 정책뉴스 오픈 API(주력) + 네이버 멀티쿼리·화이트리스트 확장(보완)으로 해소한다.

**Architecture:** `researchTopic`이 두 갈래 탐색을 병합한다 — (1) 신규 `lib/board/sources/korea-news.ts`가 data.go.kr 정책뉴스 API로 최근 90일 코퍼스를 받아 로컬 키워드 매칭(본문 포함, fetch 불필요), (2) 기존 네이버 웹검색은 멀티쿼리로 recall을 높이고 허용 도메인을 검증된 공공기관까지 확장. 라이선스 게이트(공공누리 제한유형·길이)는 불변.

**Tech Stack:** TypeScript, Next.js(server actions), Vitest, `fast-xml-parser`(기존 의존성), data.go.kr Open API(`PUBLIC_DATA_KEY`), 네이버 검색 API.

## Global Constraints

- 공식/공공저작물 출처만 사용. 뉴스·블로그·카페 도메인은 계속 전면 배제.
- 공공누리 제한유형(2·3·4) 탐지 게이트 불변(`detectKoglType`/`isUsableLicense`). 검증된 공공기관 호스트만 개별 등재, **와일드카드 금지**(`.or.kr`/`.re.kr` 통째 개방 금지).
- 근거 본문 최소 길이 `MIN_SOURCE_CHARS = 800`(공백 제외), `sourceText` 상한 `MAX_SOURCE_TEXT_CHARS = 16000` 유지.
- 출처별 캡션 헤더 형식 `[출처: {라벨} · {공공누리라벨} · {url}]` 유지.
- 외부 호출은 graceful: 키 없음/오류/타임아웃 시 빈 배열 반환(throw 금지), 기존 `searchTopic` 패턴과 동일.
- 게시 전 사람 검수(DRAFT → publish) 흐름 불변. 이번 작업은 `researchTopic` 근거 수집만 바꾼다.
- 완료 게이트: `pnpm typecheck` && `pnpm lint` && 해당 테스트 통과. (프로젝트 규칙: lint 필수 — 미사용 import 제거.)

## File Structure

- `lib/board/sources/korea-news.ts` **(신규)** — 정책뉴스 API 클라이언트: 날짜창 fetch+XML 파싱+캐시, 키워드 매처, `collectKoreaNews` 오케스트레이션.
- `tests/lib/board-korea-news.test.ts` **(신규)** — 위 모듈 단위 테스트.
- `tests/lib/fixtures/korea-news-sample.xml` **(신규)** — 실제 API 응답 캡처 픽스처(Task 0에서 생성).
- `lib/board/source-policy.ts` **(수정)** — 허용 도메인·라벨 확장.
- `tests/lib/board-source-policy.test.ts` **(수정)** — 확장 도메인 테스트.
- `lib/board/research.ts` **(수정)** — 네이버 멀티쿼리 + korea-news 병합.
- `tests/lib/board-research.test.ts` **(수정)** — 병합·멀티쿼리 테스트.
- `lib/board/generate.ts` **(수정)** — 다출처 종합 프롬프트.
- `tests/lib/board-generate.test.ts` **(신규)** — 프롬프트 문구 회귀 테스트.

---

### Task 0: 정책뉴스 API 실측 + 픽스처 캡처 (스파이크)

외부 API의 응답 스키마·필드명·활용신청 상태가 불확실하므로, 코드를 짜기 전에 실제 응답을 캡처한다. **이 태스크의 산출물은 픽스처 파일 + 확인된 필드 매핑이다.**

**Files:**
- Create: `tests/lib/fixtures/korea-news-sample.xml`
- Create(임시): `scripts/board/spike-korea-news.ts` (확인 후 삭제)

- [ ] **Step 1: 스파이크 스크립트 작성**

`scripts/board/spike-korea-news.ts`:

```ts
import { env } from '@/lib/env';

async function main() {
  if (!env.PUBLIC_DATA_KEY) throw new Error('PUBLIC_DATA_KEY 미설정');
  const url = new URL('https://apis.data.go.kr/1371000/policyNewsService/policyNewsList');
  url.searchParams.set('serviceKey', env.PUBLIC_DATA_KEY);
  url.searchParams.set('startDate', '20260601');
  url.searchParams.set('endDate', '20260607');
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '5');
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'imjang-on/1.0 (+https://imjang-on.com)', Accept: 'application/xml,text/xml' },
  });
  console.log('HTTP', res.status);
  console.log(await res.text());
}
main();
```

- [ ] **Step 2: 실행 후 응답 확인**

Run: `pnpm tsx scripts/board/spike-korea-news.ts | tee /tmp/korea-news-raw.xml`

기대(승인된 키): `HTTP 200` + `<response><header><resultCode>00</resultCode>...</header><body><items><item>...`.
확인 사항 3가지를 육안으로 기록한다:
1. 제목 태그명(예상 `Title`), 본문 태그명(예상 `DataContents`), 원문 URL 태그명(예상 `OriginalUrl`).
2. `OriginalUrl`의 실제 호스트(korea.kr인지, 부처 .go.kr인지).
3. 에러라면 `<returnReasonCode>` — 코드 `30`/`SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 또는 인증 오류면 **정책뉴스 API(데이터 15095335) 활용신청이 필요**하다. data.go.kr에서 해당 API에 활용신청(대개 자동승인) 후 재실행.

- [ ] **Step 3: 픽스처로 저장**

정상 응답 XML에서 `<item>` 2~3개만 남겨 `tests/lib/fixtures/korea-news-sample.xml`로 저장한다. 최소 1개 item의 본문(`DataContents`)은 공백 제외 800자를 넘도록 유지(짧으면 실제 다른 item으로 교체). 민감정보 없음(공개 정책뉴스).

- [ ] **Step 4: 필드 매핑 확정 메모**

`tests/lib/fixtures/korea-news-sample.xml` 상단에 주석 대신, 이 플랜 Task 2의 `toArticle` 필드명이 실측과 일치하는지 확인한다. 다르면 **Task 2·3의 필드 접근자(`item.Title` 등)를 실측명으로 교정**한다(그 외 로직 불변).

- [ ] **Step 5: 스파이크 스크립트 삭제 + 커밋**

```bash
rm scripts/board/spike-korea-news.ts
git add tests/lib/fixtures/korea-news-sample.xml
git commit -m "chore(board): 정책뉴스 API 응답 픽스처 캡처"
```

---

### Task 1: 허용 도메인·라벨 확장 (source-policy)

**Files:**
- Modify: `lib/board/source-policy.ts:7` (OR_KR_ALLOWLIST), `lib/board/source-policy.ts:65-70` (DOMAIN_LABEL)
- Test: `tests/lib/board-source-policy.test.ts`

**Interfaces:**
- Produces: `isAllowedDomain(url)` 가 `kosis.kr`·`reb.or.kr`·`khug.or.kr`·`krihs.re.kr`·`kdi.re.kr`(및 www)에 true. `domainLabel(host)`가 해당 호스트에 한글 라벨. 시그니처 변경 없음.

- [ ] **Step 1: 실패 테스트 작성**

`tests/lib/board-source-policy.test.ts`의 `describe('isAllowedDomain')`에 추가:

```ts
  it('등재된 공공기관 확장 호스트 허용', () => {
    expect(isAllowedDomain('https://kosis.kr/statHtml/x')).toBe(true);
    expect(isAllowedDomain('https://www.reb.or.kr/r/a')).toBe(true);
    expect(isAllowedDomain('https://www.khug.or.kr/p')).toBe(true);
    expect(isAllowedDomain('https://www.krihs.re.kr/x')).toBe(true);
    expect(isAllowedDomain('https://www.kdi.re.kr/x')).toBe(true);
  });
  it('미등재 .re.kr/.or.kr은 여전히 차단', () => {
    expect(isAllowedDomain('https://random.re.kr/x')).toBe(false);
    expect(isAllowedDomain('https://some-assoc.or.kr/x')).toBe(false);
  });
```

`describe('domainLabel')`에 추가:

```ts
  it('확장 공공기관 라벨', () => {
    expect(domainLabel('kosis.kr')).toBe('국가통계포털');
    expect(domainLabel('www.reb.or.kr')).toBe('한국부동산원');
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run tests/lib/board-source-policy.test.ts`
Expected: FAIL — 확장 호스트가 false, 라벨이 호스트 그대로.

- [ ] **Step 3: 구현**

`lib/board/source-policy.ts` 수정. `OR_KR_ALLOWLIST`를 `INSTITUTION_ALLOWLIST`로 확장(변수명은 기존 유지 가능하나 아래처럼 개별 등재):

```ts
// 검증된 공공기관 호스트만 개별 등재(민간 협회·재단 배제, 와일드카드 금지).
const INSTITUTION_ALLOWLIST = new Set<string>([
  'bok.or.kr', 'www.bok.or.kr',        // 한국은행
  'kosis.kr', 'www.kosis.kr',          // 통계청 국가통계포털
  'reb.or.kr', 'www.reb.or.kr',        // 한국부동산원
  'khug.or.kr', 'www.khug.or.kr',      // 주택도시보증공사(HUG)
  'krihs.re.kr', 'www.krihs.re.kr',    // 국토연구원
  'kdi.re.kr', 'www.kdi.re.kr',        // 한국개발연구원(KDI)
]);
```

`isAllowedDomain`의 `OR_KR_ALLOWLIST.has(host)` 를 `INSTITUTION_ALLOWLIST.has(host)` 로 교체(라인 18).

`DOMAIN_LABEL`에 라벨 추가:

```ts
const DOMAIN_LABEL: Record<string, string> = {
  'korea.kr': '정책브리핑',
  'www.korea.kr': '정책브리핑',
  'bok.or.kr': '한국은행',
  'www.bok.or.kr': '한국은행',
  'kosis.kr': '국가통계포털',
  'www.kosis.kr': '국가통계포털',
  'reb.or.kr': '한국부동산원',
  'www.reb.or.kr': '한국부동산원',
  'khug.or.kr': '주택도시보증공사',
  'www.khug.or.kr': '주택도시보증공사',
  'krihs.re.kr': '국토연구원',
  'www.krihs.re.kr': '국토연구원',
  'kdi.re.kr': '한국개발연구원',
  'www.kdi.re.kr': '한국개발연구원',
};
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run tests/lib/board-source-policy.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/board/source-policy.ts tests/lib/board-source-policy.test.ts
git commit -m "feat(board): 근거 허용 도메인에 검증된 공공기관 5곳 확장"
```

---

### Task 2: 정책뉴스 클라이언트 — fetch + XML 파싱 + 캐시

**Files:**
- Create: `lib/board/sources/korea-news.ts`
- Test: `tests/lib/board-korea-news.test.ts`
- 참고: `scripts/ingest/http.ts`(data.go.kr fetch 패턴), `scripts/ingest/xml-parse.ts`(파싱 패턴), `lib/board/html-text.ts`(htmlToText)

**Interfaces:**
- Produces:
  - `interface KoreaNewsArticle { title: string; url: string; body: string; agency: string; }`
  - `interface KoreaNewsDeps { fetchImpl?: typeof fetch; serviceKey?: string; }`
  - `async function fetchWindow(startDate: string, endDate: string, deps: KoreaNewsDeps): Promise<KoreaNewsArticle[]>` — YYYYMMDD 인자, 윈도우 캐시, graceful [].
  - `function _resetKoreaNewsCache(): void` — 테스트용 캐시 초기화.

- [ ] **Step 1: 실패 테스트 작성**

`tests/lib/board-korea-news.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchWindow, _resetKoreaNewsCache } from '@/lib/board/sources/korea-news';

const SAMPLE = readFileSync(fileURLToPath(new URL('./fixtures/korea-news-sample.xml', import.meta.url)), 'utf8');

function fakeFetch(xml: string, status = 200): typeof fetch {
  return (async () => ({ ok: status === 200, status, text: async () => xml } as Response)) as unknown as typeof fetch;
}

describe('fetchWindow', () => {
  beforeEach(() => _resetKoreaNewsCache());

  it('정상 XML을 KoreaNewsArticle[]로 파싱', async () => {
    const arts = await fetchWindow('20260601', '20260607', { serviceKey: 'k', fetchImpl: fakeFetch(SAMPLE) });
    expect(arts.length).toBeGreaterThan(0);
    const a = arts[0];
    expect(a.title.length).toBeGreaterThan(0);
    expect(a.url).toMatch(/^https?:\/\//);
    expect(a.body.length).toBeGreaterThan(0);
    // 본문은 HTML 태그가 제거된 평문
    expect(a.body).not.toContain('<');
  });

  it('serviceKey 없으면 빈 배열(graceful)', async () => {
    const arts = await fetchWindow('20260601', '20260607', { serviceKey: '', fetchImpl: fakeFetch(SAMPLE) });
    expect(arts).toEqual([]);
  });

  it('HTTP 오류면 빈 배열(graceful)', async () => {
    const arts = await fetchWindow('20260601', '20260607', { serviceKey: 'k', fetchImpl: fakeFetch('', 500) });
    expect(arts).toEqual([]);
  });

  it('동일 윈도우 재호출은 캐시 사용(fetch 1회)', async () => {
    let calls = 0;
    const counting = (async () => { calls++; return { ok: true, status: 200, text: async () => SAMPLE } as Response; }) as unknown as typeof fetch;
    await fetchWindow('20260601', '20260607', { serviceKey: 'k', fetchImpl: counting });
    await fetchWindow('20260601', '20260607', { serviceKey: 'k', fetchImpl: counting });
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run tests/lib/board-korea-news.test.ts`
Expected: FAIL — 모듈 `@/lib/board/sources/korea-news` 없음.

- [ ] **Step 3: 구현**

`lib/board/sources/korea-news.ts`:

```ts
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

function getItems(parsed: Record<string, unknown>): Record<string, unknown>[] {
  const items = (parsed as any)?.response?.body?.items;
  if (!items || items === '') return [];
  const item = (items as any).item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

/** 실측 필드명(Task 0에서 확정). 다르면 이 접근자만 교정. */
function toArticle(item: Record<string, unknown>): KoreaNewsArticle | null {
  const anyItem = item as any;
  const title = String(anyItem.Title ?? anyItem.title ?? '').trim();
  const url = String(anyItem.OriginalUrl ?? anyItem.originalUrl ?? '').trim();
  const rawBody = String(anyItem.DataContents ?? anyItem.dataContents ?? '');
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run tests/lib/board-korea-news.test.ts`
Expected: PASS (모든 케이스). 실패 시 Task 0 픽스처의 필드명과 `toArticle` 접근자 불일치를 먼저 의심.

- [ ] **Step 5: 커밋**

```bash
git add lib/board/sources/korea-news.ts tests/lib/board-korea-news.test.ts
git commit -m "feat(board): 정책뉴스 API 클라이언트(날짜창 fetch+파싱+캐시)"
```

---

### Task 3: 키워드 매처 + collectKoreaNews 오케스트레이션

**Files:**
- Modify: `lib/board/sources/korea-news.ts` (matcher + collectKoreaNews 추가)
- Test: `tests/lib/board-korea-news.test.ts` (추가)

**Interfaces:**
- Consumes(Task 2): `KoreaNewsArticle`, `fetchWindow`.
- Produces:
  - `function scoreArticle(article: KoreaNewsArticle, tokens: string[]): number`
  - `function matchArticles(articles: KoreaNewsArticle[], topic: string, limit: number): KoreaNewsArticle[]`
  - `async function collectKoreaNews(topic: string, today: Date, deps?: KoreaNewsDeps): Promise<KoreaNewsArticle[]>` — 최근 90일 창 + 상위 3건 매칭. research.ts가 소비.

- [ ] **Step 1: 실패 테스트 작성**

`tests/lib/board-korea-news.test.ts`에 추가:

```ts
import { scoreArticle, matchArticles, collectKoreaNews } from '@/lib/board/sources/korea-news';

describe('matchArticles', () => {
  const arts = [
    { title: '전세보증금 반환보증 개편', url: 'https://www.korea.kr/a', body: '전세 보증 관련 상세 내용', agency: '정책브리핑' },
    { title: '청년 자산형성 지원', url: 'https://www.korea.kr/b', body: '청약 및 대출 관련 내용 전세 언급 한번', agency: '정책브리핑' },
    { title: '농업 통계 발표', url: 'https://www.korea.kr/c', body: '농산물 가격 동향', agency: '정책브리핑' },
  ];

  it('제목 매칭이 본문 매칭보다 높은 점수', () => {
    const tokens = ['전세'];
    expect(scoreArticle(arts[0], tokens)).toBeGreaterThan(scoreArticle(arts[1], tokens));
  });

  it('관련 기사만 점수 임계 이상으로 상위 반환', () => {
    const m = matchArticles(arts, '전세보증', 3);
    expect(m[0].url).toBe('https://www.korea.kr/a');
    expect(m.some((a) => a.url === 'https://www.korea.kr/c')).toBe(false); // 무관 기사 배제
  });

  it('limit 준수', () => {
    expect(matchArticles(arts, '전세 청약', 1)).toHaveLength(1);
  });

  it('빈 주제 토큰이면 빈 배열', () => {
    expect(matchArticles(arts, '  ', 3)).toEqual([]);
  });
});

describe('collectKoreaNews', () => {
  beforeEach(() => _resetKoreaNewsCache());
  it('serviceKey 없으면 빈 배열', async () => {
    const r = await collectKoreaNews('전세', new Date('2026-06-23T00:00:00Z'), { serviceKey: '' });
    expect(r).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run tests/lib/board-korea-news.test.ts`
Expected: FAIL — `scoreArticle`/`matchArticles`/`collectKoreaNews` 미정의.

- [ ] **Step 3: 구현**

`lib/board/sources/korea-news.ts` 하단에 추가:

```ts
const WINDOW_DAYS = 90;
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

/** 주제 → 최근 90일 정책뉴스에서 상위 매칭 기사(본문 포함). */
export async function collectKoreaNews(topic: string, today: Date, deps: KoreaNewsDeps = {}): Promise<KoreaNewsArticle[]> {
  const start = new Date(today.getTime() - WINDOW_DAYS * 86_400_000);
  const articles = await fetchWindow(ymd(start), ymd(today), deps);
  return matchArticles(articles, topic, MATCH_LIMIT);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run tests/lib/board-korea-news.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/board/sources/korea-news.ts tests/lib/board-korea-news.test.ts
git commit -m "feat(board): 정책뉴스 키워드 매처 + collectKoreaNews"
```

---

### Task 4: 네이버 멀티쿼리

**Files:**
- Modify: `lib/board/research.ts:59-84`(searchTopic 주변에 searchVariants 추가), `researchTopic` 내 `searchTopic` 호출부.
- Test: `tests/lib/board-research.test.ts`

**Interfaces:**
- Consumes: 기존 `searchTopic(topic, deps)`.
- Produces: 내부 `searchVariants(topic, deps): Promise<RawCandidate[]>` — 변형 쿼리 합집합. `researchTopic`이 이걸 호출.

- [ ] **Step 1: 실패 테스트 작성**

`tests/lib/board-research.test.ts`에 추가(멀티쿼리로 여러 번 호출되어도 URL 중복은 1건):

```ts
  it('멀티쿼리: 네이버 검색을 여러 변형으로 호출(호출 횟수 ≥ 2)', async () => {
    let naverCalls = 0;
    const fetchImpl = (async (input: string | URL) => {
      const u = typeof input === 'string' ? input : input.toString();
      if (u.includes('openapi.naver.com')) {
        naverCalls++;
        return { ok: true, json: async () => ({ items: [{ title: 't', link: 'https://www.korea.kr/news/a', description: 's' }] }) } as Response;
      }
      return { ok: true, text: async () => `<p>${LONG}</p>공공누리 제1유형` } as Response;
    }) as unknown as typeof fetch;
    const r = await researchTopic('전세 사기', TODAY, { ...CREDS, fetchImpl });
    expect(naverCalls).toBeGreaterThanOrEqual(2);
    expect(r.candidates).toHaveLength(1); // 동일 URL 중복 제거
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run tests/lib/board-research.test.ts -t 멀티쿼리`
Expected: FAIL — 네이버가 1회만 호출됨.

- [ ] **Step 3: 구현**

`lib/board/research.ts`, `searchTopic` 함수 바로 아래에 추가:

```ts
/** 공식 출처 편향 변형 쿼리로 recall 향상. 결과는 합집합(중복은 researchTopic에서 제거). */
const QUERY_SUFFIXES = ['', ' 보도자료', ' 제도', ' 지원'];
async function searchVariants(topic: string, deps: ResearchDeps): Promise<RawCandidate[]> {
  const results = await Promise.all(QUERY_SUFFIXES.map((suffix) => searchTopic(`${topic}${suffix}`.trim(), deps)));
  return results.flat();
}
```

`researchTopic` 본문에서 `const raw = await searchTopic(topic, deps);`(라인 119)를 다음으로 교체:

```ts
  const raw = await searchVariants(topic, deps);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run tests/lib/board-research.test.ts`
Expected: PASS (신규 + 기존 전부 — 기존 fake는 쿼리 무관하게 동일 응답이라 중복 제거 후 동일 결과).

- [ ] **Step 5: 커밋**

```bash
git add lib/board/research.ts tests/lib/board-research.test.ts
git commit -m "feat(board): 네이버 근거 검색 멀티쿼리로 recall 향상"
```

---

### Task 5: researchTopic에 정책뉴스 병합

**Files:**
- Modify: `lib/board/research.ts` (import, `ResearchDeps`, `researchTopic` 병합 로직)
- Test: `tests/lib/board-research.test.ts`

**Interfaces:**
- Consumes(Task 3): `collectKoreaNews(topic, today, { fetchImpl, serviceKey })`.
- Produces: `researchTopic`가 정책뉴스 기사(본문 포함, fetch 불필요)와 네이버 후보를 하나의 `SourceMeta[]`로 병합. `ResearchDeps`에 `serviceKey?: string` 추가.

- [ ] **Step 1: 실패 테스트 작성**

`tests/lib/board-research.test.ts`에 추가. data.go.kr 응답을 라우팅하는 fake로 정책뉴스 근거가 병합되는지 검증:

```ts
  it('정책뉴스 코퍼스가 근거로 병합된다(네이버 0건이어도 grounded 생성)', async () => {
    const KOREA_XML = `<response><header><resultCode>00</resultCode></header><body><items><item>` +
      `<Title>전세보증 개편</Title><OriginalUrl>https://www.korea.kr/news/pn1</OriginalUrl>` +
      `<DataContents>${'전세보증금 반환보증 제도 상세 내용. '.repeat(60)}</DataContents>` +
      `</item></items></body></response>`;
    const fetchImpl = (async (input: string | URL) => {
      const u = typeof input === 'string' ? input : input.toString();
      if (u.includes('apis.data.go.kr')) return { ok: true, text: async () => KOREA_XML } as Response;
      if (u.includes('openapi.naver.com')) return { ok: true, json: async () => ({ items: [] }) } as Response;
      return { ok: false, text: async () => '' } as Response;
    }) as unknown as typeof fetch;
    const r = await researchTopic('전세보증', TODAY, { ...CREDS, serviceKey: 'k', fetchImpl });
    expect(r.grounded).not.toBeNull();
    expect(r.grounded!.sourceUrl).toBe('https://www.korea.kr/news/pn1');
    expect(r.grounded!.sourceText).toContain('전세보증금');
  });
```

(Task 2에서 `_resetKoreaNewsCache`를 export 했으므로, 이 파일 상단에 `import { _resetKoreaNewsCache } from '@/lib/board/sources/korea-news';` 후 `beforeEach(() => _resetKoreaNewsCache())`를 `describe('researchTopic')` 안에 추가해 캐시 간섭 제거.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run tests/lib/board-research.test.ts -t 정책뉴스`
Expected: FAIL — 정책뉴스가 병합되지 않아 grounded null.

- [ ] **Step 3: 구현**

`lib/board/research.ts` 상단 import에 추가:

```ts
import { collectKoreaNews } from '@/lib/board/sources/korea-news';
```

`ResearchDeps` 인터페이스에 `serviceKey?: string;` 추가:

```ts
export interface ResearchDeps {
  fetchImpl?: typeof fetch;
  clientId?: string;
  clientSecret?: string;
  serviceKey?: string;
}
```

`researchTopic`을 다음으로 교체(정책뉴스 먼저 등록 → 네이버 후보 등록, URL 중복 방지):

```ts
export async function researchTopic(topic: string, today: Date, deps: ResearchDeps = {}): Promise<ResearchResult> {
  // (1) korea.kr 정책뉴스 코퍼스: 본문 포함 → fetch/추출 불필요, 전부 공공저작물(unknown→usable).
  const koreaArticles = await collectKoreaNews(topic, today, { fetchImpl: deps.fetchImpl, serviceKey: deps.serviceKey });

  // (2) 네이버 멀티쿼리 → 허용 도메인만 + 동일 URL 중복 제거 → 상한.
  const raw = await searchVariants(topic, deps);
  const allowed = [...new Map(raw.filter((c) => isAllowedDomain(c.url)).map((c) => [c.url, c])).values()].slice(
    0,
    MAX_CANDIDATES,
  );
  const exts = await Promise.all(allowed.map((c) => fetchAndExtract(c.url, deps)));

  const metas: SourceMeta[] = [];
  const bodies = new Map<string, string>();

  // 정책뉴스 먼저 등록(대표 우선순위·중복 기준).
  for (const a of koreaArticles) {
    if (bodies.has(a.url)) continue;
    const chars = a.body.replace(/\s/g, '').length;
    metas.push({ url: a.url, domain: hostOf(a.url), koglType: 'unknown', usable: chars >= MIN_SOURCE_CHARS, title: a.title, chars });
    bodies.set(a.url, a.body);
  }

  // 네이버 후보 등록(정책뉴스와 동일 URL이면 스킵).
  allowed.forEach((c, i) => {
    if (bodies.has(c.url)) return;
    const ext = exts[i];
    const koglType: KoglType = ext?.koglType ?? 'unknown';
    const chars = ext ? ext.text.replace(/\s/g, '').length : 0;
    const usable = !!ext && isUsableLicense(koglType) && chars >= MIN_SOURCE_CHARS;
    metas.push({ url: c.url, domain: hostOf(c.url), koglType, usable, title: c.title, chars });
    if (ext) bodies.set(c.url, ext.text);
  });

  const usable = metas.filter((m) => m.usable).sort(rankUsable);
  if (usable.length === 0) {
    logger.info({ topic, candidates: metas.length }, 'research: no usable public-domain source');
    return { candidates: metas, grounded: null };
  }

  const rep = usable[0];
  const header = (m: SourceMeta) => `[출처: ${domainLabel(m.domain)} · ${licenseLabel(m.koglType)} · ${m.url}]`;
  const sourceText = usable
    .map((m) => `${header(m)}\n${bodies.get(m.url) ?? ''}`)
    .join('\n\n')
    .slice(0, MAX_SOURCE_TEXT_CHARS);
  const sourceExcerpt = `${header(rep)}\n${bodies.get(rep.url) ?? ''}`.slice(0, 4000);

  return {
    candidates: metas,
    grounded: {
      sourceName: domainLabel(rep.domain),
      sourceUrl: rep.url,
      sourceDate: today,
      sourceText,
      sourceExcerpt,
      used: usable,
    },
  };
}
```

- [ ] **Step 4: 전체 research 테스트 통과 확인**

Run: `pnpm vitest run tests/lib/board-research.test.ts`
Expected: PASS (신규 병합 + 기존 전부). 기존 테스트는 `serviceKey` 미주입 → 정책뉴스 [] → 네이버만으로 기존과 동일 동작.

- [ ] **Step 5: 커밋**

```bash
git add lib/board/research.ts tests/lib/board-research.test.ts
git commit -m "feat(board): researchTopic에 정책뉴스 코퍼스 근거 병합"
```

---

### Task 6: 다출처 종합 프롬프트

**Files:**
- Modify: `lib/board/generate.ts:41`(규칙 #1), `lib/board/generate.ts:60-62`(buildUserPrompt)
- Test: `tests/lib/board-generate.test.ts` (신규)

**Interfaces:**
- Produces: `SYSTEM_PROMPT`(export)가 다출처 종합·출처별 근거 문구 포함. 시그니처 불변.

- [ ] **Step 1: 실패 테스트 작성**

`tests/lib/board-generate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT } from '@/lib/board/generate';

describe('SYSTEM_PROMPT', () => {
  it('다출처 종합·출처 근거 원칙을 명시한다', () => {
    expect(SYSTEM_PROMPT).toContain('여러');
    expect(SYSTEM_PROMPT).toContain('출처');
  });
  it('추측·추가 금지 원칙은 유지된다', () => {
    expect(SYSTEM_PROMPT).toContain('추측');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run tests/lib/board-generate.test.ts`
Expected: FAIL — SYSTEM_PROMPT에 '여러' 없음.

- [ ] **Step 3: 구현**

`lib/board/generate.ts` 규칙 #1(라인 41)을 교체:

```ts
1. 제공된 근거 자료는 여러 공식 출처의 글이 [출처: …] 블록으로 이어져 있을 수 있다. 각 사실은 해당 출처에 근거해 쓰고, 자료에 없는 내용은 절대 추측·추가하지 않는다.
```

`buildUserPrompt`(라인 60-62)를 교체:

```ts
function buildUserPrompt(input: GenerateInput): string {
  return `다음은 '${input.sourceName}' 등 여러 공식 출처에서 모은 근거 자료다. 각 [출처: …] 블록의 사실만으로 종합해 한 편의 글을 작성하라.\n\n=== 근거 자료 시작 ===\n${input.sourceText}\n=== 근거 자료 끝 ===`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run tests/lib/board-generate.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/board/generate.ts tests/lib/board-generate.test.ts
git commit -m "feat(board): 다출처 종합 프롬프트로 조정"
```

---

### Task 7: 전체 게이트 + 실환경 스모크

**Files:** 없음(검증 전용)

- [ ] **Step 1: 타입·린트·관련 테스트**

Run: `pnpm vitest run tests/lib/board-korea-news.test.ts tests/lib/board-source-policy.test.ts tests/lib/board-research.test.ts tests/lib/board-generate.test.ts && echo "=== typecheck ===" && pnpm typecheck && echo "=== lint ===" && pnpm lint`
Expected: 전부 PASS, 미사용 import 경고 0.

- [ ] **Step 2: 실환경 스모크(선택, 키·활용신청 필요)**

로컬 dev에서 `/admin/posts` 접속 → 최근 정책 관련 주제(예: "전세 사기 대책") 던지기 → 이전 대비 `insufficient`가 아니라 DRAFT 생성되는지 확인. 에버그린 주제(예: "취득세")로도 시도해 네이버 확장 경로 동작 확인.
- 주의(메모리): Vercel 배포는 마이그레이션 미적용과 무관(스키마 변경 없음). 새 API 활용신청 상태만 프로덕션 키에서 확인.

- [ ] **Step 3: 최종 커밋(있으면) 후 PR**

```bash
git push -u origin feat/board-grounding-discovery
```

---

## 참고: 범위 밖 (YAGNI)

- Google CSE, korea.kr 코퍼스 DB 적재, 적응형 날짜창(90→365일)은 이번 범위 밖(스펙 §8).
- 자동 일일 러너(`scripts/ingest/posts/runner.ts`)는 건드리지 않음. (단 `researchTopic`을 공유하는 경로가 있으면 개선이 자연 전파.)
