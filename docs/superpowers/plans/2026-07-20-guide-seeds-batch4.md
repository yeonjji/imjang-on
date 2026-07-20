# 상록 가이드 7편 추가 (카테고리당 4편) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상록 가이드를 카테고리당 3편→4편(총 21→28편)으로 늘려 AdSense/SEO 색인 페이지와 상세페이지 맥락링크를 강화한다.

**Architecture:** 새 가이드는 `lib/guide/seeds.ts`의 시드 배열에 7개를 추가하는 것으로 정의된다. 본문은 CI(`generate-guides.yml`)가 LLM으로 생성해 DRAFT로 적재하고 `/admin/guides`에서 발행한다. 코드 변경은 (1) 시드 추가 (2) 개수 불변식 테스트 갱신 (3) 생성 스크립트의 `--only` CSV 지원 (4) 상세페이지 관련가이드 노출 3→4, 네 갈래다.

**Tech Stack:** TypeScript, Next.js(App Router), Prisma, Vitest, OpenAI(gpt-4.1, CI 전용), GitHub Actions.

## Global Constraints

- 개수 불변식: **카테고리당 정확히 4편, 총 28편**. (7개 카테고리: MEDICAL·CHILDCARE·SCHOOL·REALESTATE·SUBSCRIPTION·FINANCE·LIFE)
- 시드 `source.date`는 기존과 동일하게 `'2026-01-01'` 기준선을 쓴다.
- 시드 `source.url`은 실재하는 공식 포털만 쓴다. `source.url`은 `^https?://`로 시작해야 한다(시드 테스트가 강제).
- **재과금 방어:** 생성 스크립트는 LLM 호출이 dedupe보다 먼저 실행된다. `--only` 없이 전체 실행하면 기존 21편까지 LLM이 재호출(과금)된다. 신규 7 key만 CSV로 지정한다.
- 시드는 `angle`/`source` 텍스트만 제공한다. 고정 앵커 구조(핵심요약·FAQ·더 알아보기·참고자료)와 가드레일(시세 전망·투자 권유·과장 금지)은 LLM 생성 단계가 지킨다.
- 커밋 메시지 말미에 아래 트레일러를 붙인다:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Qyc2FGMXdRhFBPkiwB2fYG
  ```
- 브랜치: `feat/guide-seeds-batch4` (스펙 커밋이 이미 올라간 브랜치. 여기서 이어서 작업).

## File Structure

- `lib/guide/seeds.ts` — **수정.** `GUIDE_SEEDS` 배열에 7개 시드 추가. (책임: 가이드 시드 SSOT)
- `tests/lib/guide-seeds.test.ts` — **수정.** 개수 불변식 3→4, 21→28.
- `lib/guide/select-seeds.ts` — **신규.** `--only` 값(CSV/단일/미지정) → 생성 대상 시드 필터. 순수 함수(테스트 가능). (스크립트가 로컬 실행 불가라 로직을 여기로 분리해 보호)
- `tests/lib/guide-select-seeds.test.ts` — **신규.** `selectGuideSeeds` 단위 테스트.
- `scripts/generate-guides.ts` — **수정.** 인라인 `--only` 단일 파싱을 `selectGuideSeeds` 호출로 교체(CSV 지원).
- `app/(public)/_components/related-guides.tsx` — **수정.** `RelatedGuides` 기본 `limit` 3→4.

> 스펙 §3.3은 CSV 파싱을 스크립트 인라인으로 스케치했으나, 스크립트는 로컬 실행이 불가(OPENAI 키 부재)해 인라인 로직을 테스트할 수 없다. 동일 동작을 순수 헬퍼 `selectGuideSeeds`로 추출해 단위 테스트로 재과금 방어 로직을 보호한다. 동작은 스펙과 동일하다.

---

### Task 1: 가이드 시드 7편 추가 + 개수 불변식 갱신

기존 개수 불변식 테스트(카테고리당 3편/총 21편)를 4편/28편으로 먼저 바꾸면 RED(시드가 아직 21편)가 되고, 7개 시드를 추가하면 GREEN이 된다.

**Files:**
- Modify: `tests/lib/guide-seeds.test.ts:24-29`
- Modify: `lib/guide/seeds.ts:181` (배열 마지막 `]` 직전에 삽입)

**Interfaces:**
- Consumes: `GuideSeed` 인터페이스(`lib/guide/seeds.ts` 기존), `GuideCategory`(`@prisma/client`).
- Produces: `GUIDE_SEEDS` 길이 28, 카테고리당 4편. 신규 key 7종: `medical-hospital-tiers`, `childcare-kindergarten-vs-daycare`, `school-afterschool-care`, `realestate-property-registry`, `subscription-public-vs-private`, `finance-jeonse-loan-basics`, `life-ev-charger-access`.

- [ ] **Step 1: 불변식 테스트를 4편/28편으로 수정(RED 유도)**

`tests/lib/guide-seeds.test.ts`의 마지막 `it` 블록을 아래로 교체:

```ts
  it('카테고리당 정확히 4편이다(총 28편)', () => {
    const byCat = new Map<string, number>();
    for (const s of GUIDE_SEEDS) byCat.set(s.category, (byCat.get(s.category) ?? 0) + 1);
    for (const n of byCat.values()) expect(n).toBe(4);
    expect(GUIDE_SEEDS.length).toBe(28);
  });
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm exec vitest run tests/lib/guide-seeds.test.ts`
Expected: FAIL — `expected 3 to be 4` 및 `expected 21 to be 28` (시드가 아직 21편).

- [ ] **Step 3: 시드 7편 추가(GREEN)**

`lib/guide/seeds.ts`의 `GUIDE_SEEDS` 배열 마지막 항목(`life-neighborhood-safety`) 뒤, 닫는 `];` 앞에 아래 7개를 그대로 삽입:

```ts
  {
    key: 'medical-hospital-tiers',
    category: GuideCategory.MEDICAL,
    title: '의원·병원·종합병원, 종별 차이 이해하기',
    angle: '의원·병원·종합병원·상급종합병원의 종별 구분 기준과 진료 의뢰·회송(1·2·3차) 체계의 일반 구조, 이용 시 확인할 점을 설명한다.',
    source: { name: '건강보험심사평가원', url: 'https://www.hira.or.kr', date: '2026-01-01', excerpt: '요양기관 종별(의원·병원·종합병원·상급종합병원) 구분·현황 정보 공개.' },
    related: { label: '병원 찾기', href: '/medical/hospital' },
  },
  {
    key: 'childcare-kindergarten-vs-daycare',
    category: GuideCategory.CHILDCARE,
    title: '유치원과 어린이집, 무엇이 다를까',
    angle: '유치원(교육·교육부 소관)과 어린이집(보육·보건복지부 소관)의 대상 연령·운영·정보 확인처의 일반 차이를 설명한다.',
    source: { name: '교육부 유치원알리미', url: 'https://e-childschoolinfo.moe.go.kr', date: '2026-01-01', excerpt: '유치원 현황·정원·운영 정보 공개.' },
    related: { label: '어린이집 찾기', href: '/childcare' },
  },
  {
    key: 'school-afterschool-care',
    category: GuideCategory.SCHOOL,
    title: '초등 돌봄교실·방과후학교 이해하기',
    angle: '초등학교 돌봄교실과 방과후학교의 운영 목적·대상·신청의 일반 구조와 학교별 운영 정보를 확인하는 방법을 설명한다.',
    source: { name: '교육부 학교알리미', url: 'https://www.schoolinfo.go.kr', date: '2026-01-01', excerpt: '학교별 방과후학교·돌봄 운영 현황 공시.' },
    related: { label: '학교 정보 보기', href: '/school' },
  },
  {
    key: 'realestate-property-registry',
    category: GuideCategory.REALESTATE,
    title: '등기부등본, 무엇을 확인해야 할까',
    angle: '부동산 등기사항전부증명서(등기부등본)의 표제부·갑구·을구 구성과 소유권·근저당 등 확인 포인트의 일반 개념, 열람 방법을 설명한다.',
    source: { name: '대법원 인터넷등기소', url: 'https://www.iros.go.kr', date: '2026-01-01', excerpt: '부동산 등기사항전부증명서 열람·발급 서비스 제공.' },
    related: { label: '실거래가 조회하기', href: '/list' },
  },
  {
    key: 'subscription-public-vs-private',
    category: GuideCategory.SUBSCRIPTION,
    title: '국민주택과 민영주택, 청약 차이 이해하기',
    angle: '국민주택과 민영주택의 공급 주체·청약 자격·당첨자 선정 방식의 일반 차이를 설명한다.',
    source: { name: '한국부동산원 청약홈', url: 'https://www.applyhome.co.kr', date: '2026-01-01', excerpt: '국민·민영주택 청약 자격·당첨자 선정 방식 안내.' },
    related: { label: '청약 일정 보기', href: '/subscription' },
  },
  {
    key: 'finance-jeonse-loan-basics',
    category: GuideCategory.FINANCE,
    title: '버팀목 전세자금대출 이해하기',
    angle: '버팀목 전세자금대출 등 정책 전세대출의 목적·자격 구조와, 전세보증금 반환보증(HUG 등)과의 차이를 구분해 설명한다.',
    source: { name: '주택도시기금', url: 'https://nhuf.molit.go.kr', date: '2026-01-01', excerpt: '버팀목 전세자금대출 등 정책 전세대출 상품 안내.' },
    related: { label: '정책대출 상품 보기', href: '/finance' },
  },
  {
    key: 'life-ev-charger-access',
    category: GuideCategory.LIFE,
    title: '전기차 충전소, 어떻게 찾고 따져볼까',
    angle: '완속·급속 충전 방식의 일반 차이와 주거지 인근 전기차 충전소를 공식 데이터로 확인하는 방법·유의점을 설명한다.',
    source: { name: '환경부 무공해차 통합누리집', url: 'https://ev.or.kr', date: '2026-01-01', excerpt: '전국 전기차 충전소 위치·충전 방식 정보 제공.' },
    related: { label: '충전소 찾기', href: '/urban/charger' },
  },
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm exec vitest run tests/lib/guide-seeds.test.ts`
Expected: PASS (4개 it 모두 green — 고유성·필드·CTA·개수 28/4-each).

- [ ] **Step 5: 커밋**

```bash
git add lib/guide/seeds.ts tests/lib/guide-seeds.test.ts
git commit -m "$(cat <<'EOF'
feat(guide): 상록 가이드 시드 7편 추가 — 카테고리당 4편(총 28)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qyc2FGMXdRhFBPkiwB2fYG
EOF
)"
```

---

### Task 2: 생성 스크립트 `--only` CSV 지원 (순수 헬퍼 + 테스트)

`--only`가 단일 key만 받는 것을 CSV로 확장한다. 재과금 방어의 핵심 로직이므로 순수 함수로 분리해 단위 테스트한다.

**Files:**
- Create: `lib/guide/select-seeds.ts`
- Create: `tests/lib/guide-select-seeds.test.ts`
- Modify: `scripts/generate-guides.ts:13-19`

**Interfaces:**
- Consumes: `GUIDE_SEEDS`, `GuideSeed`(`lib/guide/seeds.ts`).
- Produces: `selectGuideSeeds(onlyValue: string | null | undefined, seeds?: GuideSeed[]): GuideSeed[]`. `onlyValue`가 falsy(미지정/빈문자열)면 전체, CSV면 해당 key만, 매칭 없으면 빈 배열.

- [ ] **Step 1: 실패 테스트 작성**

Create `tests/lib/guide-select-seeds.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GuideCategory } from '@prisma/client';
import { selectGuideSeeds } from '@/lib/guide/select-seeds';
import type { GuideSeed } from '@/lib/guide/seeds';

function seed(key: string): GuideSeed {
  return {
    key,
    category: GuideCategory.LIFE,
    title: 't',
    angle: 'a',
    source: { name: 'n', url: 'https://example.gov', date: '2026-01-01', excerpt: 'e' },
    related: { label: 'l', href: '/x' },
  };
}
const seeds = [seed('a'), seed('b'), seed('c')];

describe('selectGuideSeeds', () => {
  it('미지정(undefined/빈문자열)이면 전체 반환', () => {
    expect(selectGuideSeeds(undefined, seeds)).toHaveLength(3);
    expect(selectGuideSeeds('', seeds)).toHaveLength(3);
  });
  it('단일 key면 해당 시드만', () => {
    expect(selectGuideSeeds('b', seeds).map((s) => s.key)).toEqual(['b']);
  });
  it('CSV면 지정 key만(주변 공백 트림)', () => {
    expect(selectGuideSeeds('a, c', seeds).map((s) => s.key)).toEqual(['a', 'c']);
  });
  it('매칭 없는 key면 빈 배열', () => {
    expect(selectGuideSeeds('zzz', seeds)).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm exec vitest run tests/lib/guide-select-seeds.test.ts`
Expected: FAIL — `Cannot find module '@/lib/guide/select-seeds'`.

- [ ] **Step 3: 헬퍼 구현**

Create `lib/guide/select-seeds.ts`:

```ts
import { GUIDE_SEEDS, type GuideSeed } from '@/lib/guide/seeds';

/**
 * --only 값(CSV·단일 key·미지정) → 생성 대상 시드.
 * falsy면 전체(주의: 전체 실행은 기존 시드까지 LLM 재호출 = 재과금).
 * CSV면 해당 key만 반환(재과금 방어). 매칭 없으면 빈 배열.
 */
export function selectGuideSeeds(
  onlyValue: string | null | undefined,
  seeds: GuideSeed[] = GUIDE_SEEDS,
): GuideSeed[] {
  if (!onlyValue) return seeds;
  const keys = onlyValue.split(',').map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) return seeds;
  return seeds.filter((s) => keys.includes(s.key));
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm exec vitest run tests/lib/guide-select-seeds.test.ts`
Expected: PASS (4개 it 모두 green).

- [ ] **Step 5: 스크립트를 헬퍼 사용으로 교체**

`scripts/generate-guides.ts`에서 `import { GUIDE_SEEDS } ...` 아래에 헬퍼 import를 추가하고(기존 `GUIDE_SEEDS` import는 더 이상 직접 쓰지 않으면 제거), `main()` 상단의 `only` 파싱 블록을 교체.

import 교체:
```ts
import { selectGuideSeeds } from '@/lib/guide/select-seeds';
```
(`import { GUIDE_SEEDS } from '@/lib/guide/seeds';` 라인은 이제 미사용이면 삭제 — lint no-unused-vars 위반 방지)

`main()` 내부 교체 (변경 전 13-19행):
```ts
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const onlyValue = onlyArg ? onlyArg.slice('--only='.length) : undefined;
  const seeds = selectGuideSeeds(onlyValue);
  if (seeds.length === 0) {
    console.error(onlyValue ? `시드 없음: ${onlyValue}` : '시드가 비어 있습니다.');
    process.exit(1);
  }
```

- [ ] **Step 6: 타입·린트 확인**

Run: `pnpm typecheck && pnpm lint`
Expected: 통과. (미사용 import가 남아 있으면 lint가 `no-unused-vars`로 막으니 정리 확인)

- [ ] **Step 7: 커밋**

```bash
git add lib/guide/select-seeds.ts tests/lib/guide-select-seeds.test.ts scripts/generate-guides.ts
git commit -m "$(cat <<'EOF'
feat(guide): generate-guides --only CSV 지원 — 신규 시드만 일괄 생성(재과금 방어)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qyc2FGMXdRhFBPkiwB2fYG
EOF
)"
```

---

### Task 3: 상세페이지 관련가이드 노출 3→4

카테고리당 4편이 모두 상세페이지 맥락링크로 노출되도록 기본 `limit`을 올린다.

**Files:**
- Modify: `app/(public)/_components/related-guides.tsx:54`

**Interfaces:**
- Consumes: `getGuidesByCategory(category, limit)` — `publishedAt DESC take limit`. limit만 바꾸면 됨(쿼리 수정 불필요).
- Produces: 상세페이지당 관련가이드 최대 4개 노출.

- [ ] **Step 1: 기본 limit 변경**

`app/(public)/_components/related-guides.tsx`의 `RelatedGuides` 시그니처에서 `limit = 3`을 `limit = 4`로 변경:

```ts
export async function RelatedGuides({
  pageKey,
  className,
  limit = 4,
}: {
```

- [ ] **Step 2: 기존 SSR 테스트가 여전히 통과하는지 확인**

`tests/components/related-guides-ssr.test.ts`는 순수 뷰 `RelatedGuidesView`에 명시적 items를 넘겨 테스트하므로 이 변경과 무관하지만, 회귀 확인차 실행.

Run: `pnpm exec vitest run tests/components/related-guides-ssr.test.ts`
Expected: PASS (2개 it green).

- [ ] **Step 3: 타입·린트 확인**

Run: `pnpm typecheck && pnpm lint`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
git add "app/(public)/_components/related-guides.tsx"
git commit -m "$(cat <<'EOF'
feat(guide): 상세페이지 관련가이드 노출 3→4 — 카테고리당 4편 맥락링크

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Qyc2FGMXdRhFBPkiwB2fYG
EOF
)"
```

---

### Task 4: 전체 게이트 통과 + PR

코드 3개 태스크를 합쳐 전체 검증하고 PR을 올린다. (본문 생성·발행은 머지 후 운영 런북 Task 5)

**Files:** 없음(검증·PR).

- [ ] **Step 1: 전체 단위+통합 테스트**

Run: `pnpm test`
Expected: 전체 PASS. (특히 `guide-seeds`·`guide-select-seeds`·`related-guides-ssr` green)

- [ ] **Step 2: 타입·린트 전체**

Run: `pnpm typecheck && pnpm lint`
Expected: 통과.

- [ ] **Step 3: 푸시 + PR 생성**

```bash
git push -u origin feat/guide-seeds-batch4
gh pr create --base main --title "feat(guide): 상록 가이드 7편 추가 — 카테고리당 4편(총 28), AdSense enrich" --body "$(cat <<'EOF'
## 요약
상록 가이드를 카테고리당 3→4편(21→28)으로 확장. AdSense/SEO enrich 목적.

## 변경
- 시드 7편 추가(`lib/guide/seeds.ts`) + 개수 불변식 4/28
- `generate-guides --only` CSV 지원(`lib/guide/select-seeds.ts`) — 재과금 방어
- 상세페이지 관련가이드 노출 3→4

## 머지 후(운영 런북)
1. `gh workflow run generate-guides.yml --ref main -f only=<7키 CSV>`
2. 로그 7×`created` 확인 → `/admin/guides` 검수·발행

설계: `docs/superpowers/specs/2026-07-20-guide-seeds-batch4-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR URL 출력.

---

### Task 5: 운영 런북 — 본문 생성·발행 (머지 후 수동)

> ⚠️ 이 태스크는 코드가 아니라 운영 작업이다. **PR 머지 후**, OPENAI 키가 있는 CI와 `/admin/guides` 접근 권한이 있는 사람(사용자)이 수행한다. 서브에이전트는 이 태스크를 자동 실행하지 말고, 사용자에게 실행을 요청한다.

- [ ] **Step 1: 신규 7키만 생성 워크플로 dispatch**

```bash
gh workflow run generate-guides.yml --ref main \
  -f only=medical-hospital-tiers,childcare-kindergarten-vs-daycare,school-afterschool-care,realestate-property-registry,subscription-public-vs-private,finance-jeonse-loan-basics,life-ev-charger-access
```
> `--only` 없이 실행 금지 — 기존 21편까지 LLM 재호출(과금)된다.

- [ ] **Step 2: 실행 로그로 생성 성공 확인**

```bash
gh run list --workflow=generate-guides.yml --limit 1
gh run view <run-id> --log | grep -E ': (created|rejected|duplicate|error)'
```
Expected: **7줄 모두 `<key>: created`**. `rejected`(가드레일 위반)·`error`면 해당 key만 Step 1을 다시 실행. **job success ≠ 생성 성공** — 반드시 라인 확인.

- [ ] **Step 3: 검수·발행**

`/admin/guides` 대기(DRAFT) 탭에서 신규 7편을 검수하고 발행한다.

- [ ] **Step 4: 노출 확인**

- `/guide` 목록과 각 `/guide/<slug>`에 7편 노출 확인.
- 샘플 상세페이지 최소 1곳(임의 apt 상세, `/medical/hospital/...`)의 "관련 가이드" 블록에 신규 글 노출(카테고리당 최대 4편) 확인.
- 가이드 사이트맵(`lib/sitemap/sources.ts` 경유)에 신규 슬러그 반영 확인.

---

## Self-Review

**1. Spec coverage:**
- 스펙 §2(7 시드) → Task 1 Step 3 ✅
- 스펙 §3.1(seeds.ts) → Task 1 ✅ / §3.2(불변식) → Task 1 Step 1 ✅ / §3.3(--only CSV) → Task 2 ✅ / §3.4(limit 3→4) → Task 3 ✅
- 스펙 §4(운영 런북) → Task 5 ✅
- 스펙 §5(검증: 시드 테스트·lint·typecheck·생성·노출·사이트맵) → Task 4 Step 1-2 + Task 5 Step 2·4 ✅
- 스펙 §6(리스크: rejected 재실행·재과금·출처) → Task 2(재과금 방어 헬퍼·테스트) + Task 5 Step 1·2(재실행·only 경고) ✅
- 스펙 §7(범위 밖) → 신규 카테고리·기존 재생성·page-category·ETL 변경 없음, 계획에 미포함 ✅

**2. Placeholder scan:** TBD/TODO/모호 표현 없음. 모든 코드 스텝에 실제 코드·명령·기대 출력 포함.

**3. Type consistency:** `selectGuideSeeds(onlyValue, seeds?)` 시그니처가 Task 2의 정의·테스트·스크립트 사용처에서 일치. `GuideSeed`/`GUIDE_SEEDS`/`GuideCategory` 명칭이 기존 코드와 일치. `RelatedGuides`의 `limit` prop 명칭이 기존과 일치. 신규 시드 key 7종이 Task 1·Task 5에서 동일.
