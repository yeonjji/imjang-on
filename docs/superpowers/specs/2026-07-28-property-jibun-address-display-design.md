# 실거래가 상세 — 지번주소 노출

**작성일:** 2026-07-28
**상태:** 설계 승인 완료, 구현 대기

## 1. 문제

아파트·오피스텔·연립다세대 상세 페이지가 위치를 **시도+시군구까지만** 보여준다. `헬리오시티 / 서울특별시 송파구`처럼 나오고, 그 아래 어디에도 정확한 주소가 없다.

발단은 "주소 데이터를 안 가진 건지, 갖고 있는데 표기를 안 하는 건지"라는 질문이었다. **후자다.**

수집 단계는 국토교통부 실거래가 API의 `umdNm`(법정동)·`jibun`(지번)을 전부 받아 저장하고 있다 (`scripts/ingest/transactions/adapter-apt-trade.ts:45-46` 외 5개 어댑터). `Transaction.umd`/`jibun` 컬럼에 들어가고, `buildAddress()`가 합쳐 `Property.address`에도 저장한다 (`scripts/ingest/transactions/runner.ts:265-271`).

표시 단계에서 버려진다.

- `Transaction.jibun` / `roadName` — `app/`·`lib/` 어디에도 참조 없음. `scripts/ingest`와 테스트에만 존재한다.
- `Property.address` — `<title>` 생성용 `detailTitleLocality()` 한 곳에서만 쓰이고, 그마저도 `region.sigungu`가 있으면 주소를 버린다 (`lib/region.ts:284-291`). 대부분의 단지에서 사용 0회.
- 히어로는 `region.fullName`만 출력 (`property-detail-hero.tsx:36`), JSON-LD `address`도 `property.region.fullName` (`apt/[id]/page.tsx:134`).

## 2. 실측 근거

2026-07-28, 운영 DB(OCI 박스 Postgres) 직접 집계. 대상 `Transaction` 7,680,868행.

### 주소 컬럼 채움률

| 유형 | 거래구분 | 행수 | 법정동 | 지번 | 도로명 |
|---|---|---:|---:|---:|---:|
| APARTMENT | 매매 | 1,660,267 | 100% | 100.0% | 0% |
| APARTMENT | 전세 | 2,022,286 | 100% | 100.0% | 0% |
| APARTMENT | 월세 | 1,769,140 | 100% | 100.0% | 0% |
| OFFICETEL | 매매 | 120,487 | 100% | 99.9% | 0% |
| OFFICETEL | 전세 | 278,188 | 100% | 99.9% | 0% |
| OFFICETEL | 월세 | 642,958 | 100% | 99.9% | 0% |
| ROW_HOUSE | 매매·전세·월세 | 154,258 | 100% | 100.0% | 0% |
| MULTIPLEX | 매매·전세·월세 | 1,033,284 | 100% | 100.0% | 0% |

`Property.address`는 275,573건 **전부(100%)** 채워져 있다.

### `Property.address`의 실제 형태

`roadName`이 전 행 null이라 `buildAddress()`의 도로명+지번 혼합 경로가 한 번도 타지 않았다. 결과적으로 `법정동 + 지번` 형태만 존재한다.

```
헬리오시티              → 가락동 913
파크리오                → 신천동 17
리센츠                  → 잠실동 22
경주외동사랑으로부영1단지 → 외동읍 모화리 1853
```

`region.fullName`과 합치면 `서울특별시 송파구 가락동 913` — 완전한 지번주소가 **추가 수집 없이** 조립된다.

### 지번 포맷 분포

| 형태 | 행수 | 비율 | 판단 |
|---|---:|---:|---|
| 부번 포함 (`913-1`) | 3,344,538 | 43.5% | 정상 지번 표기 |
| 산번지 (`산123`) | 7,698 | 0.10% | 정상 지번 표기 |
| 비정형 (`가-`, `BL`) | 22,016 | 0.29% | 아래 참조 |

비정형은 **국토부 원본값이다.** API 응답을 직접 확인했다 (`RTMSDataSvcAptRent`, `LAWD_CD=28275`, `DEAL_YMD=202302`):

```xml
<aptNm>루원시티2차SKLeaders`VIEW</aptNm><jibun>가-</jibun><umdNm>가정동</umdNm>
<aptNm>포레나루원시티</aptNm>       <jibun>가-</jibun><umdNm>가정동</umdNm>
```

루원시티 같은 **도시개발구역에서 지번 미부여 상태**를 국토부가 `가-`로 내려준다. 수집 과정의 절단이 아니다.

### 판정 규칙 실측

`Property.address`의 마지막 토큰을 §4.A의 엄격 패턴 `^(산)?\d+(-\d+)?$`로 검사했을 때 실패하는 단지는 **240개(0.087%)** 다. 토큰이 1개뿐인 단지는 27개.

느슨한 접두 검사(`^(산)?\d`)와 엄격한 전체 토큰 검사의 차이도 측정했다. 접두 검사를 통과하면서 엄격 검사에 실패하는 값은 **0건**이다. 즉 현재 데이터에서 두 규칙은 동작이 같고, 엄격 규칙은 향후 유입될 이상 형태에 대한 방어일 뿐 기존 주소를 추가로 버리지 않는다.

### 신뢰도 게이트 비용

§4.A의 게이트가 쓸 `SELECT COUNT(DISTINCT jibun) ... WHERE "propertyId" = $1`을 운영 DB에서 `EXPLAIN ANALYZE`로 측정했다. `Transaction_propertyId_contractDate_idx` 인덱스 스캔을 탄다.

| 대상 | 거래 행수 | 실행 시간 |
|---|---:|---:|
| 헬리오시티 (id 84658, 최다 거래급) | 9,176 | **22.9ms** |
| 다세대주택 (id 119438, 병합 사례) | 119 | **0.75ms** |

상세 페이지는 ISR 24시간이므로 단지당 하루 1회 수준이다. 이 비용으로 3.9% 단지의 부정확한 구조화 데이터 방출을 막을 수 있다.

## 3. 목표

- 상세 페이지에서 단지를 **주소로 식별**할 수 있다 (동명 단지 구분).
- 지번 검색어에 대응하는 **색인 가능한 본문·구조화 데이터**를 갖는다.
- 주소를 **복사**해 지도앱 등에 넘길 수 있다.
- 이미 보유한 공공데이터를 숨기지 않는다.

### 비목표

- 도로명주소 노출 — 데이터가 0%다. 별도 이슈(§7).
- 단지 병합 버그 수정 — 별도 이슈(§7).
- 목록 카드·검색 자동완성·거래 테이블 행별 주소 — 이번 범위 밖.
- 새 컬럼·마이그레이션·ETL 변경·재수집 — 전부 불필요하다.

## 4. 설계

### A. 데이터 계층

두 가지를 `lib/property.ts`에 추가한다. 이 파일은 이미 쿼리(`getPropertyById`)와 순수 헬퍼(`typeToSlug`)가 공존하는 곳이다.

#### A-1. 주소 파싱 — 순수 함수

핵심은 **정확한 지번주소와 법정동 폴백을 타입 수준에서 구분**하는 것이다. 둘을 한 필드에 담으면 소비자가 구분할 수 없어, 법정동일 뿐인 값이 복사 버튼과 `streetAddress`로 새어나간다.

```ts
export interface PropertyAddress {
  /** 법정동(읍·면·리 포함). 지번이 없어도 이것은 정확한 정보다 */
  locality: string | null;
  /** 지번. 엄격 패턴을 통과했을 때만 채워진다 */
  jibun: string | null;
  /** 정확한 지번주소(locality + jibun). 둘 중 하나라도 없으면 null */
  street: string | null;
  /** 화면 표시용 최선의 문자열. street → locality → 시군구 순으로 낮아진다 */
  display: string;
}

export function propertyAddress(
  property: { address: string },
  region: { fullName: string },
): PropertyAddress
```

`region.sido`/`region.sigungu`는 이 함수가 쓰지 않는다. JSON-LD의 `addressRegion`/`addressLocality`는 호출부에서 `property.region`을 직접 읽는다.

**판정 규칙:** 공백으로 토큰을 나누고 **마지막 토큰 전체**가 `/^(?:산)?\d+(?:-\d+)?$/`에 매치할 때만 지번으로 인정한다. 접두 검사(`^(산)?\d`)가 아니라 전체 토큰 검사다 — `1234블록` 같은 값이 지번으로 통과하지 않는다.

토큰이 1개뿐이면 지번으로 인정하지 않는다. 법정동 없는 맨 숫자는 주소가 아니다.

| 입력 `address` | `locality` | `jibun` | `street` | `display` |
|---|---|---|---|---|
| `가락동 913` | 가락동 | 913 | 가락동 913 | 서울특별시 송파구 가락동 913 |
| `외동읍 모화리 1853` | 외동읍 모화리 | 1853 | 외동읍 모화리 1853 | 경상북도 경주시 외동읍 모화리 1853 |
| `내곡동 산123` | 내곡동 | 산123 | 내곡동 산123 | 서울특별시 서초구 내곡동 산123 |
| `잠실동 19-1` | 잠실동 | 19-1 | 잠실동 19-1 | 서울특별시 송파구 잠실동 19-1 |
| `가정동 가-` | 가정동 | `null` | `null` | 인천광역시 서구 가정동 |
| `역삼동` (지번 결측) | 역삼동 | `null` | `null` | 서울특별시 강남구 역삼동 |
| `913` (단일 토큰) | `null` | `null` | `null` | 서울특별시 송파구 |
| `` (빈 문자열, 방어용) | `null` | `null` | `null` | 서울특별시 송파구 |

법정동이 두 단어인 주소(`외동읍 모화리 1853`, `고촌읍 태리 1234`)가 실재하므로 앞에서 자르지 않고 **뒤에서 한 토큰만** 검사한다. `buildAddress()`가 `umd + jibun` 순으로 조립하므로 마지막 토큰은 항상 지번 자리다.

기존 `detailTitleLocality()`(`lib/region.ts:284`)는 title 전용이고 목적이 다르므로(법정동 추출) **건드리지 않는다.**

#### A-2. 신뢰도 게이트 — 단일 지번 확인

§7.2의 이름 충돌 때문에, `Property.address`가 **그 페이지 단지의 주소라고 단정할 수 없는 경우가 3.9% 있다.** 병합된 단지에서 `Property.address`는 먼저 수집된 거래의 지번일 뿐이다.

이 구분은 추측할 필요 없이 **측정 가능하다.**

```ts
/**
 * 이 단지의 거래가 단일 지번에 모여 있는지.
 * false면 Property.address는 여러 지번 중 하나일 뿐이므로 '대표 지번'으로만 다뤄야 한다.
 */
export async function hasSingleJibun(propertyId: bigint): Promise<boolean>
```

`SELECT COUNT(DISTINCT jibun) FROM "Transaction" WHERE "propertyId" = $1` 한 방이고, `Transaction_propertyId_contractDate_idx`를 탄다 (§2 실측: 최악 22.9ms, 통상 0.75ms).

상세 페이지는 이 둘을 합쳐 **확정 주소인지**를 판단한다.

```ts
const addr = propertyAddress(property, property.region);
const confirmed = addr.street !== null && (await hasSingleJibun(property.id));
```

- `confirmed === true` — 정확한 지번주소다. 복사·`streetAddress`·description에 쓴다.
- `confirmed === false` — 화면에는 `대표 지번` 라벨을 달아 보여주되, 구조화 데이터에는 넣지 않는다.

**게이트를 두는 이유:** 목표는 "주소를 보여준다"가 아니라 "정확한 주소를 보여준다"다. 3.9%에 대해 검증되지 않은 주소를 `streetAddress`로 방출하는 것은 과장이며, PRODUCT.md의 "과장 금지" 원칙에 어긋난다. 게이트가 없다면 JSON-LD 반영 자체를 후속으로 미루는 게 맞지만, 비용이 22.9ms라면 미룰 이유가 없다.

### B. 표시 계층

**히어로 — `app/(public)/apt/[id]/_components/property-detail-hero.tsx`**

36번 줄 `{region.fullName}` → `{display}`. 이 컴포넌트는 아파트·오피스텔·빌라 상세가 **공유**하므로(`villa/[id]/page.tsx:18`, `officetel/[id]/page.tsx:18`) 한 번 고치면 셋 다 반영된다. 서버 컴포넌트를 유지한다.

**주소 줄 — `components/ui/address-line.tsx` (신규, 서버 컴포넌트)**

`confirmed === true`:

```
서울특별시 송파구 가락동 913   [복사]
출처: 국토교통부 · 자세히 보기
```

`confirmed === false` (거래가 여러 지번에 걸친 단지):

```
서울특별시 송파구 가락동 913   [대표 지번]   [복사]
이 단지의 거래는 여러 지번에 걸쳐 있습니다.
출처: 국토교통부 · 자세히 보기
```

- **서버 컴포넌트를 유지한다.** 복사 기능만 `components/ui/copy-button.tsx`(신규, `'use client'`)로 분리한다. 주소 텍스트·`대표 지번` 배지·`SourceCaption`은 클라이언트 번들에 들어갈 이유가 없다
- `CopyButton`은 `value: string`, `label: string`만 받는 범용 컴포넌트로 둔다
- `navigator.clipboard.writeText(value)`
- `aria-label="주소 복사"`, 복사 후 `role="status"`로 "복사됨" 안내 (WCAG 2.1 AA)
- 클립보드 API가 없으면 버튼을 렌더하지 않는다 — 동작하지 않는 버튼을 보여주지 않는다
- 출처는 기존 `<SourceCaption ids={['molit-rtms']} />` 재사용 — `lib/data-sources.ts` 레지스트리가 SSOT이므로 문구를 직접 쓰지 않는다
- `대표 지번` 배지는 기존 `<Badge>` 재사용

> 서버/클라이언트 분리의 이득은 **번들 크기**다. Next.js는 클라이언트 컴포넌트도 SSR하므로, 전체를 클라이언트로 만들어도 주소 텍스트는 HTML에 들어가고 크롤러가 읽는다. 색인 때문에 나누는 게 아니다.

`apt`·`villa`·`officetel` 세 페이지의 `<Card id="map">` 안, `<LocationViewer>` 위에 삽입한다 (3곳).

**`street === null`인 경우 (240개 단지, 0.087%):** 히어로는 `display`가 알아서 법정동 또는 시군구까지 낮춰 출력한다. 지도 섹션의 주소 줄은 **렌더하지 않는다** — 복사할 정확한 주소가 없기 때문이다.

### C. SEO 계층

**JSON-LD — `lib/seo/json-ld.tsx`**

`postalAddress()`는 `placeSchema()`(병원·학교·공원 등)와 공용이므로 **선택 인자만 추가**한다.

```ts
function postalAddress(address?: string, region?: string, locality?: string): Json {
  return {
    '@type': 'PostalAddress',
    addressCountry: 'KR',
    ...(region ? { addressRegion: region } : {}),
    ...(locality ? { addressLocality: locality } : {}),
    ...(address ? { streetAddress: address } : {}),
  };
}
```

`PlaceInput`에 optional `addressRegion` / `addressLocality`를 더하고 `residenceSchema` 호출부 3곳만 채운다. 인자를 주지 않는 `placeSchema` 소비자(병원·학교 등)는 항상 `address`를 넘기므로 **출력이 완전히 동일**하다.

`confirmed === true`일 때:

```jsonc
"address": {
  "@type": "PostalAddress",
  "addressCountry": "KR",
  "addressRegion":   "서울특별시",   // region.sido
  "addressLocality": "송파구",       // region.sigungu
  "streetAddress":   "가락동 913"    // PropertyAddress.street
}
```

`confirmed === false`일 때 — **`streetAddress` 속성 자체를 생략한다.**

```jsonc
"address": {
  "@type": "PostalAddress",
  "addressCountry": "KR",
  "addressRegion":   "서울특별시",
  "addressLocality": "송파구"
}
```

시군구 값을 `streetAddress`에 넣는 폴백은 쓰지 않는다. 그것이 바로 지금 고치려는 부정확함이고(§1), schema.org의 모든 `PostalAddress` 속성은 선택이므로 생략이 정상이다. 검증되지 않은 값을 채우는 것보다 비우는 편이 정확하다.

**description — 상세 페이지 `generateMetadata` 3곳**

`propertyMetaDescription`에 넘기는 `regionFullName` 인자 값을 **`confirmed === true`일 때만** `display`로 교체한다. 아니면 기존 `region.fullName`을 그대로 넘긴다. **`lib/seo/blurb.ts`는 수정하지 않는다** — 시그니처 변경 없이 호출부에서 값만 바꾼다.

`generateMetadata`도 `hasSingleJibun`을 호출해야 하지만, `cachedPropertyById`와 마찬가지로 `React.cache`로 감싸면 같은 요청 내 렌더와 중복 조회되지 않는다.

**title은 변경하지 않는다.** 이미 색인된 27만여 페이지의 title이 일제히 바뀌는 리스크를 감수할 만한 이득이 없다.

**알려진 한계 — 브리핑 있는 페이지의 description:** description은 `narrative?.text.slice(0,150) ?? propertyMetaDescription(...)` 구조다 (`apt/[id]/page.tsx:64`). **AI 브리핑이 있는 페이지는 `propertyMetaDescription`을 타지 않으므로 주소가 description에 들어가지 않는다.** 브리핑 문장 앞에 주소를 끼우면 문장이 어색해지고 150자 예산을 잠식하므로 이번 범위에서 손대지 않는다. 본문과 JSON-LD에는 어느 경로든 주소가 들어가므로 색인 목적은 대체로 달성된다.

### D. 테스트

- `propertyAddress()` 단위 테스트 — §4.A-1 표의 8개 케이스 전부. 특히 `가정동 가-`가 `street === null`이면서 `locality === '가정동'`인지 (폴백과 정확한 주소가 섞이지 않는지)
- `hasSingleJibun()` 통합 테스트 — 단일 지번 단지와 다중 지번 단지를 **자체 시드**로 만들어 검증. 앰비언트 데이터에 의존하면 CI에서 깨진다
- `residenceSchema` — `confirmed === true`면 `streetAddress` 존재, `false`면 **속성 자체가 없는지**. `'streetAddress' in address` 로 검사해 `undefined` 통과를 막는다
- `placeSchema` 회귀 — 병원 스키마 출력이 **변하지 않았는지**. 공용 함수를 건드리므로 이것이 핵심 방어선이다
- `pnpm lint` + `pnpm typecheck`

## 5. 영향 범위

| 파일 | 변경 |
|---|---|
| `lib/property.ts` | `propertyAddress()` · `hasSingleJibun()` 추가 |
| `lib/seo/json-ld.tsx` | `postalAddress()` 인자 3개(`address`를 선택으로), `PlaceInput` 필드 2개 |
| `app/(public)/apt/[id]/_components/property-detail-hero.tsx` | 1줄 교체 (3개 페이지 공용) |
| `components/ui/address-line.tsx` | 신규 (서버) |
| `components/ui/copy-button.tsx` | 신규 (클라이언트) |
| `app/(public)/{apt,villa,officetel}/[id]/page.tsx` | `AddressLine` 삽입, 게이트 호출, `residenceSchema` 인자, description 인자 |

## 6. 배포

스키마 변경·마이그레이션·재수집·ETL 변경이 **없다.** 상세 페이지는 ISR 24시간이므로 배포 후 순차 반영된다. 롤백은 커밋 되돌리기로 끝난다.

추가되는 부하는 상세 페이지당 `hasSingleJibun` 쿼리 1회다. 인덱스 스캔 22.9ms(최악)이고 ISR 캐시 뒤에 있으므로 단지당 하루 1회 수준이다.

## 7. 분리된 후속 이슈

실측 과정에서 발견했으나 이번 범위에서 의도적으로 제외한 결함 2건이다.

### 7.1 `roadnm` 필드명 오타 — 도로명주소 379만 행 유실 ✅ 코드 수정 완료 (재수집은 미결)

> **2026-07-28 수정됨.** `adapter-apt-rent.ts`가 `item.roadnm`을 읽도록 고쳤고, `buildAddress()`에서 도로명을 제거했다(아래 주의 참조). **기존 379만 행은 여전히 null이다** — 재수집은 별도 결정 사항이다.
>
> `buildAddress()`를 함께 고친 이유: 도로명이 채워지기 시작하면 `umd → roadName → jibun` 조립이 `가정동 봉오재2로 13 597-1`을 만들고, `propertyAddress()`가 이를 `locality = "가정동 봉오재2로 13"`으로 파싱해 **도로명이 법정동으로 둔갑한다.** 도로명 건물번호와 지번은 다른 번호 체계라 실존하지 않는 주소가 된다. 이제 `Property.address`는 `법정동 + 지번`만 담고, 도로명은 `Transaction.roadName`에 보존된다.
>
> 현재 앱에서 `Transaction.roadName`을 소비하는 코드는 없다. 이 수정은 **유실을 멈출 뿐 화면에 새로 노출되는 것은 없다.**

국토부 아파트 **전월세** API는 `roadnm`(전부 소문자)으로 **건물번호까지 포함한 완전한 도로명주소**를 준다.

```xml
<jibun>597-1</jibun><roadnm>봉오재2로 13</roadnm><umdNm>가정동</umdNm>
```

어댑터 6개 전부가 `item.roadNm`(대문자 N)을 읽고 있어 (`adapter-apt-rent.ts:41` 외) 768만 행 전체가 null이다. 영향은 아파트 전세 2,022,286 + 월세 1,769,140 = **3,791,426행(49.4%)**.

나머지 5개 API(아파트 매매, 오피스텔 매매·전월세, 연립 매매·전월세)는 응답에 도로명 필드가 **아예 없다** — 소스 한계이며 버그가 아니다. 3개 시군구·월 조합으로 교차 확인했다.

비정형 지번 22,016행 중 15,808행이 아파트 전월세이므로, 이 오타를 고치고 재수집하면 `가-` 케이스 상당수가 정확한 도로명주소를 얻는다. 다만 379만 행 재수집 비용이 따른다.

부수 확인: `externalKey`도 전 유형 0%다. 아파트 전월세 API는 `aptSeq`(예: `28260-4659`)를 주는데 `adapter-apt-rent.ts:42`가 `externalKey: null`로 하드코딩되어 버리고 있고, 아파트 매매 어댑터는 `item.aptSeq`를 읽지만 해당 API가 `aptSeq`를 주지 않는다.

### 7.2 단지 이름 충돌 — 서로 다른 단지의 통계 병합

`findOrCreateProperty`가 시군구 범위에서 `propertyType:name`만으로 매칭한다 (`runner.ts:165`). 동일 시군구에 동명 단지가 있으면 **한 Property로 병합된다.**

| 유형 | 단지 수 | 지번 갈림 | 비율 | 최악 |
|---|---:|---:|---:|---:|
| MULTIPLEX | 186,862 | 8,788 | 4.7% | 45개 |
| OFFICETEL | 17,779 | 621 | 3.5% | 20개 |
| APARTMENT | 45,472 | 947 | 2.1% | 10개 |
| ROW_HOUSE | 25,416 | 406 | 1.6% | 8개 |

아파트 표본: 광주 `현대`(967거래, 지번 7종), `호반`(473거래), `삼익`(623거래), `우미`, `금호`. 다세대는 `다세대주택`(지번 45종), `현대빌라`, `우성빌라` 등 일반명이 대량 병합됐다.

영향은 주소가 아니라 **통계**다 — 상세 페이지의 평균가·거래량·가격 차트가 다른 단지 거래를 섞어 계산한다.

이번 설계는 이 문제를 **드러내되 과장하지 않는다.** §4.A-2의 게이트가 다중 지번 단지를 판별해, 화면에는 `대표 지번` 라벨을 달고 구조화 데이터에서는 `streetAddress`를 생략한다. 검증되지 않은 주소를 확정 주소인 것처럼 방출하지 않는다.

다만 게이트는 **주소 표기만 막아줄 뿐 통계 오염 자체는 그대로다.** 평균가·거래량·가격 차트는 여전히 병합된 거래를 섞어 계산한다. 근본 수정이 필요하다.

수정 후보는 매칭 키를 `(유형, 이름, 법정동, 지번)`으로 넓히는 것인데, 여러 지번에 걸친 정상 대단지가 쪼개지는 반대편 문제가 생긴다. 별도 설계가 필요하다.

### 7.3 구현 후 남긴 것

구현·리뷰 과정에서 발견했으나 이번 PR 범위 밖으로 남긴 항목이다. 전부 실측 수치가 붙어 있다.

**세종형 Region의 JSON-LD 모순 — 234단지 (0.085%)**

`Property.regionCode`가 시군구가 아닌 **동 단위 Region을 가리키는 세종 단지가 237개** 있다(`region.fullName = "세종특별자치시 용호동"`, `address = "산울동 913"`). 근본 원인은 기존 시드 오분류이며 이 PR이 만든 것이 아니다.

화면 표시는 §4.A-1의 `regionPrefix()` 가드가 꼬리 법정동을 떼어 `세종특별자치시 산울동`으로 정정한다. 그러나 **JSON-LD는 정정되지 않는다** — `addressLocality`는 `region.sigungu`(`용호동`)를 그대로 쓰므로, 게이트를 통과하는 234단지에서 `addressLocality: "용호동"` + `streetAddress: "산울동 913"`이라는 서로 모순되는 쌍이 방출된다.

`main` 대비 악화는 아니다(`main`은 이 페이지들의 `streetAddress`에 `세종특별자치시 용호동`을 넣고 있었다). 근본 수정은 region 시드 재분류이고, 그것은 `selectSigunguTargets`가 load-bearing이라 별도 설계가 필요하다. 임시 완화가 필요하면 `region.fullName`의 꼬리가 법정동일 때 `addressLocality`를 생략하는 것이 한 줄이다.

**미확정 세종 단지의 히어로·description 불일치**

미확정(`대표 지번`) 상태에서 히어로는 정정된 `localityDisplay`(`세종특별자치시 산울동`)를, meta description은 원본 `region.fullName`(`세종특별자치시 용호동`)을 쓴다. 회귀는 아니지만(수정 전에도 description은 `region.fullName`이었다) `metaRegionName`의 미확정 분기가 `localityDisplay`를 쓰면 일관된다.

**게이트 결과의 ETL 사전계산**

`hasSingleJibun`은 ETL로만 바뀌는 값인데 렌더마다 계산한다. `updatePropertyAggregates`가 이미 ETL 후 영향 Property를 순회하므로 거기서 boolean 컬럼을 채우면 렌더 비용이 0이 되고 §4.A-2의 SQL도 한 곳에만 남는다. 27만 단지 × ISR 24h로 크롤러 주도 부하가 누적되고 OCI 단독 운영이라 공짜가 아니다.

**`generateMetadata`의 게이트 호출 무방어**

본문 호출은 `.catch(() => false)`로 보수적 표기로 낮추지만 `generateMetadata` 호출에는 방어가 없다. 요청 캐시를 공유해 실무상 함께 실패한다.
