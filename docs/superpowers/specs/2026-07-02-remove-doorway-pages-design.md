# 도어웨이 메뉴 페이지 제거 — /life·/life/[group]·/region (Design)

**작성일:** 2026-07-02
**배경:** AdSense thin-content 대응. `/life`, `/life/education·medical·amenity·urban`, `/region`은 자체 정보가 없는 순수 링크 메뉴(도어웨이) 페이지로, 승인 심사에서 저품질 신호가 된다. 그룹 페이지 4개는 `/life`의 부분집합 완전 중복이고, `/life` 자체도 홈 `AmenityHub`·nav 드롭다운과 중복이며, `/region`은 footer에서만 링크되고 자식(`/region/[code]`)도 참조하지 않는 준고아 페이지다. 빌드업은 하위 목록 허브의 HubIntro 요약(#178)과 콘텐츠 중복이 불가피해 제거를 택한다(사용자 결정).

## 0. 목표 & 성공기준

- **목표:** 도어웨이 페이지 6개 URL을 제거하고, 모든 내부 링크가 실콘텐츠 페이지로 직결되게 한다.
- **성공기준:**
  - `/region`, `/life`, `/life/{education,medical,amenity,urban}` 요청 시 301로 대응 목적지에 도착한다.
  - 사이트 내 어떤 페이지에도 삭제된 URL로의 `<a>` 링크·JSON-LD 참조가 남지 않는다.
  - sitemap에 삭제된 6개 URL이 나오지 않는다.
  - nav 드롭다운·모바일 드로어·홈 `AmenityHub`로 11개 생활 카테고리 진입이 그대로 가능하다(UX 무손실).
  - `pnpm tsc --noEmit`·기존 테스트 통과(삭제 페이지 전용 테스트는 함께 정리).

## 1. 핵심 결정 (확정)

- **제거 대상 6 URL:** `/region`, `/life`, `/life/education`, `/life/medical`, `/life/amenity`, `/life/urban`. 라우트 파일 삭제(`app/(public)/region/page.tsx`, `app/(public)/life/page.tsx`, `app/(public)/life/[group]/page.tsx`). `/region/[code]`는 유지(실콘텐츠).
- **301 리다이렉트 (next.config, 6규칙):**
  - `/life/education` → `/school`
  - `/life/medical` → `/medical/hospital`
  - `/life/amenity` → `/amenity/convenience`
  - `/life/urban` → `/urban/parking`
  - `/life` → `/`
  - `/region` → `/list`
  - 근거: 그룹 URL은 각 그룹의 대표 목록 허브(HubIntro 보강된 실콘텐츠)로 보내 색인 승계·사용자 착지 모두 유리. 메뉴 클릭 차단과 무관하게 이미 색인된 URL·외부 링크를 위해 필요(sitemap 0.8로 제출됐던 URL들).
- **hero CTA 교체:** 홈 hero 부 CTA `📍 생활편의 둘러보기`(→`/life`) → **`📖 가이드 보기`(→`/guide`)** (사용자 결정). 원본 콘텐츠를 첫 화면 최상단에 노출.
- **전세보증 디스커버리 분리:** `LifeNavCard`(통짜 1카드→`/life`) 삭제, **11개 카테고리 개별 링크 그리드**로 교체(사용자 결정). `LIFE_GROUPS`+`LIFE_ITEM_EMOJI` 재사용, 각 항목 `item.href`로 직결(🏫 학교→`/school` … ⚡ 충전소→`/urban/charger`). 블록 헤더의 `둘러보기 →`(moreHref=/life) 제거.
- **nav 라벨화:** `LifeDropdown`·`mobile-drawer`의 그룹 헤더(`/life/{slug}` 링크)를 **클릭 불가 라벨**로 전환. 하위 항목 링크는 유지.
- **enrich-not-hide와의 정합:** 콘텐츠 페이지를 숨기는 게 아니라 정보 0의 중복 메뉴를 정리하는 것이므로 기존 원칙(#162 노인덱스 되돌림)과 충돌 없음.

## 2. 링크 정리 (인바운드 전수)

| 위치 | 현재 | 변경 |
|---|---|---|
| medical·amenity·urban·childcare·school 계열 breadcrumb (~15파일) | `홈 › 생활편의(/life) › 의료시설(/life/medical) › …` | 중간 두 크럼 삭제 → `홈 › …` (구현 시 grep으로 전수 확정) |
| `urban/[category]/[id]` JSON-LD breadcrumbSchema | `생활편의(/life)`·`도시인프라(/life/urban)` 노드 | 해당 노드 제거(화면 breadcrumb와 일치 유지) |
| nav `LifeDropdown` 그룹 헤더 | `<Link href="/life/{slug}">` | 클릭 불가 라벨(`<span>` 등) |
| `mobile-drawer` 그룹 링크 | `<Link href="/life/{slug}">` | 클릭 불가 라벨 |
| footer | `지역별 시세`→`/region` · `생활편의`→`/life` | `지역별 시세`→`/list`로 재지정 · `생활편의` 링크 제거 |
| 홈 `hero-section` 부 CTA | `📍 생활편의 둘러보기`→`/life` | `📖 가이드 보기`→`/guide` |
| `jeonse-discovery-section` 생활편의 블록 | `LifeNavCard`→`/life` + `둘러보기 →` | 11개 카테고리 개별 링크 그리드(`LIFE_GROUPS` 재사용), more 링크 없음 |
| `app/(public)/sitemap/page.tsx` (HTML 사이트맵) | `/region` 링크(20행) + `LIFE_GROUPS` 기반 `/life/{slug}` 그룹 헤더 링크(65행) | `/region` 항목 제거, 그룹 헤더는 비링크 라벨화(하위 `item.href` 직링크 유지) |

## 3. sitemap.xml & 메타

- `lib/sitemap/static-entries.ts`: `/region`, `/life`, `LIFE_GROUPS.map(/life/{slug})` 엔트리 제거 (총 6 URL).
- `/region/[code]` 등 나머지 엔트리는 무변경.

## 4. 부수 정리

- `app/(public)/life/_components/life-item-card.tsx`: 사용처가 삭제 페이지 2개뿐이면 함께 삭제(고아 방지). `life-menu.ts`는 드롭다운·드로어·`AmenityHub`·전세보증 그리드가 계속 사용하므로 유지.
- `lib/guide/page-category.ts`의 `life`·`region` 매핑: 유지(무해, 다른 소비자 없음 확인 후 정리는 선택).
- `lib/faq/data.ts`의 `region`·`life` FAQ: `/faq` 통합 페이지가 계속 노출하므로 유지.
- 삭제 페이지를 참조하는 테스트(`life-group-cards` testid, LifeDropdown 그룹 링크 단언 등): 삭제 또는 라벨화에 맞게 수정.
- RelatedGuides의 `pageKey="life"` 배선(직전 PR #188에서 `/life/[group]`에 추가)은 페이지 삭제와 함께 자연 소멸.

## 5. 테스트 & 검증

- **회귀:** `pnpm tsc --noEmit` · 관련 vitest 스위트 통과.
- **링크 잔존 0 확인:** `grep -rn '"/life' app/ lib/` 및 `'"/region"'`으로 삭제 URL 참조가 리다이렉트 설정 외에 없음을 확인.
- **redirect 동작:** next.config 규칙 6개에 대한 검증(dev 서버 curl -I로 308/301 + Location 확인).
- **수동 스모크:** 홈 hero CTA가 `/guide`로 이동, 전세보증 상세의 11개 링크 그리드 렌더, nav 드롭다운 그룹 헤더 비클릭.

## 6. 범위 밖 (YAGNI)

- `/region/[code]`·목록 허브 등 실콘텐츠 페이지 변경 · `/faq` 재편 · `AmenityHub` 개편 · 새 콘텐츠 작성 · Search Console 수동 제거 요청(301이 처리) · `life-menu.ts`의 `live`/`soon` 필드 정리.

## 7. 구현 단위 (plan 분해 예고)

1. 라우트 3파일 삭제 + next.config 301 6규칙 + sitemap 엔트리 제거 (+고아 컴포넌트 정리)
2. breadcrumb·JSON-LD 전수 정리 (~15파일)
3. nav 드롭다운·드로어 라벨화 + footer + hero CTA + 전세보증 그리드
4. 테스트 정리 + 회귀 + 링크 잔존 0 검증
