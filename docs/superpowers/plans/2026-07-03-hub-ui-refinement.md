# 허브 페이지 UI 다듬기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 허브 화면의 두 시각적 어색함을 표현(className)만 고쳐 정돈한다 — 목록 카드 높이 통일, `HubIntro` 요약/안내 사이 구분선 제거.

**Architecture:** 순수 프레젠테이션 변경. 두 공유 컴포넌트의 Tailwind 클래스만 수정하고 데이터·쿼리·JSON-LD·SEO·로직은 건드리지 않는다. `PropertyCard`는 `/apt`·`/officetel`·`/villa`에서만 쓰이고, `HubIntro`는 11개 허브 전역에서 쓰인다.

**Tech Stack:** Next.js(App Router) · React · Tailwind CSS · TypeScript(strict) · pnpm.

## Global Constraints

- **표현(className)만 변경.** 데이터·쿼리·props·JSON-LD·SEO·로직 무변경. JSX 구조(요소 추가/삭제)도 하지 않는다(단, 근거 주석은 허용).
- **`min-h-[186px]`는 매직넘버** — 매매·전세·월세 3줄이 모두 있는 표준 카드 높이(p-6 24px×2 + 헤더 ~42px + 딜 3줄 ~94px ≈ 184px) 기준 floor. **근거 주석을 반드시 단다.**
- **딜 정보는 상단 정렬 유지** — 헤더 바로 아래에 두고 남는 높이는 카드 하단 여백으로. `mt-auto`/`justify-between` 등으로 하단 앵커하지 않는다.
- **이슈 2는 전역 적용(의도)** — `HubIntro`를 쓰는 11개 허브 전부에 반영된다.
- **브랜치:** `feat/hub-ui-refinement` (이미 존재, spec 커밋 `90e2b67` 위).
- **검증:** `pnpm typecheck` + `pnpm lint`(둘 다 — `no-unused-vars`가 CI 게이트). 순수 프레젠테이션이라 **단위 테스트는 추가하지 않고** 시각 스모크로 확인.
- **커밋 메시지**는 `type(scope): 한글 요약` + 말미에 `Co-Authored-By:`·`Claude-Session:` 트레일러 두 줄.

---

### Task 1: 목록 카드 높이 통일 (`PropertyCard`)

**Files:**
- Modify: `app/(public)/_components/property-card.tsx` (Link 22행, Card 23행)

**Interfaces:**
- Consumes: 없음.
- Produces: 없음(프레젠테이션 변경). 영향 범위는 `PropertyCard` 소비자 3곳(`/apt`·`/officetel`·`/villa`)뿐.

- [ ] **Step 1: `<Link>`가 그리드 셀 높이를 채우도록 `block h-full` 추가**

`app/(public)/_components/property-card.tsx`의 `<Link href={href}>`(22행):

```tsx
    <Link href={href}>
```
→
```tsx
    <Link href={href} className="block h-full">
```

- [ ] **Step 2: `<Card>`에 `h-full min-h-[186px]` 추가 + 근거 주석**

같은 파일 `<Card className="transition hover:shadow-lg">`(23행):

```tsx
      <Card className="transition hover:shadow-lg">
```
→
```tsx
      {/* h-full: 같은 줄 카드와 높이 일치. min-h-[186px]: 매매·전세·월세 3줄 표준 카드(≈184px) 기준 floor로, 거래유형 적은 카드도 균등 높이(내용은 상단 정렬, 남는 높이는 하단 여백). */}
      <Card className="h-full min-h-[186px] transition hover:shadow-lg">
```

- [ ] **Step 3: 타입체크 + 린트**

Run: `pnpm typecheck && pnpm lint`
Expected: 둘 다 PASS(Exit 0, `✔ No ESLint warnings or errors`).

- [ ] **Step 4: 시각 스모크 (dev 또는 프리뷰)**

`pnpm dev` 후 `/apt` 확인:
- "거래 많은 단지 TOP N" 그리드에서 **같은 줄 카드 높이가 일치**하고, 거래유형이 1~2개인 카드도 3개짜리와 **같은 높이**(아래 여백)로 통일.
- 카드 내부 헤더·딜 정보 위치는 이전과 동일(상단 정렬).

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/_components/property-card.tsx"
git commit -m "fix(ui): 허브 목록 카드 높이 통일(PropertyCard h-full+min-h)"
```
(커밋 메시지 말미에 트레일러 두 줄 추가. `git add -A` 금지 — 미추적 `RESEARCH/` 스테이징 방지.)

---

### Task 2: HubIntro 요약/안내 구분선 제거 (전역)

**Files:**
- Modify: `app/(public)/_components/hub-intro.tsx` (guide `<p>`, 17행)

**Interfaces:**
- Consumes: 없음.
- Produces: 없음. 영향 범위는 `HubIntro` 소비자 11개 허브 전역(의도).

- [ ] **Step 1: guide `<p>`에서 `border-t border-[var(--color-line)] pt-3` 제거**

`app/(public)/_components/hub-intro.tsx`의 guide 문단(17행):

```tsx
        <p className="break-keep border-t border-[var(--color-line)] pt-3 text-sm leading-relaxed text-[var(--color-muted)]">
```
→
```tsx
        <p className="break-keep text-sm leading-relaxed text-[var(--color-muted)]">
```

래퍼 `<div className="mt-3 flex flex-col gap-3">`는 무변경 → 요약·안내 두 문단이 `gap-3`(12px) 여백으로만 분리된다.

- [ ] **Step 2: 타입체크 + 린트**

Run: `pnpm typecheck && pnpm lint`
Expected: 둘 다 PASS.

- [ ] **Step 3: 시각 스모크**

`/apt`(property 허브)와 `/school`(카테고리 허브) 상단 요약에서 **가로 구분선이 사라지고** 요약·안내가 여백으로만 구분되는지 확인(전역 적용 검증).

- [ ] **Step 4: 커밋**

```bash
git add "app/(public)/_components/hub-intro.tsx"
git commit -m "fix(ui): HubIntro 요약/안내 사이 구분선 제거(전역)"
```
(트레일러 두 줄 추가. `git add -A` 금지.)

---

## Self-Review

**1. Spec coverage** (`2026-07-03-hub-ui-refinement-design.md` 대비):
- §1 이슈1 카드 높이 통일 → **Task 1** ✅
- §2 이슈2 HubIntro 구분선 제거(전역) → **Task 2** ✅
- §3 파일(2개), §4 검증(typecheck+lint+시각 스모크, 단위테스트 없음) → 각 Task Step 반영 ✅
- §5 범위 밖(하단 앵커·문구 변경·apt 태그라인 통일·시안 B/C) → Global Constraints/미포함으로 반영 ✅

**2. Placeholder scan:** TBD/TODO 없음. 모든 코드 스텝에 실제 before/after + 명령 + 기대출력.

**3. Type consistency:** 프레젠테이션 변경이라 시그니처·타입 변경 없음. 클래스 문자열(`block h-full`, `h-full min-h-[186px]`, guide className)이 spec과 일치.

**주의:** TDD 미적용은 의도적 — 순수 CSS 클래스 변경이라 의미 있는 실패 테스트를 쓸 수 없다. 검증은 typecheck+lint(회귀 가드)+시각 스모크로 대체(Global Constraints 명시).
