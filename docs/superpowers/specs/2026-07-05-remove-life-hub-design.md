# /life 생활편의 허브 제거 → 카테고리 직결 (설계)

- 날짜: 2026-07-05
- 상태: 승인 대기

## 배경 / 목표

현재 "생활편의(life)"는 4개 그룹(교육·의료·상권·도시인프라)을 묶는 허브(`/life`,
`/life/[group]`)로 존재한다. 사용자는 이 허브 개념을 없애고, 방문자를 **개별 카테고리
리스트로 직결**시키길 원한다. 구체적으로:

1. `/life` 페이지(허브 인덱스 + 그룹 허브) 전체 제거
2. 메인 히어로의 "생활편의 둘러보기" 버튼 → 청약(`/subscription`)으로
3. 푸터의 단일 "생활편의" 링크 → 4개(교육시설·의료시설·상권편·도시인프라)로 분리
4. 맞춤전세보증 상세의 "생활편의 둘러보기" → 4개 카테고리로 각각 진입

## 핵심 규칙: 대표 리스트 매핑

`/life`·`/life/{group}`로 가던 모든 링크는 **각 그룹의 첫 항목(대표 리스트)** 으로 재지정한다.
(`LIFE_GROUPS[group].items[0].href`)

| 그룹 slug | 라벨 | 대표 리스트 |
|---|---|---|
| education | 교육시설 | `/school` |
| medical | 의료시설 | `/medical/hospital` |
| amenity | 상권·편의 | `/amenity/convenience` |
| urban | 도시인프라 | `/urban/parking` |

`/life` 인덱스(그룹 없음) 자체는 대표 콘텐츠인 `/school`로 승계한다.

## 결정 사항 (사용자 확정)

- **/life 제거 범위:** 트리 전체(`/life` + `/life/[group]`) 삭제.
- **브레드크럼:** "생활편의" 단계만 제거. 그룹 크럼은 유지하되 대표 리스트로 링크.
  (`홈 › {그룹} › {항목}`. 교육 계열은 원래 그룹 크럼이 없어 `홈 › {항목}`.)
- **히어로 버튼:** 라벨을 목적지에 맞게 `📅 청약 일정 보기`로 변경 + 목적지 `/subscription`.
- **리다이렉트:** `next.config.mjs`에 `/life`·`/life/{group}` 301 추가(색인·외부링크 보호).

## 보존(SSOT) / 안전 확인

- `LIFE_GROUPS`(`app/(public)/_components/life-menu.ts`)는 네비·푸터·허브·사이트맵의
  데이터 원천이므로 **유지**. 데이터 자체는 변경하지 않는다.
- `lib/life/sibling-tabs.ts`는 `item.href`(실제 경로)만 사용 → `/life/{slug}` 미생성. **변경 없음.**
- 삭제 후에도 모든 개별 카테고리 페이지(childcare·pharmacy·park·charger·mart·cafe·market)는
  네비 드롭다운·모바일 드로어·amenity-hub·sibling-tabs·사이트맵의 **하위 항목 링크로 도달 가능.**
  → **고아 페이지 없음.**

## 변경 대상 (전체 인벤토리)

### A. 삭제

- `app/(public)/life/` 디렉터리 전체
  - `page.tsx`, `[group]/page.tsx`, `_components/life-item-card.tsx`
- `tests/e2e/life-group-hub.spec.ts` (삭제되는 `/life/[group]` 전용 e2e)

### B. 요청된 4개 변경

1. **히어로** `app/(public)/_components/hero-section.tsx:26-31`
   - `href="/life"` → `href="/subscription"`
   - 라벨 `📍 생활편의 둘러보기` → `📅 청약 일정 보기`
2. **푸터** `app/(public)/_components/footer.tsx:22`
   - `<li>생활편의 →/life</li>` 한 줄을 4줄로 교체:
     교육시설→`/school`, 의료시설→`/medical/hospital`,
     상권·편의→`/amenity/convenience`, 도시인프라→`/urban/parking`
3. **전세보증 상세** `app/(public)/jeonse-guarantee/[grntDvcd]/_components/jeonse-discovery-section.tsx`
   - `LifeNavCard`(단일 `/life` 카드, L148-166)를 4개 그룹 링크 카드로 교체
     (각 그룹 라벨 → 대표 리스트). `LIFE_GROUPS`를 매핑해 렌더.
   - `DiscoveryBlock`(L74-96)의 `moreHref`/`moreLabel`을 **optional**로 바꿔,
     "생활편의" 블록은 헤더 "둘러보기 →" 링크 없이 렌더(단일 허브 목적지가 사라졌으므로).
   - L147 주석("/life 허브로 보내는 안내 카드") 갱신.

### C. 네비/도달성 (그룹 헤더 링크 재지정)

각 파일에서 그룹 헤더의 `href={`/life/${group.slug}`}` → `href={group.items[0].href}`:

4. `app/(public)/_components/life-dropdown.tsx:56`
5. `app/(public)/_components/mobile-drawer.tsx:130`
6. `app/(public)/_components/amenity-hub.tsx:49`
7. `app/(public)/sitemap/page.tsx:64`

하위 항목 링크는 그대로. (그룹 헤더가 하위 첫 항목과 같은 목적지를 가리키는 미세 중복은 수용.)

### D. 브레드크럼 — 화면 표시 (16줄)

규칙: `<Link href="/life">생활편의</Link><span>›</span>` 줄 **제거**;
그룹 크럼 `<Link href="/life/{slug}">` → 대표 리스트로 재지정.

- `urban/[category]/page.tsx:91-92`
- `urban/[category]/[id]/page.tsx:159-160`
- `urban/charger/[id]/page.tsx:90-91`
- `amenity/[category]/page.tsx:88-89`
- `amenity/[category]/[id]/page.tsx:86-87`
- `medical/pharmacy/page.tsx:45-46`
- `medical/pharmacy/[sigunguCode]/[id]/page.tsx:89-90`
- `medical/hospital/page.tsx:47-48`
- `medical/hospital/[sigunguCode]/[id]/page.tsx:101-102`
- `childcare/page.tsx:47`, `childcare/regions/page.tsx:32`,
  `childcare/[sigunguCode]/page.tsx:65`, `childcare/[sigunguCode]/[id]/page.tsx:129`
  (그룹 크럼 없음 → 생활편의 줄만 제거)
- `school/page.tsx:48`, `school/regions/page.tsx:32`,
  `school/[sigunguCode]/page.tsx:63`, `school/[sigunguCode]/[id]/page.tsx:121`
  (그룹 크럼 없음 → 생활편의 줄만 제거)

참고: 대표 리스트 페이지 자신(예: `/medical/hospital`)에서는 그룹 크럼이 자기 자신을
가리키는 미세 중복이 생김 — 수용.

### E. 브레드크럼 — JSON-LD 구조화 데이터 (5곳)

`breadcrumbSchema([...])` 배열(인덱스로 position 자동 부여)에서 `{ name: '생활편의',
url: `${SITE_URL}/life` }` 항목 **제거**; 그룹 항목 url을 `${SITE_URL}` + 대표 리스트로 재지정.
(화면 브레드크럼과 동일하게 맞춤. 리다이렉트 URL을 구조화 데이터에 노출하지 않기 위함.)

- `urban/[category]/[id]/page.tsx:142-143` (생활편의 + 도시인프라)
- `childcare/[sigunguCode]/[id]/page.tsx:114` (생활편의만)
- `medical/hospital/[sigunguCode]/[id]/page.tsx:87` (생활편의만; 아래 학교찾기類 크럼 유지)
- `medical/pharmacy/[sigunguCode]/[id]/page.tsx:81` (생활편의만)
- `school/[sigunguCode]/[id]/page.tsx:107` (생활편의만)

### F. 잔여 내부 링크(stale) 정리

8. `components/error-state.tsx:9` — `{ label: '생활정보', href: '/life' }`
   → 대표 리스트로 재지정(`href: '/school'`). 404/에러 페이지 퀵링크.
9. `lib/guide/seeds.ts:68,124` — `related: { label: '생활 인프라 보기', href: '/life' }`
   → `href: '/school'`.
   ⚠️ **시드 데이터**: 가이드 글이 이미 DB에 시드되어 `related.href`가 저장돼 있으면
   재시드/업데이트가 필요할 수 있음. 시드 파이프라인(런타임 참조 vs DB 저장) 확인 후 반영.

### G. XML 사이트맵 소스

10. `lib/sitemap/static-entries.ts:12,14` — `/life` 및 `/life/{slug}` 엔트리 제거.

### H. 리다이렉트

11. `next.config.mjs` `redirects()`에 301(permanent) 추가:
    - `/life` → `/school`
    - `/life/education` → `/school`
    - `/life/medical` → `/medical/hospital`
    - `/life/amenity` → `/amenity/convenience`
    - `/life/urban` → `/urban/parking`

### I. 테스트 갱신

12. `tests/lib/sitemap.test.ts:7-15` — `/life`·`/life/{slug}` 포함을 단언하는 두 블록을
    **부재 단언으로 반전**(또는 제거).
13. `tests/e2e/life-menu.spec.ts` — 그룹 라벨 클릭 시 `/life/{slug}` 이동 단언을 대표
    리스트 URL로 수정. `/life` 인덱스 이동 테스트는 제거.
14. `tests/e2e/life-group-hub.spec.ts` — **파일 삭제**(A 참조).

무영향(변경 없음, 확인만): `tests/lib/life-menu.test.ts`,
`tests/lib/amenity-hub-icons.test.ts`, `tests/lib/life/sibling-tabs.test.ts`
— `LIFE_GROUPS`/sibling-tabs만 검증하며 데이터는 불변.

## 범위 밖 (건드리지 않음)

- `lib/faq/data.ts`의 `'life'` FAQ 카테고리: 삭제 페이지 전용이라 죽은 설정이 되지만
  깨지지 않음. 별도 정리 요청 시 처리.

## 검증 (완료 기준)

1. `pnpm typecheck` 통과
2. `pnpm lint` 통과 (미사용 import — 예: 삭제된 컴포넌트 import — 제거 확인)
3. `pnpm test` 통과 (갱신된 sitemap 단위테스트 포함)
4. 리포 전체 `grep -rn "/life"` → `next.config.mjs`의 redirect source와
   무관 주석 외 잔여 참조 0
5. 수동 확인: 히어로 버튼→/subscription, 푸터 4링크, 전세보증 상세 4카드,
   네비 드롭다운/모바일 그룹 헤더→대표 리스트, `/life` 접속 시 301
