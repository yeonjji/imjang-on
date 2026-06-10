# 상세 페이지 메인 데이터 출처 블록 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 상세 페이지(`[id]`) 본문 하단에, 그 페이지의 핵심 데이터셋 출처 1개를 정돈된 블록(제공기관·데이터셋명·원본 링크·전체 출처 링크)으로 표시한다.

**Architecture:** 레지스트리(`lib/data-sources.ts`, SSOT)에서만 데이터를 끌어오는 순수 표현 컴포넌트 `MainSourceBlock id="..."` 하나를 만든다. 페이지가 "메인 출처 id"를 계산해 넘긴다(dumb component). 정적 매핑(아파트=`molit-rtms` 등)과 동적 매핑(청약=레코드 카테고리, urban/amenity=슬러그 맵)을 구분한다. 갱신 정보는 표시하지 않는다(레지스트리 필드 그대로).

**Tech Stack:** Next.js(App Router, RSC), TypeScript, Tailwind(인라인 클래스 + `--color-*` CSS 변수), Vitest(node 환경, lib 함수 단위 테스트).

**Spec:** `docs/superpowers/specs/2026-06-10-main-source-block-design.md`
**시안:** `html/source-attribution-ideas.html`

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `lib/data-sources.ts` | 출처 레지스트리(SSOT) + 순수 헬퍼 | Modify: 헬퍼 3개 추가 |
| `tests/lib/data-sources.test.ts` | 헬퍼 단위 테스트 | Modify: 케이스 추가 |
| `components/ui/main-source-block.tsx` | 메인 출처 블록 표현 컴포넌트 | Create |
| 상세 페이지 11종(`app/(public)/.../page.tsx`) | 블록 배치 | Modify: import + `<main>` 마지막 자식 |

`MainSourceBlock`은 표현만 담당(데이터 판단 없음). 출처 결정 로직은 헬퍼(`subscriptionSource`)와 기존 맵(`URBAN_SOURCE`/`AMENITY_SOURCE`)에 둔다. 프로젝트는 컴포넌트 렌더 테스트 인프라(jsdom/RTL)가 없고 lib 함수만 단위 테스트하므로, TDD는 헬퍼에 적용하고 컴포넌트·배치는 `typecheck` + 시각 스모크로 검증한다(기존 패턴 준수).

---

## Task 1: 출처 헬퍼 3개 (TDD)

**Files:**
- Modify: `lib/data-sources.ts`
- Test: `tests/lib/data-sources.test.ts`

추가 헬퍼:
- `subscriptionSource(category)` — 청약 공고 카테고리 → 메인 출처. `'LH_PRESUB'` → `'lh-presub'`, 그 외 → `'applyhome'`.
- `sourceHost(url)` — url의 호스트명(`www.` 제거).
- `sourceCategoryIcon(category)` — 카테고리별 블록 아이콘.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/data-sources.test.ts` 끝에 추가(파일 상단 import에 `subscriptionSource, sourceHost, sourceCategoryIcon` 추가):

```ts
import {
  DATA_SOURCES,
  DATA_SOURCE_CATEGORY_ORDER,
  dataSourcesByCategory,
  sourceShortLabel,
  subscriptionSource,
  sourceHost,
  sourceCategoryIcon,
  type DataSourceId,
} from '@/lib/data-sources';

describe('subscriptionSource', () => {
  it('LH 사전청약은 lh-presub', () => {
    expect(subscriptionSource('LH_PRESUB')).toBe('lh-presub');
  });
  it('그 외 카테고리는 applyhome', () => {
    for (const c of ['APT', 'OFFICETEL_ETC', 'REMNANT', 'PUB_PRIV_RENT', 'ARBITRARY']) {
      expect(subscriptionSource(c)).toBe('applyhome');
    }
  });
});

describe('sourceHost', () => {
  it('호스트명만 반환한다', () => {
    expect(sourceHost('https://rt.molit.go.kr')).toBe('rt.molit.go.kr');
    expect(sourceHost('https://www.applyhome.co.kr')).toBe('applyhome.co.kr');
    expect(sourceHost('https://www.data.go.kr')).toBe('data.go.kr');
  });
});

describe('sourceCategoryIcon', () => {
  it('모든 카테고리에 비어있지 않은 아이콘이 있다', () => {
    for (const c of DATA_SOURCE_CATEGORY_ORDER) {
      expect(sourceCategoryIcon(c).length, c).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/lib/data-sources.test.ts`
Expected: FAIL — `subscriptionSource is not a function` (또는 import 에러).

- [ ] **Step 3: 헬퍼 구현**

`lib/data-sources.ts` 끝(파일 마지막 `sourceShortLabel` 함수 아래)에 추가:

```ts
/** 청약 공고 카테고리 → 메인 출처. LH 사전청약은 LH, 그 외는 청약홈. */
export function subscriptionSource(category: string): DataSourceId {
  return category === 'LH_PRESUB' ? 'lh-presub' : 'applyhome';
}

/** 출처 URL의 호스트명(www. 제거). 블록의 "원본 {host}" 표기에 사용. */
export function sourceHost(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

/** 카테고리별 블록 아이콘(정보 보조용, 장식 최소). */
const CATEGORY_ICON: Record<DataSourceCategory, string> = {
  '부동산 거래': '🏛️',
  청약: '📋',
  의료: '🏥',
  '교육·보육': '🏫',
  생활편의: '🏪',
  교통: '🚇',
  공통: '🗂️',
};

/** 메인 출처 블록 좌측 아이콘. */
export function sourceCategoryIcon(category: DataSourceCategory): string {
  return CATEGORY_ICON[category];
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run tests/lib/data-sources.test.ts`
Expected: PASS (기존 케이스 포함 전부 통과).

- [ ] **Step 5: 커밋**

```bash
git add lib/data-sources.ts tests/lib/data-sources.test.ts
git commit -m "feat(data-sources): 메인 출처 블록용 헬퍼(subscriptionSource·sourceHost·sourceCategoryIcon)"
```

---

## Task 2: MainSourceBlock 컴포넌트

**Files:**
- Create: `components/ui/main-source-block.tsx`

순수 표현 컴포넌트. `id`를 받아 `DATA_SOURCES[id]`를 렌더. 렌더 테스트 인프라가 없으므로 `typecheck`로 검증.

- [ ] **Step 1: 컴포넌트 작성**

`components/ui/main-source-block.tsx`:

```tsx
import Link from 'next/link';
import {
  DATA_SOURCES,
  sourceHost,
  sourceCategoryIcon,
  type DataSourceId,
} from '@/lib/data-sources';

interface MainSourceBlockProps {
  /** 이 페이지의 메인(핵심) 데이터 출처 */
  id: DataSourceId;
  className?: string;
}

/**
 * 상세 페이지 하단의 "메인 데이터 출처" 블록.
 * 핵심 데이터셋의 제공기관·데이터셋명·원본 링크를 레지스트리(SSOT)에서 끌어와 한 블록으로 표시한다.
 * 보조 섹션 출처는 기존 SourceCaption을 그대로 쓴다.
 */
export function MainSourceBlock({ id, className }: MainSourceBlockProps) {
  const s = DATA_SOURCES[id];
  return (
    <section
      className={`flex items-start gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] p-4 ${className ?? ''}`}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-[var(--color-sky-soft)] text-lg"
      >
        {sourceCategoryIcon(s.category)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold tracking-wide text-[var(--color-muted)]">
            메인 데이터 출처
          </span>
          <span className="rounded-full bg-[var(--color-sky-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-blue-dark)]">
            공공데이터
          </span>
        </div>
        <p className="mt-1 text-[15px] font-bold text-[var(--color-blue-dark)]">{s.provider}</p>
        <p className="mt-0.5 text-sm text-[var(--color-text)]">{s.dataset}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {s.url && (
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[var(--color-blue)] hover:underline"
            >
              원본 {sourceHost(s.url)} ↗
            </a>
          )}
          <Link href="/data-source" className="font-semibold text-[var(--color-blue)] hover:underline">
            전체 출처 →
          </Link>
        </div>
      </div>
    </section>
  );
}
```

> 14px Floor Rule: `메인 데이터 출처`(12px)·`공공데이터`(11px)는 라벨/배지라 12px 미만 허용. 본문급 텍스트(provider 15px, dataset/링크 14px)는 14px 이상.

- [ ] **Step 2: 타입 체크**

Run: `pnpm typecheck`
Expected: PASS (에러 0).

- [ ] **Step 3: 커밋**

```bash
git add components/ui/main-source-block.tsx
git commit -m "feat(ui): 상세 페이지 메인 데이터 출처 블록 컴포넌트"
```

---

## Task 3: 정적 출처 상세 페이지에 배치 (8종)

**Files (각각 Modify):**
- `app/(public)/apt/[id]/page.tsx` — `molit-rtms`
- `app/(public)/officetel/[id]/page.tsx` — `molit-rtms`
- `app/(public)/villa/[id]/page.tsx` — `molit-rtms`
- `app/(public)/school/[sigunguCode]/[id]/page.tsx` — `neis`
- `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx` — `hira`
- `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx` — `hira`
- `app/(public)/childcare/[sigunguCode]/[id]/page.tsx` — `childcare`
- `app/(public)/urban/charger/[id]/page.tsx` — `kepco-ev`

각 파일 공통 편집:
1. import 추가: `import { MainSourceBlock } from '@/components/ui/main-source-block';`
2. `<main>` 요소의 **마지막 자식**으로(닫는 `</main>` 바로 앞) 아래 한 줄 삽입. `id`는 위 표의 값.

```tsx
<MainSourceBlock id="molit-rtms" />
```

- [ ] **Step 1: `apt/[id]` 배치**

import 추가 후, `<NearbyInfra categories={infra} />` 다음(`</main>` 바로 앞)에:
```tsx
<MainSourceBlock id="molit-rtms" />
```

- [ ] **Step 2: `officetel/[id]` 배치**

import 추가 후 `<main>`의 마지막 자식으로:
```tsx
<MainSourceBlock id="molit-rtms" />
```

- [ ] **Step 3: `villa/[id]` 배치**

import 추가 후 `<main>`의 마지막 자식으로:
```tsx
<MainSourceBlock id="molit-rtms" />
```

- [ ] **Step 4: `school/[sigunguCode]/[id]` 배치**

import 추가 후 `<main>`의 마지막 자식으로(기존 `<SourceCaption ids={['neis']} />`는 그대로 둠):
```tsx
<MainSourceBlock id="neis" />
```

- [ ] **Step 5: `medical/hospital/[sigunguCode]/[id]` 배치**

import 추가 후 `<main>`의 마지막 자식으로:
```tsx
<MainSourceBlock id="hira" />
```

- [ ] **Step 6: `medical/pharmacy/[sigunguCode]/[id]` 배치**

import 추가 후 `<main>`의 마지막 자식으로:
```tsx
<MainSourceBlock id="hira" />
```

- [ ] **Step 7: `childcare/[sigunguCode]/[id]` 배치**

import 추가 후 `<main>`의 마지막 자식으로:
```tsx
<MainSourceBlock id="childcare" />
```

- [ ] **Step 8: `urban/charger/[id]` 배치**

import 추가 후 `<main>`의 마지막 자식으로:
```tsx
<MainSourceBlock id="kepco-ev" />
```

- [ ] **Step 9: 타입 체크**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 10: 커밋**

```bash
git add "app/(public)/apt/[id]/page.tsx" "app/(public)/officetel/[id]/page.tsx" "app/(public)/villa/[id]/page.tsx" "app/(public)/school/[sigunguCode]/[id]/page.tsx" "app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx" "app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx" "app/(public)/childcare/[sigunguCode]/[id]/page.tsx" "app/(public)/urban/charger/[id]/page.tsx"
git commit -m "feat(detail): 정적 출처 상세 페이지에 메인 데이터 출처 블록 배치(8종)"
```

---

## Task 4: 동적 출처 상세 페이지에 배치 (3종)

출처가 레코드/카테고리에 따라 달라지는 페이지. 페이지가 id를 계산해 넘긴다.

**Files (각각 Modify):**
- `app/(public)/subscription/[id]/page.tsx` — `subscriptionSource(notice.category)`
- `app/(public)/urban/[category]/[id]/page.tsx` — `URBAN_SOURCE[def.slug]`
- `app/(public)/amenity/[category]/[id]/page.tsx` — `AMENITY_SOURCE[def.slug]`

- [ ] **Step 1: `subscription/[id]` 배치**

import 추가:
```tsx
import { MainSourceBlock } from '@/components/ui/main-source-block';
import { subscriptionSource } from '@/lib/data-sources';
```
`<main>`의 마지막 자식으로(닫는 `</main>` 바로 앞, 기존 중간 `<SourceCaption ids={['applyhome', 'lh-presub']} />`는 그대로 둠):
```tsx
<MainSourceBlock id={subscriptionSource(notice.category)} />
```

- [ ] **Step 2: `urban/[category]/[id]` 배치**

`URBAN_SOURCE`는 이미 import되어 있음(`@/lib/urban/category`). import 추가:
```tsx
import { MainSourceBlock } from '@/components/ui/main-source-block';
```
`<main>`의 마지막 자식으로(`<NearbyInfra .../>` 다음, `</main>` 앞):
```tsx
<MainSourceBlock id={URBAN_SOURCE[def.slug]} />
```

- [ ] **Step 3: `amenity/[category]/[id]` 배치**

`AMENITY_SOURCE`는 이미 import되어 있음(`@/lib/amenity/category`). import 추가:
```tsx
import { MainSourceBlock } from '@/components/ui/main-source-block';
```
`<main>`의 마지막 자식으로:
```tsx
<MainSourceBlock id={AMENITY_SOURCE[def.slug]} />
```

- [ ] **Step 4: 타입 체크**

Run: `pnpm typecheck`
Expected: PASS. (`notice.category`는 `SubscriptionCategory` enum이지만 `subscriptionSource(category: string)`가 받으므로 호환.)

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/subscription/[id]/page.tsx" "app/(public)/urban/[category]/[id]/page.tsx" "app/(public)/amenity/[category]/[id]/page.tsx"
git commit -m "feat(detail): 동적 출처 상세 페이지에 메인 데이터 출처 블록 배치(청약·urban·amenity)"
```

---

## Task 5: 전체 검증 + 시각 스모크

- [ ] **Step 1: 단위 테스트 + 타입 체크**

Run: `pnpm exec vitest run tests/lib/data-sources.test.ts && pnpm typecheck`
Expected: 둘 다 PASS.

- [ ] **Step 2: 시각 스모크 (대표 2페이지)**

개발 서버를 띄워(`pnpm dev`) 정적·동적 대표 페이지를 각 1개 연다:
- 아파트 상세 `/apt/<존재하는 id>` → 본문 맨 아래 "메인 데이터 출처: 국토교통부 / 실거래가 공개시스템 / 원본 rt.molit.go.kr ↗ / 전체 출처 →" 블록 확인.
- 청약 상세 `/subscription/<LH 공고 id>` → 출처가 "한국토지주택공사(LH)"로, 일반 공고는 "한국부동산원"으로 표시되는지 확인.

확인 포인트: 블록이 `<main>` 맨 아래 1개만, `--shadow-soft` 외 추가 그림자 없음, 본문 14px 이상.

- [ ] **Step 3: (해당 시 커밋 없음 — 검증만)**

검증 단계. 코드 변경이 있었다면 별도 커밋.

---

## 알려진 사항 (비차단)

- 청약·urban·amenity·charger 페이지에는 동일 출처를 가리키는 기존 `SourceCaption`이 본문 중간에 남아, 하단 블록과 가벼운 중복이 생긴다. Spec의 "SourceCaption은 건드리지 않는다" 원칙에 따라 유지한다. 추후 원하면 해당 캡션 제거는 별도 작업.
- `/region/[code]`(집계 페이지)는 1차 범위 제외.

## Self-Review 결과

- **Spec 커버리지:** 목표(블록·SSOT·모든 [id] 적용) → Task 2~4. 비목표(갱신정보·전체 패널·다른 후보) 미구현 확인. 페이지별 매핑 표 → Task 3·4가 11종 전부 커버(region 제외는 spec 명시).
- **Placeholder 스캔:** TBD/TODO 없음. 모든 코드 블록 실제 코드.
- **타입 일관성:** `MainSourceBlockProps.id: DataSourceId`, `subscriptionSource(category: string): DataSourceId`, `sourceHost(url: string): string`, `sourceCategoryIcon(category: DataSourceCategory): string` — Task 간 시그니처 일치. `URBAN_SOURCE`/`AMENITY_SOURCE`는 `Record<slug, DataSourceId>`라 `MainSourceBlock id`에 그대로 전달 가능.
