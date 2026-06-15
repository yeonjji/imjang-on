# 자동 게시판 — 플랜 3a: 썸네일 B + 생성 코어 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** ① OG 브랜드 카드를 실제 이미지로 재활용(리스트 썸네일 + 상세 대표이미지 + JSON-LD image), ② 주어진 공공자료 텍스트로부터 OpenAI Structured Outputs로 글을 분류·생성하고 가드레일을 통과한 DRAFT를 만드는 "생성 코어"를 구현한다. **외부 피드 수집·뉴스 탐지·크론은 플랜 3b**.

**Architecture:** 썸네일은 안정 URL을 가진 별도 이미지 route handler로 만든다(메타데이터 opengraph-image는 해시 URL이라 `<img>`에 직접 못 씀). 생성 코어는 외부 I/O를 주입받는 순수 함수로 설계해 TDD한다 — `generateDraft(client, input, model)`에 OpenAI 호환 client를 주입하면 가짜 client로 비용 없이 단위 테스트가 가능하다. 가드레일(금지표현·분량·출처)은 별도 순수 모듈.

**Tech Stack:** Next.js 15 (`next/og` ImageResponse), OpenAI Node SDK(Structured Outputs), Prisma 5, vitest.

> 전체 플랜: 1(모델+공개) ✅ · 2(어드민) ✅ · **3a(썸네일+생성코어)** · 3b(수집·오케스트레이션·크론). 브랜치 `feat/auto-board`. 설계: `docs/superpowers/specs/2026-06-15-auto-board-content-pipeline-design.md`, 결정: 메모리 `project_auto_board`.

## 전제

- `Post` 모델·enum, `lib/board/{labels,post,admin}.ts`, 공개/어드민 페이지는 플랜 1·2에서 구현됨.
- `lib/seo/og.tsx`: `OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, OgFrame`. 폰트는 `next.config.mjs`의 `outputFileTracingIncludes('**/opengraph-image')`로 번들됨 — **새 thumbnail 라우트는 이 글롭에 안 걸리므로 Task 1에서 글롭을 보강**한다.
- `lib/slug.ts`: `normalizeName(input)` (공백·기호 제거, 소문자, NFC. 한글 보존).
- 테스트: `pnpm exec dotenv -e .env.test -- vitest run tests/...`. DB 테스트는 `assertLocalDatabase()`.
- 비밀키는 GitHub Actions Secret에 등록됨(OPENAI_API_KEY, NAVER_SEARCH_*). **로컬 생성 단위 테스트는 가짜 client로 키 없이 돈다.**

---

## Phase 0 — 썸네일 B

### Task 1: 안정 URL 썸네일 이미지 라우트

**Files:**
- Create: `app/(public)/board/[slug]/thumbnail/route.tsx`
- Modify: `next.config.mjs` (tracing 글롭에 thumbnail 포함)

- [ ] **Step 1: 라우트 핸들러 구현** — `app/(public)/board/[slug]/thumbnail/route.tsx`:
```tsx
import { ImageResponse } from 'next/og';
import { OG_SIZE, loadOgFonts, OgFrame } from '@/lib/seo/og';
import { getPublishedPostBySlug } from '@/lib/board/post';
import { categoryLabel } from '@/lib/board/labels';

export const runtime = 'nodejs';
export const revalidate = 86_400;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug).catch(() => null);
  const title = post?.title ?? '임장온 소식';
  const subtitle = post ? categoryLabel(post.category) : '공공데이터 부동산';
  return new ImageResponse(<OgFrame title={title} subtitle={subtitle} />, {
    ...OG_SIZE,
    fonts: await loadOgFonts(),
  });
}
```
> 메타데이터용 `opengraph-image.tsx`(해시 URL)와 달리, 이 route handler는 `/board/{slug}/thumbnail`이라는 **고정 URL**로 서빙돼 `<img src>`에 직접 쓸 수 있다.

- [ ] **Step 2: 폰트 트레이싱 글롭 보강** — `next.config.mjs`의 `outputFileTracingIncludes`를 두 키로 확장:
```js
  outputFileTracingIncludes: {
    '**/opengraph-image': ['./lib/seo/fonts/Pretendard-Bold.otf'],
    '**/thumbnail': ['./lib/seo/fonts/Pretendard-Bold.otf'],
  },
```

- [ ] **Step 3: 빌드 확인** — Run: `pnpm build`. Expect exit 0, route table에 `/board/[slug]/thumbnail` 표시. 빌드 후 트레이스 확인:
`find .next -path '*board*thumbnail*' -name '*.nft.json' -exec grep -l Pretendard {} \;` → 결과 있어야 함(폰트 포함).

- [ ] **Step 4: 커밋** — `git add "app/(public)/board/[slug]/thumbnail/route.tsx" next.config.mjs && git commit -m "feat(board): 안정 URL 썸네일 이미지 라우트"`

---

### Task 2: 리스트 썸네일 + 상세 대표이미지 + JSON-LD image

**Files:**
- Modify: `app/(public)/board/page.tsx` (카드 상단 `<img>`)
- Modify: `app/(public)/board/[slug]/page.tsx` (대표이미지 + articleSchema image)
- Modify: `lib/seo/json-ld.tsx` (articleSchema에 image 추가)
- Modify: `tests/lib/json-ld-article.test.ts` (image 단언 추가)

- [ ] **Step 1: articleSchema에 image 필드 추가 (TDD)** — `tests/lib/json-ld-article.test.ts`의 기존 테스트 케이스 객체에 `image: 'https://imjangon.co.kr/board/test/thumbnail'`를 추가하고, 단언 추가:
```ts
    expect(s.image).toBe('https://imjangon.co.kr/board/test/thumbnail');
```
Run → FAIL(image undefined). 그다음 `lib/seo/json-ld.tsx`의 `articleSchema` 입력 타입에 `image: string`을 추가하고 반환 객체에 `image: input.image,`를 넣는다. Run → PASS.

- [ ] **Step 2: 리스트 카드에 썸네일 `<img>`** — `app/(public)/board/page.tsx`의 카드 `<Link>` 내부, 카테고리 뱃지 `<span>` **위**에 추가:
```tsx
              <img
                src={`/board/${p.slug}/thumbnail`}
                alt=""
                width={1200}
                height={630}
                loading="lazy"
                className="mb-3 aspect-[1200/630] w-full rounded-[14px] border border-[var(--color-line)] object-cover"
              />
```

- [ ] **Step 3: 상세 대표이미지 + image 스키마 연결** — `app/(public)/board/[slug]/page.tsx`:
  - `articleSchema({...})` 호출에 `image: \`${SITE_URL}/board/${post.slug}/thumbnail\`,` 추가.
  - 카테고리 뱃지 `<span>` 위(또는 제목 아래)에 대표이미지 추가:
```tsx
      <img
        src={`/board/${post.slug}/thumbnail`}
        alt={post.title}
        width={1200}
        height={630}
        className="mb-6 aspect-[1200/630] w-full rounded-[18px] border border-[var(--color-line)] object-cover"
      />
```
  배치는 제목·기준일 블록 다음, 본문 `board-prose` 앞이 자연스럽다.

- [ ] **Step 4: 검증** — Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/json-ld-article.test.ts && pnpm typecheck && pnpm lint`. 모두 통과.
  - eslint가 `<img>` 대신 `next/image`를 요구하면(`@next/next/no-img-element`): 이 이미지는 동적 OG 라우트라 next/image 최적화 대상이 아니므로, 해당 두 `<img>` 줄에 `{/* eslint-disable-next-line @next/next/no-img-element */}`를 바로 위에 붙여 예외 처리(기존 프로젝트도 동적 이미지에 이 패턴 사용). lint 0 만들 것.

- [ ] **Step 5: 커밋** — `git add "app/(public)/board/page.tsx" "app/(public)/board/[slug]/page.tsx" lib/seo/json-ld.tsx tests/lib/json-ld-article.test.ts && git commit -m "feat(board): 리스트 썸네일 + 상세 대표이미지 + JSON-LD image (옵션 B)"`

---

## Phase 1 — 생성 코어

### Task 3: 의존성 + 환경변수

**Files:**
- Modify: `package.json` (openai)
- Modify: `lib/env.ts`

- [ ] **Step 1: openai SDK 설치** — Run: `pnpm add openai`. 확인: `node -e "require('openai')"` 에러 없음(또는 ESM이면 import 확인).

- [ ] **Step 2: env 스키마 확장** — `lib/env.ts`의 `schema` 객체에 추가(기존 NAVER_MAP 줄 근처):
```ts
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
  NAVER_SEARCH_CLIENT_ID: z.string().optional(),
  NAVER_SEARCH_CLIENT_SECRET: z.string().optional(),
```

- [ ] **Step 3: 검증** — Run: `pnpm typecheck`. 0 errors. Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/env.test.ts` (기존 env 테스트 통과 유지).

- [ ] **Step 4: 커밋** — `git add package.json pnpm-lock.yaml lib/env.ts && git commit -m "chore(board): openai SDK + 생성 파이프라인 env 키"`

---

### Task 4: 가드레일 (`lib/board/guardrails.ts`, TDD)

생성문이 사실·중립 원칙을 지키는지 코드로 강제. 순수 함수.

**Files:**
- Create: `lib/board/guardrails.ts`
- Test: `tests/lib/board-guardrails.test.ts`

- [ ] **Step 1: 실패 테스트** — `tests/lib/board-guardrails.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { findForbiddenPhrases, checkLength, runGuardrails } from '@/lib/board/guardrails';

describe('findForbiddenPhrases', () => {
  it('의견·전망성 표현을 잡아낸다', () => {
    expect(findForbiddenPhrases('상승할 것으로 보입니다.')).toContain('보입니다');
    expect(findForbiddenPhrases('하락 가능성이 있습니다.').length).toBeGreaterThan(0);
    expect(findForbiddenPhrases('오를 것으로 예상됩니다.').length).toBeGreaterThan(0);
    expect(findForbiddenPhrases('전문가 추천 매물입니다.').length).toBeGreaterThan(0);
  });
  it('중립적 사실 서술은 통과한다', () => {
    expect(findForbiddenPhrases('국토교통부는 6월 12일 한도를 상향했다고 발표했다.')).toEqual([]);
  });
});

describe('checkLength', () => {
  it('범위 안이면 ok', () => {
    expect(checkLength('가'.repeat(1600)).ok).toBe(true);
  });
  it('너무 짧으면 실패', () => {
    expect(checkLength('가'.repeat(500)).ok).toBe(false);
  });
});

describe('runGuardrails', () => {
  it('출처 누락이면 위반', () => {
    const r = runGuardrails({ body: '가'.repeat(1600), sourceName: '', sourceUrl: 'https://x' });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('출처'))).toBe(true);
  });
  it('금지표현 있으면 위반', () => {
    const r = runGuardrails({ body: '가'.repeat(1600) + ' 상승할 것으로 보입니다.', sourceName: '국토부', sourceUrl: 'https://x' });
    expect(r.ok).toBe(false);
  });
  it('정상 글은 통과', () => {
    const r = runGuardrails({ body: '국토교통부는 한도를 상향했다고 발표했다. '.repeat(80), sourceName: '국토부', sourceUrl: 'https://x' });
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run the file → FAIL(module missing).

- [ ] **Step 3: 구현** — `lib/board/guardrails.ts`:
```ts
// 의견·전망·추천성 표현 금지(프로젝트 원칙 3·4). 사실/중립 서술만 허용.
const FORBIDDEN_PATTERNS: { label: string; re: RegExp }[] = [
  { label: '보입니다', re: /보입니다|보인다/ },
  { label: '가능성이 있', re: /가능성이\s*(높|있|크)/ },
  { label: '예상됩니다', re: /예상(됩니다|된다|되며)/ },
  { label: '전망', re: /전망(이다|입니다|된다|이며|성)/ },
  { label: '추천', re: /추천(합니다|드립니다|한다)/ },
  { label: '것으로 보', re: /것으로\s*(보|예상|전망)/ },
  { label: '유망', re: /유망(하다|합니다|한)/ },
];

export function findForbiddenPhrases(text: string): string[] {
  return FORBIDDEN_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
}

export function checkLength(body: string, min = 1500, max = 2200): { ok: boolean; length: number } {
  const length = body.replace(/\s/g, '').length; // 공백 제외 글자 수
  return { ok: length >= min && length <= max, length };
}

export interface GuardrailInput {
  body: string;
  sourceName: string;
  sourceUrl: string;
}
export interface GuardrailResult {
  ok: boolean;
  violations: string[];
}

export function runGuardrails(input: GuardrailInput): GuardrailResult {
  const violations: string[] = [];
  if (!input.sourceName.trim() || !input.sourceUrl.trim()) violations.push('출처(sourceName/sourceUrl) 누락');
  const forbidden = findForbiddenPhrases(input.body);
  if (forbidden.length) violations.push(`금지표현: ${forbidden.join(', ')}`);
  const len = checkLength(input.body);
  if (!len.ok) violations.push(`분량 범위 벗어남(${len.length}자)`);
  return { ok: violations.length === 0, violations };
}
```
> 분량 상한은 마크다운 표/기호 여유로 2200으로 둔다(공백 제외 글자 기준). min은 동향형 짧은 글도 고려해 1500 유지하되, Task 6에서 TREND는 min을 낮춰 호출할 수 있게 `checkLength`에 인자를 노출했다.

- [ ] **Step 4: 통과 확인** — Run the file → PASS.

- [ ] **Step 5: 커밋** — `git add lib/board/guardrails.ts tests/lib/board-guardrails.test.ts && git commit -m "feat(board): 생성문 가드레일(금지표현·분량·출처)"`

---

### Task 5: 게시글 slug 생성 (`lib/board/slug.ts`, TDD)

**Files:**
- Create: `lib/board/slug.ts`
- Test: `tests/lib/board-slug.test.ts`

- [ ] **Step 1: 실패 테스트** — `tests/lib/board-slug.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildBoardSlug } from '@/lib/board/slug';

describe('buildBoardSlug', () => {
  it('날짜 + 정규화 제목으로 만든다', () => {
    expect(buildBoardSlug('디딤돌 대출 한도 상향!', '2026-06-15')).toBe('2026-06-15-디딤돌대출한도상향');
  });
  it('긴 제목은 자른다', () => {
    const s = buildBoardSlug('가'.repeat(100), '2026-06-15');
    expect(s.length).toBeLessThanOrEqual(11 + 40); // 'YYYY-MM-DD-' + 40
  });
  it('suffix로 충돌 회피', () => {
    expect(buildBoardSlug('대출', '2026-06-15', 2)).toBe('2026-06-15-대출-2');
  });
});
```

- [ ] **Step 2: 실패 확인** — Run → FAIL.

- [ ] **Step 3: 구현** — `lib/board/slug.ts`:
```ts
import { normalizeName } from '@/lib/slug';

/** 게시글 slug: `YYYY-MM-DD-정규화제목`(40자 컷). 충돌 시 suffix(>=2) 부여. */
export function buildBoardSlug(title: string, dateISO: string, suffix?: number): string {
  const base = `${dateISO}-${normalizeName(title).slice(0, 40)}`;
  return suffix && suffix >= 2 ? `${base}-${suffix}` : base;
}
```

- [ ] **Step 4: 통과 확인** — Run → PASS.

- [ ] **Step 5: 커밋** — `git add lib/board/slug.ts tests/lib/board-slug.test.ts && git commit -m "feat(board): 게시글 slug 생성"`

---

### Task 6: 생성기 (`lib/board/generate.ts`)

OpenAI Structured Outputs로 분류+생성. OpenAI client를 주입받아 비용 없이 테스트.

**Files:**
- Create: `lib/board/generate.ts`
- Test: `tests/lib/board-generate.test.ts`

- [ ] **Step 1: 실패 테스트 (가짜 client 주입)** — `tests/lib/board-generate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { generateDraft, type OpenAiLike } from '@/lib/board/generate';

function fakeClient(payload: object): OpenAiLike {
  return {
    chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }) } },
  };
}

describe('generateDraft', () => {
  it('구조화 응답을 파싱해 결과로 돌려준다', async () => {
    const payload = { type: 'PROGRAM', category: 'LOAN', title: '디딤돌 대출 한도 상향', summary: '국토부 발표 요약', body: '## 서론\n본문'.repeat(50) };
    const res = await generateDraft(fakeClient(payload), { sourceText: '국토부 보도자료 원문', sourceName: '국토교통부' }, 'gpt-4.1-mini');
    expect(res.type).toBe('PROGRAM');
    expect(res.category).toBe('LOAN');
    expect(res.title).toBe('디딤돌 대출 한도 상향');
    expect(res.body.length).toBeGreaterThan(0);
  });
  it('잘못된 type이면 에러', async () => {
    const res = generateDraft(fakeClient({ type: 'X', category: 'LOAN', title: 't', summary: 's', body: 'b' }), { sourceText: 'x', sourceName: 'y' }, 'm');
    await expect(res).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 실패 확인** — Run → FAIL(module missing).

- [ ] **Step 3: 구현** — `lib/board/generate.ts`:
```ts
import type { PostType, PostCategory } from '@prisma/client';

// 테스트 주입을 위한 최소 인터페이스(실제 OpenAI 클라이언트가 이 형태를 만족).
export interface OpenAiLike {
  chat: {
    completions: {
      create: (args: unknown) => Promise<{ choices: { message: { content: string | null } }[] }>;
    };
  };
}

export interface GenerateInput {
  sourceText: string;   // 공공자료 원문(이것만 근거로 작성)
  sourceName: string;
}
export interface GenerateResult {
  type: PostType;
  category: PostCategory;
  title: string;
  summary: string;
  body: string; // 마크다운
}

const TYPES: PostType[] = ['PROGRAM', 'TREND'];
const CATEGORIES: PostCategory[] = ['FINANCE', 'LOAN', 'ECONOMY', 'SUBSCRIPTION', 'REALESTATE'];

const ARTICLE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'category', 'title', 'summary', 'body'],
  properties: {
    type: { type: 'string', enum: TYPES },
    category: { type: 'string', enum: CATEGORIES },
    title: { type: 'string' },
    summary: { type: 'string' },
    body: { type: 'string' },
  },
} as const;

const SYSTEM_PROMPT = `당신은 공공데이터 기반 부동산·금융 정보 글을 쓰는 한국어 에디터다.
반드시 아래 규칙을 지킨다.
1. 제공된 '근거 자료' 텍스트에 있는 사실만 사용한다. 자료에 없는 내용은 절대 추측·추가하지 않는다.
2. 집값 전망·투자 조언·추천·예측 등 의견성 문장을 쓰지 않는다.
3. "~으로 보입니다 / 가능성이 있습니다 / 예상됩니다 / 전망 / 추천" 같은 표현을 쓰지 않는다.
4. 객관·중립 어조. 어려운 용어는 풀어서 설명한다. 표·목록을 적극 활용한다.
5. 분량은 한글 1,500~2,000자 수준.
먼저 글을 분류한다:
- PROGRAM(제도·상품형): 신청 대상·방법이 있는 제도/상품. 본문 구조 = 서론 / 제도 한눈에 보기 / 핵심 정보 / 신청 대상·자격 / 신청 기간·방법 / 유의사항 / 자주 묻는 질문 / 마무리 / 출처·기준일.
- TREND(사건·동향형): 신청이 성립하지 않는 이슈/통계. 본문 구조 = 무슨 일인가 / 핵심 수치(표) / 배경·맥락 / 영향 받는 대상 / 관련 제도·다음 일정(자료에 있을 때만) / 유의사항 / 출처·기준일.
category는 글 주제에 맞게 FINANCE/LOAN/ECONOMY/SUBSCRIPTION/REALESTATE 중 하나.
body는 마크다운(## 섹션 제목 + 표/목록). title은 25자 내외, summary는 한 문장.`;

function buildUserPrompt(input: GenerateInput): string {
  return `다음은 '${input.sourceName}'의 근거 자료다. 이 자료에 있는 사실만으로 글을 작성하라.\n\n=== 근거 자료 시작 ===\n${input.sourceText}\n=== 근거 자료 끝 ===`;
}

export async function generateDraft(
  client: OpenAiLike,
  input: GenerateInput,
  model: string,
): Promise<GenerateResult> {
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(input) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'board_article', strict: true, schema: ARTICLE_JSON_SCHEMA },
    },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('generateDraft: empty completion');
  const parsed = JSON.parse(content) as GenerateResult;
  if (!TYPES.includes(parsed.type)) throw new Error(`generateDraft: invalid type ${parsed.type}`);
  if (!CATEGORIES.includes(parsed.category)) throw new Error(`generateDraft: invalid category ${parsed.category}`);
  return parsed;
}

/** 실제 OpenAI 클라이언트 생성(런타임/스크립트용). 키 없으면 throw. */
export function createOpenAiClient(apiKey: string | undefined): OpenAiLike {
  if (!apiKey) throw new Error('OPENAI_API_KEY 미설정');
  // 지연 import로 테스트가 openai 패키지에 의존하지 않게 한다.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const OpenAI = require('openai').default ?? require('openai');
  return new OpenAI({ apiKey });
}
```
> `strict: true` json_schema가 type/category를 enum으로 강제하므로 환각 구조를 원천 차단한다. `createOpenAiClient`는 `require`로 지연 로딩해 단위 테스트가 openai 패키지 없이도 통과한다.

- [ ] **Step 4: 통과 확인** — Run → PASS. `pnpm typecheck` 0.

- [ ] **Step 5: 커밋** — `git add lib/board/generate.ts tests/lib/board-generate.test.ts && git commit -m "feat(board): OpenAI 구조화 생성기(분류+본문)"`

---

### Task 7: 초안 생성·저장 (`lib/board/create-draft.ts`, TDD)

생성 결과 + 출처를 받아 가드레일 통과 시 dedupe 후 DRAFT insert.

**Files:**
- Create: `lib/board/create-draft.ts`
- Test: `tests/lib/board-create-draft.test.ts`

- [ ] **Step 1: 실패 테스트** — `tests/lib/board-create-draft.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { assertLocalDatabase } from '../_helpers/assert-local-db';
import { createDraft } from '@/lib/board/create-draft';

assertLocalDatabase();
const MARK = 'test-cd-';

function input(over: Record<string, unknown> = {}) {
  return {
    gen: { type: 'PROGRAM', category: 'LOAN', title: '검토용', summary: '요약', body: '국토부는 발표했다. '.repeat(90) },
    sourceName: '국토교통부', sourceUrl: 'https://www.molit.go.kr/x',
    sourceDate: new Date('2026-06-12'), sourceExcerpt: '원문',
    dedupeKey: `${MARK}k1`, dateISO: '2026-06-15', detectedFrom: '뉴스키워드',
    ...over,
  };
}
beforeEach(async () => { await prisma.post.deleteMany({ where: { dedupeKey: { startsWith: MARK } } }); });
afterEach(async () => { await prisma.post.deleteMany({ where: { dedupeKey: { startsWith: MARK } } }); });

describe('createDraft', () => {
  it('가드레일 통과 시 DRAFT를 만들고 status=created', async () => {
    const r = await createDraft(input());
    expect(r.status).toBe('created');
    const row = await prisma.post.findUnique({ where: { dedupeKey: `${MARK}k1` } });
    expect(row!.status).toBe('DRAFT');
    expect(row!.slug.startsWith('2026-06-15-')).toBe(true);
  });
  it('가드레일 실패(금지표현)면 만들지 않고 status=rejected', async () => {
    const r = await createDraft(input({ gen: { type: 'TREND', category: 'ECONOMY', title: 't', summary: 's', body: '상승할 것으로 보입니다. '.repeat(90) } }));
    expect(r.status).toBe('rejected');
    expect(await prisma.post.findUnique({ where: { dedupeKey: `${MARK}k1` } })).toBeNull();
  });
  it('dedupeKey 중복이면 status=duplicate', async () => {
    await createDraft(input());
    const r = await createDraft(input());
    expect(r.status).toBe('duplicate');
  });
});
```

- [ ] **Step 2: 실패 확인** — Run → FAIL.

- [ ] **Step 3: 구현** — `lib/board/create-draft.ts`:
```ts
import { prisma } from '@/lib/db';
import type { GenerateResult } from '@/lib/board/generate';
import { runGuardrails } from '@/lib/board/guardrails';
import { buildBoardSlug } from '@/lib/board/slug';

export interface CreateDraftInput {
  gen: GenerateResult;
  sourceName: string;
  sourceUrl: string;
  sourceDate: Date;
  sourceExcerpt: string;
  dedupeKey: string;
  dateISO: string;
  detectedFrom?: string;
}
export type CreateDraftResult =
  | { status: 'created'; slug: string }
  | { status: 'rejected'; violations: string[] }
  | { status: 'duplicate' };

export async function createDraft(input: CreateDraftInput): Promise<CreateDraftResult> {
  const existing = await prisma.post.findUnique({ where: { dedupeKey: input.dedupeKey }, select: { id: true } });
  if (existing) return { status: 'duplicate' };

  const guard = runGuardrails({ body: input.gen.body, sourceName: input.sourceName, sourceUrl: input.sourceUrl });
  if (!guard.ok) return { status: 'rejected', violations: guard.violations };

  // slug 충돌 회피
  let slug = buildBoardSlug(input.gen.title, input.dateISO);
  for (let i = 2; await prisma.post.findUnique({ where: { slug }, select: { id: true } }); i++) {
    slug = buildBoardSlug(input.gen.title, input.dateISO, i);
  }

  await prisma.post.create({
    data: {
      slug,
      title: input.gen.title,
      summary: input.gen.summary,
      body: input.gen.body,
      type: input.gen.type,
      category: input.gen.category,
      status: 'DRAFT',
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      sourceDate: input.sourceDate,
      sourceExcerpt: input.sourceExcerpt,
      dedupeKey: input.dedupeKey,
      detectedFrom: input.detectedFrom,
    },
  });
  return { status: 'created', slug };
}
```

- [ ] **Step 4: 통과 확인** — Run → PASS.

- [ ] **Step 5: 커밋** — `git add lib/board/create-draft.ts tests/lib/board-create-draft.test.ts && git commit -m "feat(board): 초안 생성·저장(가드레일+dedupe)"`

---

### Task 8: 전체 검증

- [ ] **Step 1: 단위 테스트 전체** — Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib tests/ingest`. 전부 PASS(신규 guardrails/slug/generate/create-draft 포함).
- [ ] **Step 2: 빌드/lint/typecheck** — Run: `pnpm typecheck && pnpm lint && pnpm build`. exit 0. 라우트 표에 `/board/[slug]/thumbnail` 포함.
- [ ] **Step 3: (선택) 실 OpenAI 스모크** — 로컬 `.env.local`에 `OPENAI_API_KEY`가 있으면:
```bash
pnpm exec dotenv -e .env.local -- tsx -e "import {createOpenAiClient,generateDraft} from '@/lib/board/generate'; const c=createOpenAiClient(process.env.OPENAI_API_KEY); generateDraft(c,{sourceText:'국토교통부는 2026년 6월 12일 디딤돌 대출 한도를 4억원으로 상향한다고 발표했다. 대상은 부부합산 연소득 6천만원 이하 무주택 세대다.',sourceName:'국토교통부'}, process.env.OPENAI_MODEL ?? 'gpt-4.1-mini').then(r=>{console.log(r.type,r.category,r.title); console.log(r.body.slice(0,200));})"
```
실제 글이 분류·생성되는지 육안 확인(비용 소액 발생). 키 없으면 이 스텝은 건너뜀.
- [ ] **Step 4: 트리 정리** — `git status` clean.

---

## 자기 검토 체크리스트
- **커버리지:** 썸네일 B(리스트+상세+OG+JSON-LD image, 안정 URL 라우트) → Task 1·2 / 가드레일 → Task 4 / 생성(분류+구조화) → Task 6 / dedupe·DRAFT → Task 7 / env·deps → Task 3.
- **플레이스홀더:** 없음. 모든 코드/명령/기대결과 명시.
- **타입 일관성:** `GenerateResult`(Task 6) → `createDraft.gen`(Task 7) 일치. `runGuardrails`/`buildBoardSlug` 시그니처 정의·사용 일치. `articleSchema` image 필드 정의(Task 2 Step1)·사용(Task 2 Step3) 일치.

## 다음: 플랜 3b (수집·오케스트레이션)
- 네이버 검색 API 이슈 탐지(`scripts/ingest/posts/detect-issues.ts`)
- 공공 소스 레지스트리(`lib/board/source-registry.ts`) — 정책브리핑 + 정기통계 + 8기관 **실엔드포인트는 라이브 조사·검증 후 확정**(RSS/목록 파서). FIRST_PARTY(우리 DB 동향) 소스 포함.
- 이슈↔공공자료 매칭 + 본문 텍스트 확보
- 러너(`scripts/ingest/posts/runner.ts`): 하루 1건 멈춤 + IngestionRun 기록 + `notify`(Discord) "초안 대기"
- GitHub Actions 크론 워크플로 + 운영 DB 마이그레이션 배포(status 확인 후)
