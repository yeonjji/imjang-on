# 주제 입력형 게시글 생성(어드민) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어드민이 `/admin/posts`에서 주제만 입력하면, 시스템이 공공누리 이용가능 공공저작물에서 근거를 모아 OpenAI(gpt-4.1)로 초안(DRAFT)을 생성하고 기존 검수 플로우로 게시한다. 자동 크론은 주 1회로 축소한다.

**Architecture:** 기존 생성 체인(`generateDraft → runGuardrails → createDraft`)은 그대로 재사용한다. 신규는 ①근거 수집(`lib/board/research.ts` = 네이버 웹검색 발견 + 도메인 1차필터 + 공공누리 판정 + 본문 추출 + 대표출처 collapse), ②저작권 판정 순수 모듈(`lib/board/source-policy.ts`), ③서버 액션(`generateFromTopicAction`), ④어드민 폼 UI다. 생성은 어드민 라우트(Basic Auth 뒤)에서 **동기** Server Action으로 실행한다.

**Tech Stack:** Next.js 15 App Router, React 19(`useActionState`), TypeScript, Prisma, Vitest, OpenAI SDK v6, 네이버 검색 API. HTML 파서 의존성은 추가하지 않고 기존 `htmlToText`를 재사용한다.

**설계 근거:** `docs/superpowers/specs/2026-06-23-board-topic-manual-generation-design.md`

**커밋 규칙:** 모든 커밋 메시지 끝에 다음 trailer를 붙인다.
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
작업 브랜치: `feat/board-topic-manual-generation` (이미 체크아웃됨, 스펙 커밋 존재).

---

## 이 플랜의 스코프 경계 (명시적 결정)

- **DB 소스(③순위: 청약·실거래·대출 집계 by topic) 통합은 본 플랜에서 제외.** 이유: 청약 집계글은 이미 자동 크론 경로가 담당하며, 수동 경로의 목적은 그 청약 digest에서 *벗어나* 주제를 다양화하는 것이다. 수동 MVP = 웹 발견(korea.kr·go.kr) + 붙여넣기 폴백. DB-by-topic은 후속 과제로 남긴다(스펙 §4.1 ③순위에 대한 의도된 deferral).
- **spike(구현 중 실측):** (a) 네이버 `webkr` 검색이 korea.kr·go.kr URL을 실제로 잘 반환하는지, (b) `detectKoglType`의 정규식이 실제 korea.kr/go.kr 페이지 마커를 잡는지. 둘 다 단위테스트는 주입 fetch로 결정적으로 검증하고, **운영 효용은 Task 8의 수동 스모크로 확인**한다. 효용이 낮으면 사용자는 붙여넣기 폴백으로 항상 우회 가능(기능은 동작).

---

## File Structure

**신규 파일**
- `lib/board/html-text.ts` — `htmlToText`/`decodeEntities` (rss.ts에서 추출, 순수). lib가 scripts에 의존하지 않도록 공용화.
- `lib/board/source-policy.ts` — 순수 저작권 게이트: 도메인 allowlist, 공공누리 유형 탐지, 사용가능 판정, 도메인 라벨.
- `lib/board/manual-draft.ts` — 순수 헬퍼: 주제 slug, dedupeKey, KST 날짜.
- `lib/board/research.ts` — 네트워크+오케스트레이션: 주제 검색→도메인필터→추출→공공누리 게이트→대표출처 collapse.
- `app/admin/posts/new-post-form.tsx` — `'use client'` 폼(useActionState).
- 테스트: `tests/lib/board-html-text.test.ts`, `tests/lib/board-source-policy.test.ts`, `tests/lib/board-manual-draft.test.ts`, `tests/lib/board-research.test.ts`.

**수정 파일**
- `scripts/ingest/posts/rss.ts` — `htmlToText`/`decodeEntities`를 `lib/board/html-text`에서 import + re-export(기존 import 호환 유지).
- `app/admin/posts/actions.ts` — `generateFromTopicAction` 추가.
- `app/admin/posts/page.tsx` — 상단에 `<NewPostForm/>` 렌더 + `export const maxDuration = 60`.
- `.github/workflows/generate-board-posts.yml` — cron `0 2 * * *` → `0 2 * * 1`.

**테스트 실행(단일 파일):** `pnpm exec dotenv -e .env.test -- vitest run <path>`
(`lib/board/research.ts`가 `lib/env`를 import → env 검증이 `DATABASE_URL`을 요구하므로 순수 테스트라도 `.env.test` 로딩 필요.)
**전체 단위:** `pnpm test:unit`

---

## Task 1: html-text 유틸 추출 (DRY, lib↔scripts 레이어링)

**Files:**
- Create: `lib/board/html-text.ts`
- Create (test): `tests/lib/board-html-text.test.ts`
- Modify: `scripts/ingest/posts/rss.ts:20-45` (decodeEntities/htmlToText 정의 → import+re-export로 교체)

- [ ] **Step 1: 추출 대상 함수를 새 파일로 복사**

Create `lib/board/html-text.ts`:

```ts
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

/** HTML 조각 → 평문. 블록 태그는 줄바꿈으로, 공백 정리. */
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
```

(주의: 원본 `rss.ts`의 `.replace(/ /g, ' ')`는 비단절공백(U+00A0)을 일반 공백으로 바꾸는 코드다. 가독성을 위해 ` `로 명시했다 — 동작 동일.)

- [ ] **Step 2: 실패 테스트 작성**

Create `tests/lib/board-html-text.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { htmlToText, decodeEntities } from '@/lib/board/html-text';

describe('htmlToText', () => {
  it('태그 제거 + 블록은 줄바꿈', () => {
    expect(htmlToText('<p>가나</p><p>다라</p>')).toBe('가나\n다라');
  });
  it('br은 줄바꿈, 엔티티 디코드', () => {
    expect(htmlToText('a&amp;b<br>c')).toBe('a&b\nc');
  });
});

describe('decodeEntities', () => {
  it('명명/숫자 엔티티 디코드', () => {
    expect(decodeEntities('&middot;&#65;&#x42;')).toBe('·AB');
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/board-html-text.test.ts`
Expected: FAIL (모듈 없음 — `Cannot find module '@/lib/board/html-text'` 이전 단계에서 생성했으면 PASS일 수 있음. 그 경우 Step 1을 먼저 했으니 바로 PASS여도 무방 — TDD 순서상 테스트만 먼저 쓰고 싶으면 Step 1을 Step 2 뒤로 미뤄도 됨).

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/board-html-text.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: rss.ts를 새 모듈로 위임(중복 제거)**

Modify `scripts/ingest/posts/rss.ts`: 파일 상단 `NAMED_ENTITIES`/`decodeEntities`/`htmlToText` 정의(20~45행)를 삭제하고, import 줄(1~2행) 아래에 다음을 추가한다.

```ts
import { XMLParser } from 'fast-xml-parser';
import { logger } from '@/lib/logger';
import { decodeEntities, htmlToText } from '@/lib/board/html-text';

export { decodeEntities, htmlToText }; // 기존 import 경로('../rss') 호환 유지
```

`splitAgencyPrefix`/`parseRssItems` 등 나머지는 그대로 둔다(이들이 `decodeEntities`/`htmlToText`를 호출하는 부분은 import된 동일 함수를 쓰게 된다).

- [ ] **Step 6: 기존 rss 테스트가 깨지지 않음 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/ingest/posts-rss.test.ts`
Expected: PASS (기존 테스트 전부 — htmlToText/parseRssItems 동작 불변)

- [ ] **Step 7: 커밋**

```bash
git add lib/board/html-text.ts tests/lib/board-html-text.test.ts scripts/ingest/posts/rss.ts
git commit -m "$(cat <<'EOF'
refactor(board): htmlToText/decodeEntities를 lib/board/html-text로 추출

lib(런타임)에서 재사용하기 위해 scripts의 순수 HTML→텍스트 유틸을
공용 모듈로 분리. rss.ts는 re-export로 기존 import 호환 유지.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 저작권 게이트 (순수) `lib/board/source-policy.ts`

도메인은 "뉴스 배제용 1차 필터"일 뿐 자유이용 보증이 아니다. 그 위에 공공누리 유형 확인을 얹고, **제1유형만 사용**(우리는 상업·변형 이용), unknown/2/3/4는 배제한다.

**Files:**
- Create: `lib/board/source-policy.ts`
- Create (test): `tests/lib/board-source-policy.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `tests/lib/board-source-policy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isAllowedDomain, detectKoglType, isUsableLicense, domainLabel } from '@/lib/board/source-policy';

describe('isAllowedDomain', () => {
  it('korea.kr / go.kr 허용', () => {
    expect(isAllowedDomain('https://www.korea.kr/news/x')).toBe(true);
    expect(isAllowedDomain('https://www.molit.go.kr/a')).toBe(true);
  });
  it('등재된 공공기관 .or.kr만 허용', () => {
    expect(isAllowedDomain('https://www.bok.or.kr/p')).toBe(true);
    expect(isAllowedDomain('https://some-assoc.or.kr/p')).toBe(false); // 민간 협회 차단
  });
  it('뉴스/일반 도메인 차단', () => {
    expect(isAllowedDomain('https://news.naver.com/a')).toBe(false);
    expect(isAllowedDomain('https://blog.example.com')).toBe(false);
  });
  it('잘못된 URL은 false', () => {
    expect(isAllowedDomain('not a url')).toBe(false);
  });
});

describe('detectKoglType', () => {
  it('제1유형 마커를 잡는다', () => {
    expect(detectKoglType('<div>공공누리 제1유형: 출처표시</div>')).toBe('1');
    expect(detectKoglType('<img class="kogl" src="/img/opentype01.png">')).toBe('1');
  });
  it('제2유형', () => {
    expect(detectKoglType('공공누리 제 2 유형(상업적 이용금지)')).toBe('2');
  });
  it('공공누리 언급 없으면 unknown', () => {
    expect(detectKoglType('<div>그냥 정부 페이지</div>')).toBe('unknown');
  });
  it('공공누리는 있으나 유형 불명이면 unknown', () => {
    expect(detectKoglType('본 저작물은 공공누리에 따라 이용 가능')).toBe('unknown');
  });
});

describe('isUsableLicense', () => {
  it('제1유형만 사용 가능', () => {
    expect(isUsableLicense('1')).toBe(true);
    expect(isUsableLicense('2')).toBe(false);
    expect(isUsableLicense('unknown')).toBe(false);
  });
});

describe('domainLabel', () => {
  it('알려진 도메인은 한글 라벨', () => {
    expect(domainLabel('www.korea.kr')).toBe('정책브리핑');
  });
  it('모르면 호스트 그대로', () => {
    expect(domainLabel('www.molit.go.kr')).toBe('www.molit.go.kr');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/board-source-policy.test.ts`
Expected: FAIL ("Cannot find module '@/lib/board/source-policy'")

- [ ] **Step 3: 구현**

Create `lib/board/source-policy.ts`:

```ts
export type KoglType = '1' | '2' | '3' | '4' | 'unknown';

/**
 * 본문 추출을 허용하는 공공 도메인. **'자유이용 보증'이 아니라 '뉴스 배제용 1차 필터'.**
 * .or.kr은 민간 협회·재단도 쓰므로 와일드카드 금지 — 검증된 공공기관 호스트만 개별 등재.
 */
const OR_KR_ALLOWLIST = new Set<string>(['bok.or.kr', 'www.bok.or.kr']);

export function isAllowedDomain(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).host.toLowerCase();
  } catch {
    return false;
  }
  if (host === 'korea.kr' || host === 'www.korea.kr') return true;
  if (host === 'go.kr' || host.endsWith('.go.kr')) return true;
  if (OR_KR_ALLOWLIST.has(host)) return true;
  return false;
}

const KOGL_HINT = /공공누리|kogl/i;

/** 페이지 HTML에서 공공누리 유형(1~4)을 탐지. 마커/유형 불명이면 'unknown'. */
export function detectKoglType(html: string): KoglType {
  if (!KOGL_HINT.test(html)) return 'unknown';
  for (const t of ['1', '2', '3', '4'] as const) {
    const re = new RegExp(`제\\s*${t}\\s*유형|유형\\s*${t}|opentype0?${t}|type0?${t}`, 'i');
    if (re.test(html)) return t;
  }
  return 'unknown';
}

/** 우리는 상업·변형 이용을 하므로 제1유형만 사용 가능. 그 외/unknown은 배제(보수적). */
export function isUsableLicense(type: KoglType): boolean {
  return type === '1';
}

const DOMAIN_LABEL: Record<string, string> = {
  'korea.kr': '정책브리핑',
  'www.korea.kr': '정책브리핑',
  'bok.or.kr': '한국은행',
  'www.bok.or.kr': '한국은행',
};

export function domainLabel(host: string): string {
  return DOMAIN_LABEL[host] ?? host;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/board-source-policy.test.ts`
Expected: PASS (전체)

- [ ] **Step 5: 커밋**

```bash
git add lib/board/source-policy.ts tests/lib/board-source-policy.test.ts
git commit -m "$(cat <<'EOF'
feat(board): 공공저작물 저작권 게이트(도메인 필터+공공누리 판정)

도메인 allowlist는 뉴스 배제용 1차 필터, 공공누리 제1유형만 사용가능
(unknown/2/3/4 배제). .or.kr은 검증 호스트만 개별 등재.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 순수 헬퍼 `lib/board/manual-draft.ts`

**Files:**
- Create: `lib/board/manual-draft.ts`
- Create (test): `tests/lib/board-manual-draft.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `tests/lib/board-manual-draft.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { manualSlug, manualDedupeKey, kstDateISO } from '@/lib/board/manual-draft';

describe('manualSlug', () => {
  it('공백·문장부호 제거, 소문자화(normalizeName)', () => {
    expect(manualSlug('전세 사기 예방')).toBe('전세사기예방');
  });
  it('40자 컷', () => {
    expect(manualSlug('가'.repeat(60)).length).toBe(40);
  });
});

describe('manualDedupeKey', () => {
  it('manual:{slug}:{date} 형식, 표기 흔들림 무관', () => {
    expect(manualDedupeKey('전세 사기', '2026-06-23')).toBe('manual:전세사기:2026-06-23');
    expect(manualDedupeKey('전세사기', '2026-06-23')).toBe('manual:전세사기:2026-06-23');
  });
});

describe('kstDateISO', () => {
  it('UTC 자정 직후도 KST 기준 같은 날(+9h)', () => {
    // 2026-06-22T20:00:00Z → KST 2026-06-23 05:00
    expect(kstDateISO(new Date('2026-06-22T20:00:00Z'))).toBe('2026-06-23');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/board-manual-draft.test.ts`
Expected: FAIL ("Cannot find module '@/lib/board/manual-draft'")

- [ ] **Step 3: 구현**

Create `lib/board/manual-draft.ts`:

```ts
import { normalizeName } from '@/lib/slug';

/** 주제 → dedupe·detectedFrom용 slug. normalizeName(공백·부호 제거+소문자) 후 40자 컷. */
export function manualSlug(topic: string): string {
  return normalizeName(topic).slice(0, 40);
}

/** 같은 날 같은 주제 재생성 차단(다른 날은 허용). */
export function manualDedupeKey(topic: string, dateISO: string): string {
  return `manual:${manualSlug(topic)}:${dateISO}`;
}

/** UTC Date → KST(+9h) 기준 YYYY-MM-DD. */
export function kstDateISO(d: Date): string {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/board-manual-draft.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/board/manual-draft.ts tests/lib/board-manual-draft.test.ts
git commit -m "$(cat <<'EOF'
feat(board): 수동 생성 순수 헬퍼(slug·dedupeKey·KST 날짜)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 근거 수집 모듈 `lib/board/research.ts`

네이버 웹검색으로 후보 URL 발견 → 도메인 1차필터 → 페이지 fetch+추출 → 공공누리 게이트 → 대표출처 collapse. fetch는 주입 가능(테스트 결정성). **스니펫(검색 description)은 후보 메타로만 보관하고 `sourceText`/생성에는 절대 전달하지 않는다**(근거는 추출 본문뿐).

**Files:**
- Create: `lib/board/research.ts`
- Create (test): `tests/lib/board-research.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `tests/lib/board-research.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { researchTopic } from '@/lib/board/research';

const CREDS = { clientId: 'id', clientSecret: 'secret' };
const TODAY = new Date('2026-06-23T00:00:00Z');

/** URL별로 응답을 라우팅하는 fake fetch. */
function routedFetch(routes: { search: unknown; pages: Record<string, string> }): typeof fetch {
  return (async (input: string | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('openapi.naver.com')) {
      return { ok: true, json: async () => routes.search } as Response;
    }
    const html = routes.pages[url];
    if (html == null) return { ok: false, text: async () => '' } as Response;
    return { ok: true, text: async () => html } as Response;
  }) as unknown as typeof fetch;
}

const LONG = '국토교통부는 전세 사기 피해자 지원 대책을 발표했다. '.repeat(40); // >800자

describe('researchTopic', () => {
  it('공공누리 제1유형 공식 페이지만 근거로 채택', async () => {
    const search = {
      items: [
        { title: '전세사기 대책', link: 'https://www.korea.kr/news/a', description: '스니펫텍스트유니크토큰' },
        { title: '뉴스기사', link: 'https://news.naver.com/x', description: '뉴스' },
      ],
    };
    const pages = { 'https://www.korea.kr/news/a': `<html><body><p>${LONG}</p><footer>공공누리 제1유형</footer></body></html>` };
    const r = await researchTopic('전세 사기', TODAY, { ...CREDS, fetchImpl: routedFetch({ search, pages }) });
    expect(r.grounded).not.toBeNull();
    expect(r.grounded!.sourceUrl).toBe('https://www.korea.kr/news/a');
    expect(r.grounded!.sourceName).toBe('정책브리핑');
    // 뉴스 도메인은 후보에서 제외(추출 시도조차 안 함)
    expect(r.candidates.some((c) => c.domain.includes('naver.com'))).toBe(false);
  });

  it('스니펫은 sourceText/근거에 들어가지 않는다', async () => {
    const search = { items: [{ title: 't', link: 'https://www.korea.kr/news/a', description: '스니펫텍스트유니크토큰' }] };
    const pages = { 'https://www.korea.kr/news/a': `<p>${LONG}</p>공공누리 제1유형` };
    const r = await researchTopic('전세 사기', TODAY, { ...CREDS, fetchImpl: routedFetch({ search, pages }) });
    expect(r.grounded!.sourceText).not.toContain('스니펫텍스트유니크토큰');
    expect(r.grounded!.sourceText).toContain('국토교통부는');
  });

  it('공공누리 마커 없으면(unknown) 배제 → grounded null', async () => {
    const search = { items: [{ title: 't', link: 'https://www.korea.kr/news/a', description: 's' }] };
    const pages = { 'https://www.korea.kr/news/a': `<p>${LONG}</p>` }; // 마커 없음
    const r = await researchTopic('전세 사기', TODAY, { ...CREDS, fetchImpl: routedFetch({ search, pages }) });
    expect(r.grounded).toBeNull();
    expect(r.candidates[0].koglType).toBe('unknown');
    expect(r.candidates[0].usable).toBe(false);
  });

  it('자격증명 없으면 검색 0건 → grounded null(graceful)', async () => {
    const r = await researchTopic('x', TODAY, { clientId: '', clientSecret: '', fetchImpl: routedFetch({ search: {}, pages: {} }) });
    expect(r.grounded).toBeNull();
    expect(r.candidates).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/board-research.test.ts`
Expected: FAIL ("Cannot find module '@/lib/board/research'")

- [ ] **Step 3: 구현**

Create `lib/board/research.ts`:

```ts
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { htmlToText } from '@/lib/board/html-text';
import { isAllowedDomain, detectKoglType, isUsableLicense, domainLabel, type KoglType } from '@/lib/board/source-policy';

const WEBKR_URL = 'https://openapi.naver.com/v1/search/webkr.json';
const SEARCH_TIMEOUT_MS = 8_000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_CANDIDATES = 5; // 추출 시도 상한(레이턴시·타임박스)
/** 추출 본문(공백제외) 최소 길이. 이보다 짧으면 1,000자 기사로 못 키워 배제. spike로 튜닝. */
export const MIN_SOURCE_CHARS = 800;

export interface ResearchDeps {
  fetchImpl?: typeof fetch;
  clientId?: string;
  clientSecret?: string;
}

export interface SourceMeta {
  url: string;
  domain: string;
  koglType: KoglType;
  usable: boolean;
  title: string;
  chars: number;
}
export interface GroundedResult {
  sourceName: string;
  sourceUrl: string;
  sourceDate: Date;
  sourceText: string;
  sourceExcerpt: string;
  used: SourceMeta[];
}
export interface ResearchResult {
  candidates: SourceMeta[];
  grounded: GroundedResult | null;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}
function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
}

interface RawCandidate {
  title: string;
  url: string;
}

/** 네이버 웹문서 검색으로 후보 URL 수집. 자격증명/오류 시 빈 배열(graceful). 스니펫은 버린다. */
async function searchTopic(topic: string, deps: ResearchDeps): Promise<RawCandidate[]> {
  const clientId = deps.clientId ?? env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = deps.clientSecret ?? env.NAVER_SEARCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];
  const doFetch = deps.fetchImpl ?? fetch;

  const url = new URL(WEBKR_URL);
  url.searchParams.set('query', topic);
  url.searchParams.set('display', '20');

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await doFetch(url.toString(), {
      signal: ctrl.signal,
      headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: { title: string; link: string }[] };
    return (json.items ?? []).map((it) => ({ title: stripHtml(it.title), url: it.link }));
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

/** 공식 페이지 fetch + 본문 추출 + 공공누리 판정. 실패 시 null(graceful). */
async function fetchAndExtract(url: string, deps: ResearchDeps): Promise<{ text: string; koglType: KoglType } | null> {
  const doFetch = deps.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await doFetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'imjang-on/1.0 (+https://imjang-on.com)' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return { text: htmlToText(html), koglType: detectKoglType(html) };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** 대표 출처 우선순위: korea.kr > 기타, 그다음 본문 길이 내림차순. */
function rankUsable(a: SourceMeta, b: SourceMeta): number {
  const score = (m: SourceMeta) => (m.domain.endsWith('korea.kr') ? 0 : 1);
  return score(a) - score(b) || b.chars - a.chars;
}

/** 주제 → 공공누리 이용가능 공식 근거 수집 + 대표출처 collapse. */
export async function researchTopic(topic: string, today: Date, deps: ResearchDeps = {}): Promise<ResearchResult> {
  const raw = await searchTopic(topic, deps);
  const allowed = raw.filter((c) => isAllowedDomain(c.url)).slice(0, MAX_CANDIDATES);

  const metas: SourceMeta[] = [];
  const bodies = new Map<string, string>();
  for (const c of allowed) {
    const ext = await fetchAndExtract(c.url, deps);
    const koglType: KoglType = ext?.koglType ?? 'unknown';
    const chars = ext ? ext.text.replace(/\s/g, '').length : 0;
    const usable = !!ext && isUsableLicense(koglType) && chars >= MIN_SOURCE_CHARS;
    metas.push({ url: c.url, domain: hostOf(c.url), koglType, usable, title: c.title, chars });
    if (ext) bodies.set(c.url, ext.text);
  }

  const usable = metas.filter((m) => m.usable).sort(rankUsable);
  if (usable.length === 0) {
    logger.info({ topic, candidates: metas.length }, 'research: no usable public-domain source');
    return { candidates: metas, grounded: null };
  }

  const rep = usable[0];
  const header = (m: SourceMeta) => `[출처: ${domainLabel(m.domain)} · 공공누리 제${m.koglType}유형 · ${m.url}]`;
  const sourceText = usable.map((m) => `${header(m)}\n${bodies.get(m.url) ?? ''}`).join('\n\n');
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

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/board-research.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/board/research.ts tests/lib/board-research.test.ts
git commit -m "$(cat <<'EOF'
feat(board): 주제→공공저작물 근거 수집 모듈(research)

네이버 웹검색 발견 + 도메인 1차필터 + 본문 추출 + 공공누리 게이트
+ 대표출처 collapse. 스니펫은 근거에 미전달, fetch 주입 가능.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 서버 액션 `generateFromTopicAction`

설정 가드 → (붙여넣기 또는 research) → `generateDraft(client, …, 'gpt-4.1')` → `createDraft` → 결과 매핑. `useActionState` 시그니처(`savePostAction`와 동일 결).

**Files:**
- Modify: `app/admin/posts/actions.ts` (상단 import 추가 + 파일 끝에 액션 추가)

- [ ] **Step 1: import 추가**

`app/admin/posts/actions.ts` 상단 import 블록(1~5행)에 추가:

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { redirect, notFound } from 'next/navigation';
import type { PostType, PostCategory } from '@prisma/client';
import { publishPostRow, rejectPostRow, updatePostRow, deletePostRow } from '@/lib/board/admin';
import { env } from '@/lib/env';
import { prisma } from '@/lib/db';
import { createOpenAiClient, generateDraft } from '@/lib/board/generate';
import { createDraft } from '@/lib/board/create-draft';
import { researchTopic, type SourceMeta } from '@/lib/board/research';
import { manualDedupeKey, manualSlug, kstDateISO } from '@/lib/board/manual-draft';
```

- [ ] **Step 2: 액션 본문 추가(파일 끝)**

`app/admin/posts/actions.ts` 끝에 추가:

```ts
export type TopicGenResult =
  | { status: 'created'; id: string }
  | { status: 'insufficient'; sources: SourceMeta[] }
  | { status: 'rejected'; violations: string[] }
  | { status: 'duplicate' }
  | { status: 'config_error' }
  | { status: 'error'; message: string };

/**
 * 주제를 받아 공공저작물 근거로 초안(DRAFT) 1건 생성. useActionState용 시그니처.
 * - topic은 검색어로만 쓰이고 generateDraft 프롬프트엔 전달하지 않는다(근거=수집 sourceText뿐).
 * - 근거 부족 시 status='insufficient' → 폼이 붙여넣기 폴백 노출.
 */
export async function generateFromTopicAction(
  _prev: TopicGenResult | null,
  fd: FormData,
): Promise<TopicGenResult> {
  if (!env.OPENAI_API_KEY) return { status: 'config_error' };

  const topic = String(fd.get('topic') ?? '').trim();
  if (!topic) return { status: 'error', message: '주제를 입력하세요.' };

  const pasted = String(fd.get('pastedSource') ?? '').trim();
  const pastedName = String(fd.get('pastedSourceName') ?? '').trim();
  const pastedUrl = String(fd.get('pastedSourceUrl') ?? '').trim();

  const now = new Date();
  const dateISO = kstDateISO(now);
  const dedupeKey = manualDedupeKey(topic, dateISO);

  try {
    let sourceName: string;
    let sourceUrl: string;
    let sourceDate: Date;
    let sourceText: string;
    let sourceExcerpt: string;

    if (pasted) {
      if (!pastedName || !pastedUrl) {
        return { status: 'error', message: '붙여넣기 시 출처 기관명과 URL을 함께 입력하세요.' };
      }
      sourceName = pastedName;
      sourceUrl = pastedUrl;
      sourceDate = now;
      sourceText = pasted;
      sourceExcerpt = `[출처: ${pastedName} · ${pastedUrl}]\n${pasted}`.slice(0, 4000);
    } else {
      const r = await researchTopic(topic, now);
      if (!r.grounded) return { status: 'insufficient', sources: r.candidates };
      sourceName = r.grounded.sourceName;
      sourceUrl = r.grounded.sourceUrl;
      sourceDate = r.grounded.sourceDate;
      sourceText = r.grounded.sourceText;
      sourceExcerpt = r.grounded.sourceExcerpt;
    }

    const client = createOpenAiClient(env.OPENAI_API_KEY);
    const gen = await generateDraft(client, { sourceText, sourceName }, 'gpt-4.1');

    const res = await createDraft({
      gen,
      sourceName,
      sourceUrl,
      sourceDate,
      sourceExcerpt,
      dedupeKey,
      dateISO,
      detectedFrom: `topic:${manualSlug(topic)}`,
    });

    if (res.status === 'created') {
      const row = await prisma.post.findUnique({ where: { dedupeKey }, select: { id: true } });
      revalidatePath('/admin/posts');
      return { status: 'created', id: String(row!.id) };
    }
    if (res.status === 'duplicate') return { status: 'duplicate' };
    return { status: 'rejected', violations: res.violations };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : '생성 실패' };
  }
}
```

- [ ] **Step 3: 타입체크**

Run: `pnpm typecheck`
Expected: 에러 없음(특히 `actions.ts` 관련). (서버 액션은 DB+OpenAI+네트워크 의존이라 단위테스트 대신 타입체크+빌드+Task 8 수동 스모크로 검증한다. 순수 로직은 Task 3에서 이미 테스트됨.)

- [ ] **Step 4: 커밋**

```bash
git add app/admin/posts/actions.ts
git commit -m "$(cat <<'EOF'
feat(board): generateFromTopicAction 서버 액션 추가

주제→research(또는 붙여넣기)→gpt-4.1 생성→DRAFT. 설정 가드,
useActionState 시그니처, topic은 프롬프트 미주입.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 어드민 폼 UI + 페이지 배선 + maxDuration

**Files:**
- Create: `app/admin/posts/new-post-form.tsx`
- Modify: `app/admin/posts/page.tsx` (import + maxDuration + 렌더)

- [ ] **Step 1: 폼 컴포넌트 작성**

Create `app/admin/posts/new-post-form.tsx`:

```tsx
'use client';
import { useState, useActionState } from 'react';
import Link from 'next/link';
import { generateFromTopicAction, type TopicGenResult } from './actions';

const card = 'mt-6 rounded-xl border border-[var(--color-line)] bg-white p-5';
const input = 'w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-base text-[var(--color-text)]';

export function NewPostForm() {
  const [topic, setTopic] = useState('');
  const [state, action, pending] = useActionState<TopicGenResult | null, FormData>(generateFromTopicAction, null);
  const showFallback = state?.status === 'insufficient';

  return (
    <form action={action} className={card}>
      <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">주제로 새 글 생성</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        주제를 입력하면 공공저작물(공공누리 이용가능)에서 근거를 모아 초안을 만듭니다. 근거를 못 찾으면 직접 붙여넣을 수 있습니다.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          name="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="예: 전세 사기 예방 제도"
          className={`${input} flex-1 min-w-[240px]`}
        />
        <button
          type="submit"
          disabled={pending || !topic.trim()}
          className="rounded-lg bg-[var(--color-blue)] px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {pending ? '검색·생성 중… (최대 1분)' : '생성'}
        </button>
      </div>

      {state?.status === 'created' && (
        <p className="mt-3 text-sm font-medium text-green-600">
          초안 생성됨 —{' '}
          <Link href={`/admin/posts/${state.id}`} className="underline">검수하러 가기 ↗</Link>
        </p>
      )}
      {state?.status === 'duplicate' && (
        <p className="mt-3 text-sm font-medium text-[var(--color-muted)]">오늘 같은 주제의 초안이 이미 있습니다.</p>
      )}
      {state?.status === 'config_error' && (
        <p className="mt-3 text-sm font-medium text-red-600">OPENAI_API_KEY 미설정 — 운영 환경변수를 확인하세요.</p>
      )}
      {state?.status === 'rejected' && (
        <p className="mt-3 text-sm font-medium text-red-600">가드레일 미통과: {state.violations.join(', ')}</p>
      )}
      {state?.status === 'error' && (
        <p className="mt-3 text-sm font-medium text-red-600">오류: {state.message}</p>
      )}

      {state?.status === 'insufficient' && (
        <div className="mt-3">
          <p className="text-sm font-medium text-[var(--color-muted)]">
            공공누리 이용가능 근거를 찾지 못했습니다. 아래에 공식 자료를 직접 붙여넣어 다시 생성하세요.
          </p>
          {state.sources.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-[var(--color-muted)]">
              {state.sources.map((s) => (
                <li key={s.url}>
                  {s.domain} · 공공누리 {s.koglType} · {s.usable ? '사용가능' : '배제'} — {s.url}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showFallback && (
        <div className="mt-3 flex flex-col gap-2">
          <input name="pastedSourceName" placeholder="출처 기관명 (예: 국토교통부)" className={input} />
          <input name="pastedSourceUrl" placeholder="출처 URL" className={input} />
          <textarea
            name="pastedSource"
            rows={10}
            placeholder="공식 자료 본문을 붙여넣으세요"
            className={`${input} font-mono text-sm`}
          />
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 2: 페이지에 배선 + maxDuration**

Modify `app/admin/posts/page.tsx`:

1) import 추가(상단):
```ts
import { NewPostForm } from './new-post-form';
```
2) `export const dynamic = 'force-dynamic';`(7행) 아래에 추가:
```ts
export const maxDuration = 60; // 동기 생성(검색+추출+gpt-4.1) 대비. Vercel 플랜 상한(Hobby 60s) 확인.
```
3) 제목 블록(`<h1>게시글 관리</h1>`이 든 `<div className="flex flex-wrap …">…</div>`) **바로 아래**에 `<NewPostForm />`를 렌더:
```tsx
      </div>

      <NewPostForm />

      <div className="mt-5 flex gap-2">
        {TABS.map((t) => (
```

- [ ] **Step 3: 타입체크 + 빌드**

Run: `pnpm typecheck`
Expected: 에러 없음

Run: `pnpm build`
Expected: 빌드 성공. `/admin/posts`가 동적(ƒ)으로 표시되고 빌드 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add app/admin/posts/new-post-form.tsx app/admin/posts/page.tsx
git commit -m "$(cat <<'EOF'
feat(board): 어드민 '주제로 새 글 생성' 폼 + 붙여넣기 폴백

useActionState 동기 폼, 결과/폴백 UI, /admin/posts에 배선,
maxDuration=60(페이지 세그먼트).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 자동 크론 빈도 축소 (매일 → 주 1회)

**Files:**
- Modify: `.github/workflows/generate-board-posts.yml:4-5`

- [ ] **Step 1: cron 변경**

`.github/workflows/generate-board-posts.yml`의 schedule 블록을 변경:

```yaml
on:
  schedule:
    - cron: '0 2 * * 1' # 매주 월요일 11:00 KST (청약 집계가 주 1회 cadence)
  workflow_dispatch:
```

(`generate-board-topic.yml`은 건드리지 않는다 — workflow_dispatch 전용, 변경 없음.)

- [ ] **Step 2: 변경 확인**

Run: `grep -n "cron:" .github/workflows/generate-board-posts.yml`
Expected: `- cron: '0 2 * * 1'` (월요일). 다른 cron 라인 없음.

- [ ] **Step 3: 커밋**

```bash
git add .github/workflows/generate-board-posts.yml
git commit -m "$(cat <<'EOF'
chore(board): 자동 글 생성 크론 매일→주 1회(월) 축소

수동 주제 생성이 주력. 자동은 슬로우데이 안전망으로 주 1회 유지.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 전체 검증 + 배포 체크리스트

코드 완료 후 전체 단위테스트 + 운영 전제조건 문서화 + 수동 스모크.

- [ ] **Step 1: 전체 단위테스트**

Run: `pnpm test:unit`
Expected: 신규 4개 파일 포함 전체 PASS, 기존 회귀 없음.

- [ ] **Step 2: 타입체크 + 린트**

Run: `pnpm typecheck && pnpm lint`
Expected: 에러 없음.

- [ ] **Step 3: 배포 전제조건(운영 Vercel env) — 수동, 사용자 작업**

다음을 Vercel Production env(서버 전용, `NEXT_PUBLIC_` 아님)에 추가해야 어드민 생성이 동작한다. 현재는 GitHub Actions Secret에만 존재.
- `OPENAI_API_KEY`
- `NAVER_SEARCH_CLIENT_ID`
- `NAVER_SEARCH_CLIENT_SECRET`

(모델은 액션에서 `'gpt-4.1'` 하드코딩이라 `OPENAI_MODEL`은 불필요. 미설정 시 액션이 `config_error`를 친절 반환하므로 앱 부팅 크래시는 없음 — lib/env.ts에서 셋 다 `.optional()`.)

- [ ] **Step 4: 로컬/프리뷰 수동 스모크(spike 확인 포함)**

`.env.local`에 OpenAI/네이버 키가 있으면 `pnpm dev`로 `/admin/posts` 접속(Basic Auth) 후:
1. 주제 입력(예: "디딤돌 대출") → [생성] → DRAFT 생성 + 검수 링크 동작 확인. **(spike: webkr가 go.kr/korea.kr를 반환하고 공공누리 마커가 잡히는지 실측)**
2. 근거가 안 잡히는 주제 → `insufficient` + 붙여넣기 폴백 노출 → 출처기관/URL/본문 입력 후 재생성 → DRAFT 생성 확인.
3. 같은 날 같은 주제 재생성 → `duplicate` 확인.

키가 로컬에 없으면 이 단계는 **프리뷰/운영 배포 후** 수행하고, 결과를 사용자에게 보고한다. spike 결과(웹검색·마커 실효)가 낮으면 `MIN_SOURCE_CHARS`·도메인 allowlist·`detectKoglType` 정규식을 튜닝하거나, 붙여넣기 폴백이 주 경로임을 사용자와 합의한다.

- [ ] **Step 5: (선택) PR 생성**

```bash
git push -u origin feat/board-topic-manual-generation
gh pr create --title "feat(board): 주제 입력형 게시글 생성(어드민) + 크론 축소" --body "$(cat <<'EOF'
## 요약
어드민이 주제만 입력하면 공공누리 이용가능 공공저작물에서 근거를 모아 gpt-4.1로 초안을 생성하고, 기존 검수 플로우로 게시한다. 자동 크론은 주 1회로 축소.

설계: docs/superpowers/specs/2026-06-23-board-topic-manual-generation-design.md
플랜: docs/superpowers/plans/2026-06-23-board-topic-manual-generation.md

## 배포 전제조건
Vercel Production env에 OPENAI_API_KEY / NAVER_SEARCH_CLIENT_ID / NAVER_SEARCH_CLIENT_SECRET 추가 필요.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review (작성자 점검 결과)

**1. 스펙 커버리지**
- §3 흐름(주제→검색→근거→생성→검수) → Task 4·5·6 ✅
- §4.1 2단계 게이트(도메인+공공누리) → Task 2·4 ✅
- §4.2 다중출처 collapse(대표 출처) → Task 4 `researchTopic` ✅
- §4.3 검수자 메타 노출(공공누리 유형) → `sourceExcerpt` 헤더(Task 4·5) + insufficient 소스 목록(Task 6) ✅
- §5 어드민 폼 + 폴백 → Task 6 ✅
- §6 신규/재사용 경계 + slug 규칙 → Task 1·3·4·5 ✅
- §7 크론 축소(파일 1개) → Task 7 ✅
- §8 env/모델/maxDuration → Task 5(가드·gpt-4.1 하드코딩)·6(maxDuration)·8(env 문서) ✅
- §9 성공기준 단위테스트(도메인·unknown 배제·스니펫 비전재) → Task 2·4 ✅
- **의도적 deferral:** §4.1 ③ DB 소스 → 스코프 경계에 명시(후속 과제). 폴백이 공백 보완.

**2. Placeholder 스캔:** 모든 코드 스텝에 실제 코드 포함. TBD/TODO 없음.

**3. 타입 일관성:** `KoglType`(source-policy) → research/SourceMeta에서 동일 사용. `TopicGenResult`/`SourceMeta`는 actions가 research에서 import. `generateDraft(client,{sourceText,sourceName},model)`·`createDraft(CreateDraftInput)`·`runGuardrails`·`normalizeName`·`htmlToText` 시그니처 모두 실제 코드와 대조 완료. `useActionState<TopicGenResult|null, FormData>` ↔ 액션 `(_prev: TopicGenResult|null, fd: FormData)` 일치.
