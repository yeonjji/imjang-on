# L7 Plan 2 — Guide 생성 도구 (seeds·slug·generator·draft) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** AI로 상록 가이드 초안을 만드는 **생성 도구**를 만든다 — 유한한 주제 시드, evergreen slug, board의 LLM 래퍼를 재사용한 가이드 전용 생성기, 그리고 LLM 결과를 `Guide` insert 형태로 조립하는 순수 함수. 전부 DB 없이 단위 테스트.

**Architecture:** 4개 순수/주입형 모듈. `lib/guide/seeds.ts`(주제 시드 + 검증) → `lib/guide/generate.ts`(board의 `OpenAiLike`/`createOpenAiClient` 재사용, 가이드 프롬프트로 `{title,summary,body}` 생성) → `lib/guide/draft.ts`(시드 + LLM 결과 → `Guide` insert 객체 조립, slug·dedupeKey·출처·DRAFT). slug는 `lib/guide/slug.ts`(evergreen, 날짜 없음). 쿼리·admin·라우트는 후속 플랜.

**Tech Stack:** vitest(`tests/lib`, CI `test:unit`, `globals:false`, alias `@`→root), OpenAI(주입형 `OpenAiLike`로 목 테스트 — board와 동일), Prisma 타입(`@prisma/client`의 `GuideCategory`).

> **설계 출처:** `docs/adsense/guide-system-design.md` §3·§7. **선행:** Plan 1(Guide 모델·`GuideCategory`·가드레일·매핑 — 완료). **후속:** Plan 3(/admin/guides + 쿼리) · Plan 4(/guide 라우트 + 사이트맵 + JSON-LD + POI 배선).

---

## File Structure
- **Create:** `lib/guide/slug.ts` — `buildGuideSlug(title, suffix?)`.
- **Create:** `lib/guide/seeds.ts` — `GuideSeed` 타입 + `GUIDE_SEEDS` 시드 배열 + `validateGuideSeeds()`.
- **Create:** `lib/guide/generate.ts` — `generateGuideDraft(client, input, model)` (+ board `OpenAiLike`/`createOpenAiClient` 재사용).
- **Create:** `lib/guide/draft.ts` — `buildGuideDraft(seed, llm)` 순수 조립.
- **Create:** `tests/lib/guide-slug.test.ts`, `tests/lib/guide-seeds.test.ts`, `tests/lib/guide-generate.test.ts`, `tests/lib/guide-draft.test.ts`.

## 배경(엔지니어용)
- board의 재사용 헬퍼: `import { type OpenAiLike, createOpenAiClient } from '@/lib/board/generate';` — `OpenAiLike`는 `{ chat: { completions: { create } } }` 주입형 인터페이스(목으로 테스트). `import { normalizeName } from '@/lib/slug';`(이미 존재) — 한글/공백 정규화.
- 목 패턴(board 테스트와 동일): `fakeClient(payload) = { chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }) } } }`.
- `Guide` 모델 필드(Plan 1): slug·title·summary·body·category(`GuideCategory`)·status(`PostStatus` 기본 DRAFT)·sourceName·sourceUrl·sourceDate(Date)·sourceExcerpt·dedupeKey·generatedAt·…
- **가이드 vs board:** 가이드는 evergreen 해설·하우투 **허용**, 단 과장·시세전망·투자권유 금지·출처표기 필수(Plan 1 `runGuideGuardrails`가 게이트, 본 플랜은 생성만). slug는 날짜 prefix 없음(상록).

---

## Task 1: `buildGuideSlug` (TDD)

**Files:** Create `lib/guide/slug.ts`, `tests/lib/guide-slug.test.ts`

- [ ] **Step 1: 실패 테스트** — `tests/lib/guide-slug.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildGuideSlug } from '@/lib/guide/slug';

describe('buildGuideSlug', () => {
  it('제목을 정규화한 evergreen slug(날짜 없음)를 만든다', () => {
    const s = buildGuideSlug('야간·공휴일 약국 찾는 법');
    expect(s).not.toMatch(/^\d{4}-\d{2}-\d{2}/); // board와 달리 날짜 prefix 없음
    expect(s.length).toBeGreaterThan(0);
    expect(s).not.toContain(' ');
  });
  it('충돌 시 suffix(>=2)를 붙인다', () => {
    const base = buildGuideSlug('전세가율 이해하기');
    expect(buildGuideSlug('전세가율 이해하기', 2)).toBe(`${base}-2`);
    expect(buildGuideSlug('전세가율 이해하기', 1)).toBe(base); // 1은 무접미
  });
});
```

- [ ] **Step 2: 실행 → 실패** — `pnpm exec vitest run tests/lib/guide-slug.test.ts` → FAIL(모듈 없음).

- [ ] **Step 3: 구현** — `lib/guide/slug.ts`:

```ts
import { normalizeName } from '@/lib/slug';

/** 상록 가이드 slug: 제목 정규화(60자 컷). board와 달리 날짜 prefix 없음(evergreen). 충돌 시 suffix(>=2). */
export function buildGuideSlug(title: string, suffix?: number): string {
  const base = normalizeName(title).slice(0, 60);
  return suffix && suffix >= 2 ? `${base}-${suffix}` : base;
}
```

- [ ] **Step 4: 실행 → 통과** — `pnpm exec vitest run tests/lib/guide-slug.test.ts` → PASS.
- [ ] **Step 5: 커밋**
  ```bash
  git add lib/guide/slug.ts tests/lib/guide-slug.test.ts
  git commit -m "feat(guide): evergreen slug 생성 (L7-2)"
  ```

## Task 2: 주제 시드 + 검증 (TDD)

**Files:** Create `lib/guide/seeds.ts`, `tests/lib/guide-seeds.test.ts`

- [ ] **Step 1: 실패 테스트** — `tests/lib/guide-seeds.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GUIDE_SEEDS, validateGuideSeeds } from '@/lib/guide/seeds';
import { GuideCategory } from '@prisma/client';

describe('guide seeds', () => {
  it('시드 키가 고유하고 모든 카테고리를 최소 1개 덮는다', () => {
    expect(validateGuideSeeds()).toEqual({ ok: true, errors: [] });
  });
  it('각 시드는 카테고리·주제·출처를 갖는다', () => {
    for (const s of GUIDE_SEEDS) {
      expect(Object.values(GuideCategory)).toContain(s.category);
      expect(s.key.length).toBeGreaterThan(0);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.source.name.length).toBeGreaterThan(0);
      expect(s.source.url).toMatch(/^https?:\/\//);
    }
  });
});
```

- [ ] **Step 2: 실행 → 실패** — `pnpm exec vitest run tests/lib/guide-seeds.test.ts` → FAIL(모듈 없음).

- [ ] **Step 3: 구현** — `lib/guide/seeds.ts`(스타터 세트 — 7개 카테고리 전부 ≥1 덮음. 운영에서 카테고리당 2~3개로 확장):

```ts
import { GuideCategory } from '@prisma/client';

export interface GuideSeed {
  key: string;            // dedupeKey(고유). 재생성 방지.
  category: GuideCategory;
  title: string;          // 가이드 제목(상록)
  angle: string;          // 생성 프롬프트에 줄 서술 방향
  source: { name: string; url: string; date: string; excerpt: string }; // 근거(출처) — 필수
}

// 지역 곱 금지: 주제별 고유 1편. 운영에서 카테고리당 2~3개로 확장.
export const GUIDE_SEEDS: GuideSeed[] = [
  {
    key: 'medical-night-holiday-pharmacy',
    category: GuideCategory.MEDICAL,
    title: '야간·공휴일에 문 여는 약국·병원 찾는 법',
    angle: '심야·공휴일에 이용 가능한 약국과 병원을 찾는 공식 경로(응급의료포털 등)와 확인 절차를 단계별로 설명한다.',
    source: { name: '보건복지부 응급의료포털', url: 'https://www.e-gen.or.kr', date: '2026-01-01', excerpt: '전국 병원·약국 운영시간 및 야간·공휴일 운영 정보 제공.' },
  },
  {
    key: 'childcare-types-and-choosing',
    category: GuideCategory.CHILDCARE,
    title: '어린이집 유형과 고르는 법',
    angle: '국공립·민간·가정 등 어린이집 유형의 차이와 입소 대기·보육료 지원의 일반 구조를 설명한다.',
    source: { name: '보건복지부 어린이집정보공개포털', url: 'https://info.childcare.go.kr', date: '2026-01-01', excerpt: '어린이집 유형·정원·평가 정보 공개.' },
  },
  {
    key: 'school-district-assignment',
    category: GuideCategory.SCHOOL,
    title: '학군과 학교 배정 이해하기',
    angle: '초·중학교 학교군/통학구역 배정의 일반 원리와 확인 방법을 설명한다.',
    source: { name: '교육부 학교알리미', url: 'https://www.schoolinfo.go.kr', date: '2026-01-01', excerpt: '학교별 학구·현황 정보 공개.' },
  },
  {
    key: 'realestate-read-transaction-price',
    category: GuideCategory.REALESTATE,
    title: '실거래가, 어떻게 읽어야 할까',
    angle: '국토부 실거래가의 의미, 호가와의 차이, 면적·층·계약일을 함께 봐야 하는 이유를 설명한다.',
    source: { name: '국토교통부 실거래가 공개시스템', url: 'https://rt.molit.go.kr', date: '2026-01-01', excerpt: '아파트·연립·오피스텔 등 실거래 신고가 공개.' },
  },
  {
    key: 'subscription-eligibility-points',
    category: GuideCategory.SUBSCRIPTION,
    title: '청약 자격과 가점제 이해하기',
    angle: '주택청약 자격 요건과 가점제(무주택기간·부양가족·청약통장 가입기간)의 일반 구조를 설명한다.',
    source: { name: '한국부동산원 청약홈', url: 'https://www.applyhome.co.kr', date: '2026-01-01', excerpt: '청약 자격·가점·일정 안내.' },
  },
  {
    key: 'finance-jeonse-guarantee-limit',
    category: GuideCategory.FINANCE,
    title: '전세보증금 반환보증 한도 이해하기',
    angle: '전세보증금 반환보증의 목적과 한도가 정해지는 일반 원리, 신청 시 확인할 점을 설명한다.',
    source: { name: '주택도시보증공사(HUG)', url: 'https://www.khug.or.kr', date: '2026-01-01', excerpt: '전세보증금 반환보증 상품·한도 안내.' },
  },
  {
    key: 'life-subway-access',
    category: GuideCategory.LIFE,
    title: '역세권, 무엇을 따져봐야 할까',
    angle: '도보 거리·환승·노선 등 역세권을 판단할 때 고려하는 일반 기준을 설명한다.',
    source: { name: '국가철도공단', url: 'https://www.kr.or.kr', date: '2026-01-01', excerpt: '전국 철도역 위치·노선 정보.' },
  },
];

export function validateGuideSeeds(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const s of GUIDE_SEEDS) {
    if (keys.has(s.key)) errors.push(`중복 key: ${s.key}`);
    keys.add(s.key);
  }
  const covered = new Set(GUIDE_SEEDS.map((s) => s.category));
  for (const c of Object.values(GuideCategory)) {
    if (!covered.has(c)) errors.push(`카테고리 미커버: ${c}`);
  }
  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 4: 실행 → 통과** — `pnpm exec vitest run tests/lib/guide-seeds.test.ts` → PASS.
- [ ] **Step 5: 커밋**
  ```bash
  git add lib/guide/seeds.ts tests/lib/guide-seeds.test.ts
  git commit -m "feat(guide): 주제 시드 + 검증(카테고리 전수 커버·키 고유) (L7-2)"
  ```

## Task 3: 가이드 생성기 (TDD, 주입형 LLM)

**Files:** Create `lib/guide/generate.ts`, `tests/lib/guide-generate.test.ts`

- [ ] **Step 1: 실패 테스트** — `tests/lib/guide-generate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateGuideDraft } from '@/lib/guide/generate';
import { type OpenAiLike } from '@/lib/board/generate';
import { GuideCategory } from '@prisma/client';

function fakeClient(payload: object): OpenAiLike {
  return { chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }) } } };
}

const input = {
  category: GuideCategory.REALESTATE,
  topic: '실거래가, 어떻게 읽어야 할까',
  angle: '실거래가의 의미와 호가와의 차이를 설명한다.',
  sourceText: '국토부 실거래가 공개시스템 안내문 원문',
  sourceName: '국토교통부 실거래가 공개시스템',
};

describe('generateGuideDraft', () => {
  it('구조화 응답을 파싱해 title/summary/body로 돌려준다', async () => {
    const payload = { title: '실거래가 읽는 법', summary: '실거래가의 의미를 설명', body: '## 실거래가란\n본문 '.repeat(80) };
    const res = await generateGuideDraft(fakeClient(payload), input, 'gpt-4.1-mini');
    expect(res.title).toBe('실거래가 읽는 법');
    expect(res.summary.length).toBeGreaterThan(0);
    expect(res.body.length).toBeGreaterThan(0);
  });
  it('빈 응답이면 에러', async () => {
    const empty: OpenAiLike = { chat: { completions: { create: async () => ({ choices: [{ message: { content: null } }] }) } } };
    await expect(generateGuideDraft(empty, input, 'm')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 실행 → 실패** — `pnpm exec vitest run tests/lib/guide-generate.test.ts` → FAIL(모듈 없음).

- [ ] **Step 3: 구현** — `lib/guide/generate.ts`:

```ts
import type { GuideCategory } from '@prisma/client';
import type { OpenAiLike } from '@/lib/board/generate';

export interface GenerateGuideInput {
  category: GuideCategory;
  topic: string;
  angle: string;
  sourceText: string;
  sourceName: string;
}
export interface GenerateGuideResult { title: string; summary: string; body: string }

const GUIDE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'body'],
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    body: { type: 'string' },
  },
} as const;

// board(뉴스)와 달리 해설·하우투를 허용하되, 과장·시세전망·투자권유는 금지하고 출처를 밝힌다.
const SYSTEM_PROMPT = `당신은 공공데이터를 바탕으로 부동산·생활 정보를 쉽게 풀어 설명하는 한국어 가이드 작성자다.
독자가 끝까지 읽는 한 편의 '상록(evergreen) 설명 글'을 쓴다. 특정 날짜의 뉴스가 아니라, 언제 읽어도 유효한 개념·절차·유의점을 설명한다.

[허용 — 가이드 장르]
1. 개념 풀이, 단계별 방법(how-to), 일반적으로 알려진 유의점·비교를 문장으로 설명한다.

[금지 — 반드시 지킨다]
2. 집값·시세의 상승/하락 단정 전망을 쓰지 않는다("오를 것/내릴 것/급등/유망" 등 금지).
3. 매수·매도 권유나 투자 조언("지금이 기회/사두면/추천" 등)을 쓰지 않는다.
4. "무조건/보장/확실히 이득/최고의" 같은 과장 표현을 쓰지 않는다.
5. 제공된 근거 자료의 사실 범위를 벗어나는 구체 수치·고유 사실을 지어내지 않는다. 일반 원리는 풀어 쓰되, 특정 수치는 자료에 있는 것만.

[작법]
6. 리드 문단으로 시작하고 문단 중심 산문으로 쓴다. 소제목(## )은 흐름에 따라 자유롭게.
7. 분량은 공백 제외 한글 최소 1,000자(2,000자 안팎).
8. 마지막에 출처와 기준을 한 줄로 밝힌다.

[출력] body는 마크다운. title은 25자 내외, summary는 한 문장 요약.`;

function buildUserPrompt(input: GenerateGuideInput): string {
  return `주제: ${input.topic}\n서술 방향: ${input.angle}\n\n다음은 '${input.sourceName}'의 근거 자료다. 이 자료의 사실 범위 안에서 일반 개념·절차를 풀어 설명하라.\n\n=== 근거 자료 시작 ===\n${input.sourceText}\n=== 근거 자료 끝 ===`;
}

export async function generateGuideDraft(
  client: OpenAiLike,
  input: GenerateGuideInput,
  model: string,
): Promise<GenerateGuideResult> {
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(input) },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'guide_article', strict: true, schema: GUIDE_JSON_SCHEMA } },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('generateGuideDraft: empty completion');
  return JSON.parse(content) as GenerateGuideResult;
}
```

- [ ] **Step 4: 실행 → 통과** — `pnpm exec vitest run tests/lib/guide-generate.test.ts` → PASS.
- [ ] **Step 5: 타입체크** — `pnpm typecheck` → 에러 없음(board `OpenAiLike` import 정상).
- [ ] **Step 6: 커밋**
  ```bash
  git add lib/guide/generate.ts tests/lib/guide-generate.test.ts
  git commit -m "feat(guide): 가이드 전용 생성기(해설 허용·금지 프롬프트, board OpenAiLike 재사용) (L7-2)"
  ```

## Task 4: `buildGuideDraft` 조립 (TDD)

**Files:** Create `lib/guide/draft.ts`, `tests/lib/guide-draft.test.ts`

- [ ] **Step 1: 실패 테스트** — `tests/lib/guide-draft.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildGuideDraft } from '@/lib/guide/draft';
import { GUIDE_SEEDS } from '@/lib/guide/seeds';
import { GuideCategory } from '@prisma/client';

const seed = GUIDE_SEEDS.find((s) => s.category === GuideCategory.REALESTATE)!;
const llm = { title: '실거래가 읽는 법', summary: '요약', body: '본문 '.repeat(200) };

describe('buildGuideDraft', () => {
  it('시드+LLM 결과를 Guide insert 객체로 조립한다', () => {
    const d = buildGuideDraft(seed, llm);
    expect(d.category).toBe(seed.category);
    expect(d.dedupeKey).toBe(seed.key);            // 재생성 방지 키 = 시드 키
    expect(d.title).toBe('실거래가 읽는 법');
    expect(d.slug.length).toBeGreaterThan(0);
    expect(d.sourceName).toBe(seed.source.name);
    expect(d.sourceUrl).toBe(seed.source.url);
    expect(d.sourceDate).toBeInstanceOf(Date);      // ISO → Date 변환
    expect(d.sourceExcerpt).toBe(seed.source.excerpt);
  });
});
```

- [ ] **Step 2: 실행 → 실패** — `pnpm exec vitest run tests/lib/guide-draft.test.ts` → FAIL(모듈 없음).

- [ ] **Step 3: 구현** — `lib/guide/draft.ts`:

```ts
import type { GuideCategory } from '@prisma/client';
import type { GuideSeed } from '@/lib/guide/seeds';
import type { GenerateGuideResult } from '@/lib/guide/generate';
import { buildGuideSlug } from '@/lib/guide/slug';

/** prisma.guide.create({ data }) 에 넣을 수 있는 형태(status는 기본 DRAFT라 생략). */
export interface GuideDraftData {
  slug: string;
  title: string;
  summary: string;
  body: string;
  category: GuideCategory;
  sourceName: string;
  sourceUrl: string;
  sourceDate: Date;
  sourceExcerpt: string;
  dedupeKey: string;
}

/** 시드 + LLM 결과를 Guide insert 객체로 조립한다(순수). dedupeKey=시드 key로 재생성 방지. */
export function buildGuideDraft(seed: GuideSeed, llm: GenerateGuideResult): GuideDraftData {
  return {
    slug: buildGuideSlug(llm.title),
    title: llm.title,
    summary: llm.summary,
    body: llm.body,
    category: seed.category,
    sourceName: seed.source.name,
    sourceUrl: seed.source.url,
    sourceDate: new Date(seed.source.date),
    sourceExcerpt: seed.source.excerpt,
    dedupeKey: seed.key,
  };
}
```

- [ ] **Step 4: 실행 → 통과** — `pnpm exec vitest run tests/lib/guide-draft.test.ts` → PASS.
- [ ] **Step 5: 타입체크 + 전체 단위** — `pnpm typecheck` 클린, `pnpm test:unit` 그린(신규 4개 테스트 포함).
- [ ] **Step 6: 커밋**
  ```bash
  git add lib/guide/draft.ts tests/lib/guide-draft.test.ts
  git commit -m "feat(guide): 시드+LLM→Guide insert 객체 조립 (L7-2)"
  ```

## Verification
- `pnpm test:unit` 그린(slug·seeds·generate·draft 4개 테스트 포함).
- `pnpm typecheck` 클린.
- 생성 도구 완성: 시드 → `generateGuideDraft`(LLM) → `buildGuideDraft` → `prisma.guide.create({data})`(쿼리는 Plan 3에서 배선).

## Out of scope (후속)
- **Plan 3:** `lib/guide/queries.ts`(listPublishedGuides·getGuideBySlug·getGuidesByCategory) + `/admin/guides`(목록·에디터·검수 액션) + 생성 스크립트(`scripts/...`로 시드 순회·`createOpenAiClient` 호출·DRAFT 저장).
- **Plan 4:** `/guide` 공개 라우트 + 사이트맵 guide 소스 + JSON-LD(Article/Breadcrumb) + 나브 + POI "관련 가이드" 블록.
- 실제 본문 25–40편 집필·검수(운영) · 운영 DB 반영(머지 전 수동 `prisma:deploy`).
