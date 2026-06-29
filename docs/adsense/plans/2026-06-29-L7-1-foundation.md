# L7 Plan 1 — Guide 시스템 Foundation (데이터 모델 + 순수 lib) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** evergreen 가이드 시스템의 토대를 만든다 — 별도 `Guide` 테이블 + `GuideCategory` enum, 그리고 DB 없이 단위 테스트 가능한 순수 모듈 두 개(POI→가이드 카테고리 매핑, 가이드 가드레일).

**Architecture:** board의 `Post`와 **분리된** 새 Prisma 모델 `Guide`(상태는 기존 `PostStatus` 재사용). 그 위에 순수 함수 모듈을 얹는다: `guideCategoryForPage`(라우트 키→`GuideCategory`)와 `runGuideGuardrails`(해설 허용·과장/전망/투자권유 금지·출처 필수 — board guardrails를 가이드 장르에 맞게 변형). 쿼리·생성기·admin·라우트·POI 배선은 후속 플랜.

**Tech Stack:** Prisma(MySQL), Next.js, vitest(`tests/lib`, CI `test:unit` 포함, `globals:false`, alias `@`→root).

> **설계 출처:** `docs/adsense/guide-system-design.md`. 이 플랜은 §2(모델)·§3 가드레일·§6 매핑만 다룬다. **후속:** Plan 2(쿼리+생성기) · Plan 3(/admin/guides 검수) · Plan 4(/guide 공개 라우트+사이트맵+JSON-LD+나브 + POI 관련가이드 배선).

---

## File Structure
- **Modify:** `prisma/schema.prisma` — `GuideCategory` enum + `Guide` 모델.
- **Create:** `prisma/migrations/<timestamp>_add_guide_table/migration.sql` — 마이그레이션(생성됨).
- **Create:** `lib/guide/page-category.ts` — 라우트 키→`GuideCategory` 매핑.
- **Create:** `lib/guide/guardrails.ts` — 가이드 가드레일.
- **Create:** `tests/lib/guide-page-category.test.ts`, `tests/lib/guide-guardrails.test.ts`.

## 배경(엔지니어용)
- Prisma 클라이언트는 `import { prisma } from '@/lib/db';`. enum/타입은 `@prisma/client`에서 import.
- **마이그레이션 주의(중요):** `.env.local` = **운영 Supabase**, `.env.test` = 로컬 docker. **운영에 migrate dev 금지.** 마이그레이션 생성·검증은 **`.env.test`(docker)** 로만. `migrate dev`는 docker의 잔여 마이그레이션을 함께 쓸어담을 수 있으니 **새 마이그레이션 폴더만 좁게 `git add`**. 운영 반영은 배포 시 수동 `pnpm prisma:deploy`(이 플랜 밖, 머지 전 게이트).
- 기존 `PostStatus` enum = `DRAFT | PUBLISHED | REJECTED`(가이드 상태로 재사용). board의 `Post`/`PostType`/`PostCategory`는 **건드리지 않는다.**

---

## Task 1: `Guide` 모델 + `GuideCategory` enum + 마이그레이션

**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_add_guide_table/`

- [ ] **Step 1: 스키마에 enum + 모델 추가** — `prisma/schema.prisma` 끝(다른 enum/model 옆)에 추가:

```prisma
enum GuideCategory {
  REALESTATE
  SUBSCRIPTION
  FINANCE
  MEDICAL
  CHILDCARE
  SCHOOL
  LIFE
}

model Guide {
  id      BigInt        @id @default(autoincrement())
  slug    String        @unique @db.VarChar(200)
  title   String        @db.VarChar(200)
  summary String        @db.Text
  body    String        @db.Text
  category GuideCategory
  status  PostStatus    @default(DRAFT)

  sourceName    String   @db.VarChar(120)
  sourceUrl     String   @db.VarChar(500)
  sourceDate    DateTime @db.Date
  sourceExcerpt String   @db.Text

  dedupeKey   String    @unique @db.VarChar(120)
  generatedAt DateTime  @default(now())
  reviewedAt  DateTime?
  publishedAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([status, publishedAt(sort: Desc)])
  @@index([category, status])
}
```

- [ ] **Step 2: 스키마 검증** — Run: `pnpm exec prisma format && pnpm exec prisma validate`
  Expected: "The schema ... is valid 🚀" (에러 없음).

- [ ] **Step 3: docker 테스트 DB에 마이그레이션 생성** — Run: `pnpm exec dotenv -e .env.test -- prisma migrate dev --name add_guide_table`
  Expected: `add_guide_table` 마이그레이션 생성·적용 성공. ⚠️ docker가 꺼져 있으면 먼저 docker compose로 테스트 DB를 띄울 것(README/.env.test 참고). 운영(.env.local)엔 절대 실행 금지.

- [ ] **Step 4: 새 마이그레이션 폴더만 좁게 stage** — Run: `git status --short prisma/migrations`
  새로 생긴 `prisma/migrations/<ts>_add_guide_table/`만 확인하고, **그 폴더와 schema.prisma만** add(잔여 마이그레이션이 같이 잡히면 제외):
  ```bash
  git add prisma/schema.prisma prisma/migrations/*_add_guide_table
  ```

- [ ] **Step 5: 클라이언트 생성** — Run: `pnpm exec dotenv -e .env.test -- prisma generate`
  Expected: 성공(이후 `@prisma/client`에 `Guide`·`GuideCategory` 노출 → Task 2/3 import 가능).

- [ ] **Step 6: 커밋**
  ```bash
  git commit -m "feat(guide): Guide 테이블 + GuideCategory enum 추가 (L7-1)"
  ```

## Task 2: `guideCategoryForPage` 매핑 (TDD)

**Files:** Create `lib/guide/page-category.ts`, `tests/lib/guide-page-category.test.ts`

- [ ] **Step 1: 실패 테스트** — `tests/lib/guide-page-category.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { guideCategoryForPage } from '@/lib/guide/page-category';
import { GuideCategory } from '@prisma/client';

describe('guideCategoryForPage', () => {
  it('POI/매물 라우트를 가이드 카테고리로 매핑한다', () => {
    expect(guideCategoryForPage('medical/hospital')).toBe(GuideCategory.MEDICAL);
    expect(guideCategoryForPage('medical/pharmacy')).toBe(GuideCategory.MEDICAL);
    expect(guideCategoryForPage('childcare')).toBe(GuideCategory.CHILDCARE);
    expect(guideCategoryForPage('apt')).toBe(GuideCategory.REALESTATE);
    expect(guideCategoryForPage('jeonse-guarantee')).toBe(GuideCategory.FINANCE);
    expect(guideCategoryForPage('subway')).toBe(GuideCategory.LIFE);
  });
  it('매칭 없으면 null(관련 가이드 블록 생략용)', () => {
    expect(guideCategoryForPage('unknown')).toBeNull();
  });
});
```

- [ ] **Step 2: 실행 → 실패** — `pnpm exec vitest run tests/lib/guide-page-category.test.ts` → FAIL(모듈 없음).

- [ ] **Step 3: 구현** — `lib/guide/page-category.ts`:

```ts
import { GuideCategory } from '@prisma/client';

/** POI/매물 상세 라우트 키 → 가이드 카테고리. 매칭 없으면 null(관련 가이드 블록 생략). */
const PAGE_TO_GUIDE: Record<string, GuideCategory> = {
  'medical/hospital': GuideCategory.MEDICAL,
  'medical/pharmacy': GuideCategory.MEDICAL,
  childcare: GuideCategory.CHILDCARE,
  school: GuideCategory.SCHOOL,
  apt: GuideCategory.REALESTATE,
  villa: GuideCategory.REALESTATE,
  officetel: GuideCategory.REALESTATE,
  region: GuideCategory.REALESTATE,
  subscription: GuideCategory.SUBSCRIPTION,
  finance: GuideCategory.FINANCE,
  'jeonse-guarantee': GuideCategory.FINANCE,
  amenity: GuideCategory.LIFE,
  subway: GuideCategory.LIFE,
  life: GuideCategory.LIFE,
};

export function guideCategoryForPage(pageKey: string): GuideCategory | null {
  return PAGE_TO_GUIDE[pageKey] ?? null;
}
```

- [ ] **Step 4: 실행 → 통과** — `pnpm exec vitest run tests/lib/guide-page-category.test.ts` → PASS.
- [ ] **Step 5: 타입체크** — `pnpm typecheck` → 에러 없음.
- [ ] **Step 6: 커밋**
  ```bash
  git add lib/guide/page-category.ts tests/lib/guide-page-category.test.ts
  git commit -m "feat(guide): pageCategory→GuideCategory 매핑 (L7-1)"
  ```

## Task 3: 가이드 가드레일 (TDD)

**Files:** Create `lib/guide/guardrails.ts`, `tests/lib/guide-guardrails.test.ts`

- [ ] **Step 1: 실패 테스트** — `tests/lib/guide-guardrails.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findForbiddenGuidePhrases, runGuideGuardrails } from '@/lib/guide/guardrails';

describe('guide guardrails', () => {
  it('투자권유·시세 단정전망·과장 표현을 잡는다', () => {
    expect(findForbiddenGuidePhrases('지금이 기회입니다')).toContain('투자권유');
    expect(findForbiddenGuidePhrases('집값이 오를 것입니다')).toContain('시세 단정 전망');
    expect(findForbiddenGuidePhrases('무조건 이득입니다')).toContain('과장');
  });
  it('해설·하우투 표현은 통과시킨다(빈 배열)', () => {
    const ok = '전세가율은 전세보증금을 매매가로 나눈 값입니다. 계약 전 등기부등본을 확인하세요. 일반적으로 가점은 무주택 기간으로 산정됩니다.';
    expect(findForbiddenGuidePhrases(ok)).toEqual([]);
  });
  it('출처 누락을 위반으로 잡는다', () => {
    const r = runGuideGuardrails({ body: '가'.repeat(900), sourceName: '', sourceUrl: '' });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('출처'))).toBe(true);
  });
});
```

- [ ] **Step 2: 실행 → 실패** — `pnpm exec vitest run tests/lib/guide-guardrails.test.ts` → FAIL(모듈 없음).

- [ ] **Step 3: 구현** — `lib/guide/guardrails.ts`:

```ts
// 가이드 장르: 해설·비교·하우투는 허용(board와 다름). 과장·시세 단정전망·투자권유만 금지.
const FORBIDDEN_PATTERNS: { label: string; re: RegExp }[] = [
  { label: '시세 단정 전망', re: /(오를|내릴|폭등|폭락)\s*것|상승할\s*것|하락할\s*것|반드시\s*(오|내)/ },
  { label: '투자권유', re: /지금이\s*기회|매수하세요|사세요|추천(합니다|드립니다)|유망(하다|합니다|한)/ },
  { label: '과장', re: /무조건|보장(합니다|됩니다)|확실(합니다|히\s*(오|이득))|최고의/ },
];

export function findForbiddenGuidePhrases(text: string): string[] {
  return FORBIDDEN_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
}

/** 가이드 본문 길이: 상록 가이드는 충실해야 하므로 하한을 둠. 상한은 넉넉히. */
export function checkGuideLength(body: string, min = 800, max = 6000): { ok: boolean; length: number } {
  const length = body.replace(/\s/g, '').length;
  return { ok: length >= min && length <= max, length };
}

export interface GuideGuardrailInput { body: string; sourceName: string; sourceUrl: string; }
export interface GuideGuardrailResult { ok: boolean; violations: string[] }

export function runGuideGuardrails(input: GuideGuardrailInput): GuideGuardrailResult {
  const violations: string[] = [];
  if (!input.sourceName.trim() || !input.sourceUrl.trim()) violations.push('출처(sourceName/sourceUrl) 누락');
  const forbidden = findForbiddenGuidePhrases(input.body);
  if (forbidden.length) violations.push(`금지표현: ${forbidden.join(', ')}`);
  const len = checkGuideLength(input.body);
  if (!len.ok) violations.push(`분량 범위 벗어남(${len.length}자)`);
  return { ok: violations.length === 0, violations };
}
```

- [ ] **Step 4: 실행 → 통과** — `pnpm exec vitest run tests/lib/guide-guardrails.test.ts` → PASS.
- [ ] **Step 5: 타입체크 + 전체 단위** — `pnpm typecheck` 클린, `pnpm test:unit` 그린(신규 2개 테스트 포함).
- [ ] **Step 6: 커밋**
  ```bash
  git add lib/guide/guardrails.ts tests/lib/guide-guardrails.test.ts
  git commit -m "feat(guide): 가이드 가드레일(해설 허용·과장/전망/투자권유 금지·출처 필수) (L7-1)"
  ```

## Verification
- `pnpm test:unit` 그린(매핑·가드레일 테스트 포함).
- `@prisma/client`에 `Guide`·`GuideCategory` 노출(typecheck 통과로 확인).
- 마이그레이션 폴더 1개만 추가됨(`git log --stat`).

## Out of scope (후속 플랜)
- **Plan 2:** `lib/guide` 쿼리(findPublishedGuides·getGuideBySlug·getGuidesByCategory) + 생성기(시드·프롬프트, board LLM 래퍼 재사용) + dedupeKey.
- **Plan 3:** `/admin/guides` 목록·에디터·검수 액션(DRAFT→PUBLISHED/REJECTED).
- **Plan 4:** `/guide` 공개 라우트(목록·[slug]) + 사이트맵 guide 소스 + JSON-LD(Article/Breadcrumb) + 나브 + POI "관련 가이드" 블록 배선(`guideCategoryForPage` 사용).
- 본문 25–40편 집필·검수(운영) · 운영 DB 마이그레이션 배포(머지 전 수동 `prisma:deploy`).
