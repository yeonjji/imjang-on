# 메인 하단 편의시설 허브 섹션 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 메인 페이지(`app/(public)/page.tsx`) 맨 아래에, 기존 편의시설 리스트 페이지로 연결되는 정적 허브 섹션을 추가한다.

**Architecture:** 새 서버 컴포넌트 `AmenityHub`가 `LIFE_GROUPS`(단일 출처)를 매핑해 4개 그룹 카드 + 항목 칩을 렌더한다. DB 접근 없음. 컬러 이모지 대신 `lucide-react` 단색 라인 아이콘을 쓰고, 아이콘 매핑 완전성만 순수 단위 테스트로 검증한다.

**Tech Stack:** Next.js(App Router, 서버 컴포넌트), TypeScript, Tailwind(프로젝트 CSS 토큰), `lucide-react`, vitest.

**참고 spec:** `docs/superpowers/specs/2026-06-04-amenity-hub-section-design.md`

**확정 사실(검증됨):**
- CSS 토큰 정의됨: `--color-blue(#2563eb)`, `--color-blue-dark(#1e3a8a)`, `--color-muted(#64748b)`, `--color-line(#dbeafe)`, `--color-soft(#f1f7ff)`, `--shadow`.
- `lucide-react` 의존성 존재(nav·search에서 사용 중).
- `life-menu.ts`는 `LIFE_GROUPS`와 `LifeGroupSlug` 타입을 export 한다.
- 스크립트: `pnpm typecheck`(=`tsc --noEmit`), `pnpm test:unit`(=`vitest run tests/lib tests/ingest`).

---

## File Structure

- **Create:** `app/(public)/_components/amenity-hub.tsx` — `AmenityHub` 서버 컴포넌트 + `GROUP_ICONS`/`ITEM_ICONS` named export. 단일 책임: 편의시설 허브 섹션 렌더.
- **Create:** `tests/lib/amenity-hub-icons.test.ts` — 아이콘 매핑 완전성 단위 테스트(node 환경).
- **Modify:** `app/(public)/page.tsx` — `AmenityHub` import + 기존 flex 블록 다음에 렌더.

---

### Task 1: AmenityHub 컴포넌트 + 아이콘 매핑 (TDD)

**Files:**
- Create: `app/(public)/_components/amenity-hub.tsx`
- Test: `tests/lib/amenity-hub-icons.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/amenity-hub-icons.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LIFE_GROUPS } from '@/app/(public)/_components/life-menu';
import { GROUP_ICONS, ITEM_ICONS } from '@/app/(public)/_components/amenity-hub';

describe('amenity-hub 아이콘 매핑', () => {
  it('모든 그룹 slug에 아이콘이 매핑된다', () => {
    for (const group of LIFE_GROUPS) {
      expect(GROUP_ICONS[group.slug], `그룹 아이콘 누락: ${group.slug}`).toBeTruthy();
    }
  });

  it('모든 항목 label에 아이콘이 매핑된다 (폴백에 의존하지 않음)', () => {
    for (const group of LIFE_GROUPS) {
      for (const item of group.items) {
        expect(ITEM_ICONS[item.label], `항목 아이콘 누락: ${item.label}`).toBeTruthy();
      }
    }
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm vitest run tests/lib/amenity-hub-icons.test.ts`
Expected: FAIL — `@/app/(public)/_components/amenity-hub` 모듈/export 없음(import 에러).

- [ ] **Step 3: 컴포넌트 구현**

`app/(public)/_components/amenity-hub.tsx`:

```tsx
import Link from 'next/link';
import {
  GraduationCap, Stethoscope, ShoppingCart, TreePine,
  School, Baby, Hospital, Pill, Store, Coffee, Tent, SquareParking, Trees, Zap,
  MapPin, type LucideIcon,
} from 'lucide-react';
import { LIFE_GROUPS, type LifeGroupSlug } from './life-menu';

export const GROUP_ICONS: Record<LifeGroupSlug, LucideIcon> = {
  education: GraduationCap,
  medical: Stethoscope,
  amenity: ShoppingCart,
  urban: TreePine,
};

export const ITEM_ICONS: Record<string, LucideIcon> = {
  '학교': School,
  '어린이집': Baby,
  '병원·의원': Hospital,
  '약국': Pill,
  '편의점': Store,
  '마트': ShoppingCart,
  '카페': Coffee,
  '전통시장': Tent,
  '주차장': SquareParking,
  '공원': Trees,
  '충전소': Zap,
};

export function AmenityHub() {
  return (
    <section className="mt-10">
      <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">생활편의</p>
      <h2 className="mb-1 text-2xl font-black tracking-tight text-[var(--color-blue-dark)]">
        생활권까지 함께 보기
      </h2>
      <p className="mb-6 text-sm text-[var(--color-muted)]">
        학교·병원·상권·도시인프라 — 우리 동네 편의시설을 카테고리별로 둘러보세요.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {LIFE_GROUPS.map((group) => {
          const GroupIcon = GROUP_ICONS[group.slug] ?? MapPin;
          return (
            <article
              key={group.slug}
              className="rounded-[20px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow)]"
            >
              <Link
                href={`/life/${group.slug}`}
                aria-label={`${group.label} 전체 보기`}
                className="group flex items-center gap-3"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[var(--color-soft)] text-[var(--color-muted)]">
                  <GroupIcon size={20} aria-hidden />
                </span>
                <span className="text-base font-bold text-[var(--color-blue-dark)]">
                  {group.label}
                </span>
                <span className="ml-auto text-xs font-bold text-[var(--color-blue)] transition group-hover:translate-x-0.5">
                  더보기 →
                </span>
              </Link>

              <div className="mt-4 flex flex-wrap gap-2">
                {group.items.map((item) => {
                  const ItemIcon = ITEM_ICONS[item.label] ?? MapPin;
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="group inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] px-3 py-1.5 text-sm font-medium text-[var(--color-muted)] transition hover:border-[var(--color-blue)] hover:text-[var(--color-blue)]"
                    >
                      <ItemIcon
                        size={15}
                        className="text-[var(--color-muted)] transition group-hover:text-[var(--color-blue)]"
                        aria-hidden
                      />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
```

주의:
- `LifeGroupSlug`/`LIFE_GROUPS`는 `./life-menu`에서 import(같은 `_components` 디렉토리).
- 항목 `label`은 `life-menu.ts`의 정확한 문자열과 일치해야 한다('병원·의원'의 가운뎃점 `·` 포함).
- lucide export명이 버전에서 다르면(예: `TreePine`→`Trees`) 가장 가까운 단색 아이콘으로 대체하되, 매핑 키는 그대로 둔다.

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `pnpm vitest run tests/lib/amenity-hub-icons.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: 타입체크**

Run: `pnpm typecheck`
Expected: 에러 없음(0 exit).

- [ ] **Step 6: 커밋**

```bash
git add app/\(public\)/_components/amenity-hub.tsx tests/lib/amenity-hub-icons.test.ts
git commit -m "feat(main): 편의시설 허브 섹션 컴포넌트(AmenityHub) + 아이콘 매핑 테스트

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 메인 페이지에 배치

**Files:**
- Modify: `app/(public)/page.tsx`

- [ ] **Step 1: import 추가**

`app/(public)/page.tsx` 상단 import 블록에 추가(기존 `HeroSection`/`StatsBar` import 옆):

```tsx
import { AmenityHub } from './_components/amenity-hub';
```

- [ ] **Step 2: 렌더 위치 추가**

기존 `검색필터 + TypeHub` flex 블록(닫는 `</div>`) **다음**, 바깥 `</section>` **앞**에 한 줄 추가:

```tsx
      <div className="mt-10 flex flex-col gap-6 md:flex-row md:items-stretch">
        <div id="search-filter" className="min-w-0 flex-1 scroll-mt-24">
          <MainSearchFilter sidoList={sidoList} />
        </div>
        <aside className="w-full md:w-[380px] md:shrink-0">
          <TypeHub />
        </aside>
      </div>

      <AmenityHub />
    </section>
```

(`AmenityHub` 자체가 `mt-10`을 가지므로 추가 래퍼 불필요.)

- [ ] **Step 3: 타입체크**

Run: `pnpm typecheck`
Expected: 에러 없음.

- [ ] **Step 4: 빌드로 페이지 렌더 검증**

Run: `pnpm build`
Expected: 성공. `/` 경로가 에러 없이 정적/ISR 빌드됨. (DB 접근 추가 없으므로 기존 빌드 동작 유지.)

- [ ] **Step 5: 커밋**

```bash
git add app/\(public\)/page.tsx
git commit -m "feat(main): 메인 하단에 편의시설 허브 섹션 배치

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (작성자 체크)

- **Spec coverage:**
  - §4.1 파일(컴포넌트/page 수정/테스트) → Task 1·2 ✓
  - §4.2 LIFE_GROUPS 단일 출처 → Task 1 Step 3(직접 매핑) ✓
  - §4.3 아이콘 매핑(그룹 4 + 항목 11 + MapPin 폴백) → Task 1 Step 3 ✓
  - §4.4 마크업/동작(그룹 헤더→/life/{slug}, 칩→item.href, live만) → Task 1 Step 3 ✓
  - §4.5 스타일 토큰 → Task 1 Step 3 클래스 ✓
  - §5 정적/revalidate 영향 없음 → Task 2 Step 4 빌드 검증 ✓
  - §7 테스트(매핑 완전성, node 환경, Testing Library 미도입) → Task 1 Step 1 ✓
- **Placeholder scan:** 없음(모든 코드·명령 구체화).
- **Type consistency:** `GROUP_ICONS`/`ITEM_ICONS`/`AmenityHub` 명칭이 컴포넌트·테스트·page에서 일관. `LifeGroupSlug`/`LIFE_GROUPS`는 `life-menu.ts` 실제 export명과 일치.
