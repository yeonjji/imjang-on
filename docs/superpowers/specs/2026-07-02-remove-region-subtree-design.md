# `/region` 서브트리 전체 제거 (Design)

**작성일:** 2026-07-02
**배경:** AdSense thin-content 대응. `/region` 트리는 세 층위 — `/region`(인덱스), `/region/{prefix}000`(시도 허브), `/region/{sigunguCode}`(시군구 상세) — 로 구성되는데, 앞 둘은 순수 링크 목록(도어웨이)이고 시군구 상세도 자동 생성 블러브 + 실거래 카드 12개로 `/list`와 겹치는 경계선 콘텐츠다. 사용자 판단상 전체가 thin-content 신호에 가까워, **트리 전체를 제거하고 `/list`로 승계**한다. 이 결정은 병렬 사이드이펙트 감사(4각도 + 완결성 비평)로 재검증했다.

> **관계:** 커밋된 doorway spec(`2026-07-02-remove-doorway-pages-design.md`)은 `/region`을 **인덱스만** 제거하고 자식 `/region/[code]`는 "실콘텐츠"로 유지하려 했다. 본 spec이 그 **`/region` 처리를 대체(supersede)** 한다 — 트리 전체 삭제 + `/region/:code` 리다이렉트 추가. doorway spec의 `/life` 관련 부분은 그대로 유효하다.

## 0. 목표 & 성공기준

- **목표:** `/region` 트리 전 URL(인덱스·시도허브·시군구 상세)을 제거하고, 모든 내부 링크가 실콘텐츠로 직결되게 하며, 자기 변경이 만든 고아 코드를 남기지 않는다.
- **성공기준:**
  - `/region`, `/region/{code}` 요청 시 **308**로 `/list`(시군구 코드는 `?region={code}`)에 착지한다.
  - 사이트 내 어떤 페이지에도 삭제된 URL로의 `<a>` 링크·JSON-LD 참조가 (리다이렉트 설정 외) 남지 않는다.
  - sitemap.xml·HTML 사이트맵에 `/region*` URL이 0건.
  - `pnpm tsc --noEmit` + 관련 vitest 통과(삭제 심볼 참조 테스트는 함께 정리).
  - `grep -rn '"/region' app lib components scripts`가 리다이렉트 설정 외 0건.

## 1. 핵심 결정 (확정)

- **라우트 삭제:** `app/(public)/region/` 디렉터리 통삭제 — `page.tsx`, `[code]/page.tsx`, `[code]/opengraph-image.tsx`.
- **리다이렉트 (`next.config.mjs`의 기존 `redirects()` 배열에 2규칙 추가, `permanent: true`=308):**
  - `{ source: '/region', destination: '/list' }`
  - `{ source: '/region/:code', destination: '/list?region=:code' }`
  - `parseListParams`가 `?region=` → `sigunguCode`로 매핑하므로(`lib/list-params.ts:48`) 시군구 코드는 실제 필터링되어 착지한다.
  - **기존 amenity 리다이렉트 규칙과 충돌 없음**(감사 확인). 배열에 append만 한다.
  - 시도-허브 코드(`{prefix}000`, ~17개)는 유효 시군구가 아니라 `/list`가 빈 결과로 graceful degrade — 허용(원래 순수 도어웨이, sitemap 미포함).
- **SEO 정직 노트:** 리다이렉트 목적지 `/list`는 `robots: { index:false, follow:true }`(noindex). 즉 이 작업은 ~250개 지역 페이지를 **의도적으로 색인에서 내리는(deindex)** 것이다. `?region=`은 사람이 옛 링크를 따라올 때 필터된 화면을 주는 UX일 뿐, "{지역} 아파트 실거래가" 검색 랭킹을 승계하진 않는다. (thin-content 제거가 목적이므로 방향 일치)

## 2. 인바운드 링크·사이트맵·robots 정리

> 라인 번호는 감사 시점 기준. 구현 시 grep으로 재확정한다.

| 위치 | 현재 | 변경 |
|---|---|---|
| `app/(public)/_components/footer.tsx:21` | `<Link href="/region">지역별 시세</Link>` | `/list`로 재지정(이미 목록 링크가 있으면 제거) |
| `app/(public)/sitemap/page.tsx:20` (HTML 사이트맵) | `{ href:'/region', label:'지역별 시세' }` | **행 제거**. 바로 위 `{ href:'/list', label:'통합 실거래가' }`가 의도 커버 |
| `app/robots.ts:6` | allow 배열에 `'/region/'` 포함 | `'/region/'`만 제거. `/list`·타 경로 영향 없음 |
| `lib/sitemap/static-entries.ts:12` | `{ url: '…/region', priority:0.8 }` | **행 제거** (doorway spec과 겹치는 idempotent 제거 — 충돌 아님) |
| `lib/sitemap/sources.ts:47–53` | `coreEntries()` 안에서 시군구마다 `/region/{code}` push (~250 URL) | **for 블록 삭제**. school/childcare/amenity 루프는 유지 |

- **XML 사이트맵**은 `app/sitemap.xml` → `app/sitemaps/*` 샤드가 요청 시점에 동적 재계산 → 재빌드/수동 스텝 불요. `core`가 첫 소스로 고정이라 `SOURCE_ORDER` 인덱스 매핑 불변, URL 수만 ~251개 감소(빈 샤드/오프바이원 없음 — 감사 확인).

## 3. ISR 재검증 파이프라인 정리 (감사 발견)

매일 실거래 수집 후 재검증 큐에 `/region/{code}`를 넣는 결합이 있다. 라우트 삭제 후 죽은 경로가 되므로 함께 정리한다(런타임은 no-op라 장애는 아니나, 내 변경이 만든 고아).

- `scripts/ingest/transactions/runner.ts` — `regionPath` import(6행) + `for (const sgg of affectedRegionCodes) paths.push(regionPath(sgg))`(134행) **제거**. `propertyPath()` 기반 property 재검증은 유지 → 데이터 신선도 영향 없음.
- `scripts/ingest/revalidator.ts:31–32` — `regionPath()` 함수 **삭제**(호출처 위 한 곳뿐).

## 4. 고아 심볼·테스트 정리

**삭제(내 변경이 만든 고아 — 기능 전용이라 잔존시키지 않음):**
- `app/(public)/_components/region-card.tsx` — 소비처가 삭제될 2페이지뿐(감사 확인).
- `lib/seo/blurb.ts` — `regionBlurb` + `RegionBlurbInput` 제거. 같은 파일의 `propertyBlurb`·`subscriptionBlurb`·`propertyMetaDescription`·`salePriceTrend`는 **유지**.
- `lib/region.ts:178` — `sidoFromHubCode` 제거. 시도-허브 코드(`{prefix}000`) 개념은 삭제될 `/region` 인덱스 링크에서만 생기므로 기능과 함께 소멸. (소비처: `/region/[code]` + 자기 테스트뿐 — 감사 확인)

**테스트 정리(위 삭제와 짝):**
- `tests/e2e/region.spec.ts` — `/region/11650` 방문 e2e → **파일 삭제**.
- `tests/lib/blurb.test.ts` — `regionBlurb` import + describe 블록 제거(그 외 블러브 테스트 유지).
- `tests/lib/region.test.ts` — import에서 `sidoFromHubCode` 제거 + 해당 describe 블록(51–66) 제거(그 외 region 유틸 테스트 유지).

**유지(다른 소비처 있음 — 감사로 각각 확인):** `@/lib/region`의 `getSidoList`·`getSigunguByCode`·`getSigungusBySido`(→`/api/regions`)·`sidoFullName`(→`lib/property.ts`)·`sidoPrefix`·`sidoFromPrefix`·`shortSidoFromRegionCode`·`getPopularSigungus`; `getRegionStats`(→apt insights)·`getTopPropertiesByVolume`(→apt/officetel/villa/loan); `/api/regions`; `/school/regions`·`/childcare/regions`; `lib/faq/data.ts`의 region FAQ(`/faq` 통합 페이지가 계속 노출); `lib/guide/page-category.ts`의 region 매핑(무해).

## 5. 테스트 & 검증

- **회귀:** `pnpm tsc --noEmit` + 관련 vitest 통과.
- **링크 잔존 0:** `grep -rn '"/region' app lib components scripts`가 리다이렉트 설정 외 0건.
- **리다이렉트 동작:** dev에서 `curl -I /region`·`/region/11110` → 308 + 올바른 `Location`(`/list`, `/list?region=11110`).
- **필터 착지:** `/list?region=11110`이 해당 시군구로 필터됨(시도-허브 코드는 빈 결과 = 예상 동작).

## 6. 범위 밖 (YAGNI / 발견사항)

- `/list`·`/apt/[id]` 등 실콘텐츠 페이지 변경, `/faq` 재편, `AmenityHub` 개편.
- **Search Console 수동 제거** — 308이 처리(수 주 소요). 급속 색인 해제가 필요하면 선택적 수동 요청.
- **`lib/revalidate.ts`의 `revalidateRegionTag`·`revalidatePropertyPaths`** — grep상 **호출자 0**, 내 변경 이전부터 죽은 코드. §3(기존 dead code는 언급만) 원칙에 따라 **손대지 않음**(발견 기록만).
- **`tests/lib/sitemap.test.ts`의 `/life`·`LIFE_GROUPS` 단언** — `/region`은 단언하지 않으므로 본 변경과 무관, **doorway spec 소관**.
- `docs/superpowers/plans/*.md`의 `/region` 텍스트 언급(~3곳) — 문서, 범위 밖.
- doorway spec의 `/life` 계열 작업.

## 7. 구현 단위 (plan 분해 예고)

1. `app/(public)/region/` 통삭제 + `next.config.mjs` redirects 2규칙 추가.
2. 사이트맵(XML static+dynamic) + robots + HTML 사이트맵 + footer 링크 정리.
3. 고아 삭제: `region-card.tsx` · `regionBlurb`+`RegionBlurbInput` · `sidoFromHubCode` + 각 테스트 정리.
4. ISR 파이프라인: `runner.ts`(import+push) + `revalidator.ts`(`regionPath`) 제거.
5. 회귀: `tsc` + vitest + 링크 잔존 0 grep + 리다이렉트 스모크(curl -I).
