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

`Property` 단위로 보면 주소에 숫자가 전혀 없는 단지는 **147개(0.05%)** 다.

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

### A. 데이터 계층 — 주소 조립 유틸

`lib/property.ts`에 순수 함수를 추가한다. 읽는 것은 기존 `Property.address`와 `Region`뿐이다.

```ts
export interface PropertyAddress {
  /** 화면·streetAddress용 지역 파트. 비정형이면 법정동까지만. 없으면 null */
  street: string | null;
  /** 완성된 표시 문자열: "서울특별시 송파구 가락동 913" */
  display: string;
}

export function propertyAddress(
  property: { address: string },
  region: { fullName: string; sido: string; sigungu: string | null },
): PropertyAddress
```

**판정 규칙:** 공백으로 토큰을 나눠 **마지막 토큰**이 `/^(산)?\d/`에 매치하면 지번으로 인정하고, 아니면 버린다.

| 입력 `address` | `street` | `display` |
|---|---|---|
| `가락동 913` | `가락동 913` | 서울특별시 송파구 가락동 913 |
| `외동읍 모화리 1853` | `외동읍 모화리 1853` | 경상북도 경주시 외동읍 모화리 1853 |
| `내곡동 산123` | `내곡동 산123` | 서울특별시 서초구 내곡동 산123 |
| `가정동 가-` | `가정동` | 인천광역시 서구 가정동 |
| `913` (단일 토큰) | `913` | 서울특별시 송파구 913 |
| `` (빈 문자열, 방어용) | `null` | 서울특별시 송파구 |

법정동이 두 단어인 주소(`외동읍 모화리 1853`, `고촌읍 태리 1234`)가 실재하므로 앞에서 자르지 않고 **뒤에서 한 토큰만** 검사한다.

**함수를 새로 만드는 이유:** 히어로·지도 섹션·JSON-LD·description 네 곳이 같은 판정을 해야 한다. 규칙이 흩어지면 화면과 구조화 데이터가 어긋난다.

기존 `detailTitleLocality()`(`lib/region.ts:284`)는 title 전용이고 목적이 다르므로(법정동 추출) **건드리지 않는다.**

### B. 표시 계층

**히어로 — `app/(public)/apt/[id]/_components/property-detail-hero.tsx`**

36번 줄 `{region.fullName}` → `{display}`. 이 컴포넌트는 아파트·오피스텔·빌라 상세가 **공유**하므로(`villa/[id]/page.tsx:18`, `officetel/[id]/page.tsx:18`) 한 번 고치면 셋 다 반영된다. 서버 컴포넌트를 유지한다.

**주소 줄 — `components/ui/address-line.tsx` (신규)**

```
서울특별시 송파구 가락동 913   [복사]
출처: 국토교통부 · 자세히 보기
```

- 복사 버튼 때문에만 `'use client'`
- `navigator.clipboard.writeText(display)`
- 버튼에 `aria-label="주소 복사"`, 복사 후 `role="status"`로 "복사됨" 안내 (WCAG 2.1 AA)
- 출처는 기존 `<SourceCaption ids={['molit-rtms']} />` 재사용 — `lib/data-sources.ts` 레지스트리가 SSOT이므로 문구를 직접 쓰지 않는다
- 클립보드 API가 없으면 버튼을 렌더하지 않고 텍스트만 — 동작하지 않는 버튼을 보여주지 않는다

`apt`·`villa`·`officetel` 세 페이지의 `<Card id="map">` 안, `<LocationViewer>` 위에 삽입한다 (3곳).

**`street === null`인 경우 (147개 단지):** 히어로는 시군구까지만 출력하고, 지도 섹션의 주소 줄은 **렌더하지 않는다.** 시군구만 복사시키는 것은 의미가 없다.

### C. SEO 계층

**JSON-LD — `lib/seo/json-ld.tsx`**

`postalAddress()`는 `placeSchema()`(병원·학교·공원 등)와 공용이므로 **선택 인자만 추가**한다.

```ts
function postalAddress(address: string, region?: string, locality?: string): Json {
  return {
    '@type': 'PostalAddress',
    addressCountry: 'KR',
    ...(region ? { addressRegion: region } : {}),
    ...(locality ? { addressLocality: locality } : {}),
    streetAddress: address,
  };
}
```

`PlaceInput`에 optional `addressRegion` / `addressLocality`를 더하고 `residenceSchema` 호출부 3곳만 채운다. 인자를 주지 않는 `placeSchema` 소비자(병원·학교 등)는 **출력이 완전히 동일**하다.

결과:

```jsonc
"address": {
  "@type": "PostalAddress",
  "addressCountry": "KR",
  "addressRegion":   "서울특별시",   // region.sido
  "addressLocality": "송파구",       // region.sigungu
  "streetAddress":   "가락동 913"    // PropertyAddress.street
}
```

`street`가 null이면 `streetAddress`에 기존처럼 `region.fullName`을 넣어 필드를 비우지 않는다.

**description — 상세 페이지 `generateMetadata` 3곳**

`propertyMetaDescription`에 넘기는 `regionFullName` 인자 값을 `display`로 교체한다. **`lib/seo/blurb.ts`는 수정하지 않는다** — 시그니처 변경 없이 호출부에서 값만 바꾼다.

**title은 변경하지 않는다.** 이미 색인된 27만여 페이지의 title이 일제히 바뀌는 리스크를 감수할 만한 이득이 없다.

**알려진 한계 — 브리핑 있는 페이지의 description:** description은 `narrative?.text.slice(0,150) ?? propertyMetaDescription(...)` 구조다 (`apt/[id]/page.tsx:64`). **AI 브리핑이 있는 페이지는 `propertyMetaDescription`을 타지 않으므로 주소가 description에 들어가지 않는다.** 브리핑 문장 앞에 주소를 끼우면 문장이 어색해지고 150자 예산을 잠식하므로 이번 범위에서 손대지 않는다. 본문과 JSON-LD에는 어느 경로든 주소가 들어가므로 색인 목적은 대체로 달성된다.

### D. 테스트

- `propertyAddress()` 단위 테스트 — §4.A 표의 6개 케이스 전부
- `residenceSchema` — `addressRegion`/`addressLocality` 출력 확인, `street === null` 폴백 확인
- `placeSchema` 회귀 — 병원 스키마 출력이 **변하지 않았는지**. 공용 함수를 건드리므로 이것이 핵심 방어선이다
- `pnpm lint` + `pnpm typecheck`

## 5. 영향 범위

| 파일 | 변경 |
|---|---|
| `lib/property.ts` | `propertyAddress()` 추가 |
| `lib/seo/json-ld.tsx` | `postalAddress()` 선택 인자 2개, `PlaceInput` 필드 2개 |
| `app/(public)/apt/[id]/_components/property-detail-hero.tsx` | 1줄 교체 (3개 페이지 공용) |
| `components/ui/address-line.tsx` | 신규 |
| `app/(public)/{apt,villa,officetel}/[id]/page.tsx` | `AddressLine` 삽입, `residenceSchema` 인자, description 인자 |

## 6. 배포

스키마 변경·마이그레이션·재수집·ETL 변경이 **없다.** 상세 페이지는 ISR 24시간이므로 배포 후 순차 반영된다. 롤백은 커밋 되돌리기로 끝난다.

## 7. 분리된 후속 이슈

실측 과정에서 발견했으나 이번 범위에서 의도적으로 제외한 결함 2건이다.

### 7.1 `roadnm` 필드명 오타 — 도로명주소 379만 행 유실

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

이번 설계가 이 문제를 **악화시키지는 않는다.** 대표 주소로 `Property.address`를 쓰므로 병합 단지도 주소 하나만 보여주며, 현재 노출 중인 시군구 정보와 정합성이 어긋나지 않는다. 다만 근본 수정 없이는 부정확한 통계가 유지된다.

수정 후보는 매칭 키를 `(유형, 이름, 법정동, 지번)`으로 넓히는 것인데, 여러 지번에 걸친 정상 대단지가 쪼개지는 반대편 문제가 생긴다. 별도 설계가 필요하다.
