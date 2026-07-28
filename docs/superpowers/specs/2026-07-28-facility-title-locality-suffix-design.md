# 시설 상세 title 지역 접미사 설계

**작성일:** 2026-07-28
**배경:** 네이버 서치어드바이저 「중복 title」 진단 (`diagnosis-imjangon.co.kr-seo_duplicated_title.csv`, 1,914행 / 고유 title 100개)

---

## 1. 문제

시설 상세 페이지의 `title`이 **시설명 + 유형**만으로 조립돼, 전국에 흩어진 동명 시설이 같은 제목을 갖는다.

```
서울치과의원 — 치과의원 정보·주변 아파트 | 임장ON    ← 50개 URL이 동일
하나약국 — 약국 정보·주변 아파트 | 임장ON            ← 42개 URL이 동일
```

`apt`/`villa`/`officetel`은 `detailTitleLocality()`로 시군구가 이미 들어가 있어 이 문제에서 자유롭다. 시설 라우트에는 같은 장치가 없다.

### 1.1 네이버 CSV의 구성

CSV는 성격이 다른 세 문제가 섞여 있다.

| 유형 | 건수 | 시군구 접미사로 해결되는가 |
|---|---:|---|
| `/medical/hospital/…` | 1,197 | 그렇다 |
| `/medical/pharmacy/…` | 694 | 그렇다 (단 이미 `index:false`) |
| `/subscription/{id}` | 23 | **아니다** |

subscription 23건은 `서울은평뉴타운 디에트르 더 퍼스트` **한 공고**가 ID 23개로 갈라진 것이다. 전부 같은 은평구라 시군구를 붙이면 23개가 그대로 똑같아진다. 제목이 아니라 레코드 중복 문제다.

---

## 2. 실측

운영 DB에 읽기전용 SSH 터널(`default_transaction_read_only=on`, 쓰기 차단 검증 완료)로 접속해 전 라우트를 측정했다. CSV는 네이버가 크롤한 샘플일 뿐이라 실제 규모를 알아야 범위를 정할 수 있었다.

`t` = 현재 title을 결정하는 키(사이트명·고정 문구 제외), 중복 = 같은 키를 가진 행의 합.

| 라우트 | 전체 | 현재 중복 | 시군구 후 | 해소율 | 색인 |
|---|---:|---:|---:|---:|---|
| `/medical/hospital` | 79,772 | 30,290 | **201** | 99.3% | 조건부 색인 |
| `/medical/pharmacy` | 25,760 | 16,013 | **281** | 98.2% | 고정 noindex |
| `/childcare` | 25,142 | 3,515 | **24** | 99.3% | 조건부 색인 |
| `/school` | 12,566 | 2,612 | **22** | 99.2% | 조건부 색인 |
| `/urban/park` | 17,137 | 3,878 | 984 | 74.6% | 조건부 색인 |
| `/amenity/market` | 1,393 | 79 | 8 | 89.9% | 고정 noindex |
| `/amenity/cafe` | 115,722 | 35,022 | 14,641 | 58.2% | 고정 noindex |
| `/amenity/mart` | 61,073 | 22,629 | 9,027 | 60.1% | 고정 noindex |
| `/amenity/convenience` | 55,206 | 10,989 | 9,922 | 9.7% | 고정 noindex |
| `/urban/charger` | 101,703 | 10,147 | 8,650 | 14.8% | 고정 noindex |
| `/urban/parking` | 17,739 | 1,148 | 891 | 22.4% | 고정 noindex |
| `/finance` | 318 | 2 | 0 (기관명) | 100% | 색인 |
| `/board` | 44 | **0** | — | — | 색인 |
| `/jeonse-guarantee` | 47 | **0** | — | — | 색인 |

세 가지가 확정됐다.

**색인되는 시설 4종에서 시군구는 거의 완벽하다.** hospital 30,290 → 201, childcare 3,515 → 24, school 2,612 → 22.

**`board`·`jeonse-guarantee`는 중복 0건.** 추측으로 손댔으면 없는 문제에 코드를 넣을 뻔했다. `finance`는 2건뿐이고 `ofrinstnm`(제공기관명)이 이미 조회되고 있다.

**편의점·충전소는 시군구로 안 된다(9.7%, 14.8%).** 브랜드 체인이라 구조적으로 불가능하다.

```
씨유        서구  58개
세븐일레븐   —    58개
지에스25    서구  37개
```

### 2.1 시도를 함께 붙이면

동명 시군구가 있으므로(`서구`는 5개 시도에 존재) 시도를 붙이면 더 줄어들 것으로 보고 측정했다. 결과는 미미했다.

| 라우트 | 시군구만 | 시도+시군구 | 차이 |
|---|---:|---:|---:|
| `/medical/hospital` | 201 | 199 | −2 |
| `/medical/pharmacy` | 281 | 279 | −2 |
| `/childcare` | 24 | 6 | −18 |
| `/school` | 22 | 12 | −10 |

약 15만 페이지에서 32건. 원본 데이터가 이미 `대전서구`·`부산중구`처럼 시도를 품고 있어서다.

다만 **표기 명확성**에는 차이가 있다. 이름이 겹치는 시군구는 전국 243개 중 7개 이름 / 26곳이다.

| 시군구명 | 시도 수 | 시도 |
|---|---:|---|
| `동구` | 5 | 대구, 대전, 부산, 울산, 전남광주통합 |
| `중구` | 5 | 대구, 대전, 부산, 서울, 울산 |
| `남구` | 4 | 대구, 부산, 울산, 전남광주통합 |
| `북구` | 4 | 대구, 부산, 울산, 전남광주통합 |
| `서구` | 4 | 대구, 대전, 부산, 전남광주통합 |
| `강서구` | 2 | 부산, 서울 |
| `고성군` | 2 | 경남, 강원 |

`(서구)`만 보고는 어디인지 알 수 없다. **이름이 겹치는 26곳에만 시도를 붙인다.**

### 2.2 지역 해석 경로 — 컬럼 조회는 성립하지 않는다

당초 "`sigungu` 컬럼이 있으면 컬럼, 없으면 주소"로 분기하려 했으나 실측 결과 그 전제가 무너졌다.

`sigunguCode` → `Region`(level 2, 미폐지) 조인 성공률:

| 테이블 | 전체 | 조인 성공 | % |
|---|---:|---:|---:|
| `Store` | 311,857 | 224,216 | 71.9 |
| `Hospital` | 79,772 | 0 | **0.0** |
| `Pharmacy` | 25,760 | 0 | **0.0** |
| `Childcare` | 25,142 | 25,142 | 100.0 |
| `School` | 12,566 | 12,325 | 98.1 |
| `TraditionalMarket` | 1,393 | 1,256 | 90.2 |

- `Hospital`·`Pharmacy`의 `sigunguCode`는 심평원 코드라 법정동 코드와 체계가 다르다 — 조인이 전혀 되지 않는다.
- `Store`는 28%가 폐지된 시군구 코드다.
- `Park`·`Parking`·`EvCharger`는 `sigunguCode` 컬럼 자체가 없다.
- `Hospital.sigungu` 컬럼은 값이 `대전서구` 형식이라 Region의 `서구`와 표기가 어긋난다(서울만 `중구`처럼 접두 없음).

주소 첫 토큰이 시도 alias인 비율:

| 테이블 | % | | 테이블 | % |
|---|---:|---|---|---:|
| `Store` | 100.0 | | `Parking` | 100.0 |
| `Park` | 100.0 | | `TraditionalMarket` | 95.9 |
| `Pharmacy` | 93.9 | | `Childcare` | 93.5 |
| `Hospital` | 93.8 | | `School` | 90.2 |
| `EvCharger` | 93.6 | | | |

### 2.3 부수 발견 — 통합 시도의 구 명칭 주소가 매칭 실패

2026-07-01 광주+전남 통합으로 `Region`의 시도가 16개가 됐다. `전라남도`·`광주광역시` level-2 행은 사라지고 `전남광주통합특별시`(시군구 27개)만 남았다.

`lib/urban/region-from-address.ts`의 `SIDO_ALIASES`에는 `전남광주통합특별시` 항목이 없다. 다만 매칭 함수에 폴백이 있어 **신 명칭 주소는 정상 동작한다.**

```ts
const aliases = SIDO_ALIASES[r.sido] ?? [r.sido];   // ← 표에 없으면 자기 이름으로 폴백
```

깨지는 것은 **구 명칭으로 적힌 주소**다. `광주광역시 북구 …`는 `Region`에 `광주광역시`가 없고 alias 표도 신 시도로 연결해 주지 않아 어느 경로로도 매칭되지 않는다.

현재 이 함수를 쓰는 `/urban/*` 3종 기준 **6,310행**:

| 첫 토큰 | `EvCharger` | `Parking` | `Park` |
|---|---:|---:|---:|
| `전라남도` | 1,536 | 1,339 | 1,009 |
| `광주광역시` | 1,126 | 519 | 530 |
| `광주` | 160 | — | — |
| `전남` | 91 | — | — |

`Store`에도 19,935행(`전라남도` 11,783 + `광주광역시` 8,152)이 있으나 amenity는 아직 `sigunguCode`를 쓰므로 지금은 영향이 없다. **이 스펙이 주소 파싱으로 통일하는 순간 그 2만 행이 이 alias에 의존하게 된다.**

그래서 alias 보강은 이 스펙의 선행 조건이며, 별도 PR로 먼저 반영한다(§9).

alias 보강 후 잔여 미매칭은 전 시설 통틀어 약 120행(원본 오타 `전북특별차치도` 57행, 빈 문자열 17행, 시도 없이 시작하는 주소 ~50행)이다.

---

## 3. 범위

### 적용 (12)

`hospital` `pharmacy` `school` `childcare` `park` `parking` `charger` `convenience` `cafe` `mart` `market` `finance`

`noindex` 라우트도 포함한다. 같은 헬퍼를 쓰므로 추가 비용이 사실상 없고, 나중에 색인을 열더라도 제목이 이미 안전하다.

### 제외

| 제외 | 근거 |
|---|---|
| `board`, `jeonse-guarantee` | 중복 0건 — 고칠 문제가 없다 |
| `subscription` | 같은 공고가 ID 다수로 분산 — 레코드 병합 문제 (§7.1) |
| `apt`, `villa`, `officetel` | 시군구가 이미 있고 실체가 중복 (§7.2) |

경계는 이렇다.

| | 문제 | 해법 |
|---|---|---|
| **시설 라우트** | title에 지역이 아예 없음 | 지역 접미사 ← 이 스펙 |
| **단지·청약 라우트** | 지역은 이미 있고 실체가 중복 | 레코드 병합 ← 별도 |

---

## 4. 설계

### 4.1 표기 형식

시설명을 맨 앞에 유지하고 지역을 괄호로 바로 뒤에 붙인다. 상호명 정확매칭을 살리면서, 검색결과에서 제목이 잘려도 지역이 살아남는다.

```
서울치과의원 (강남구) — 치과의원 정보·주변 아파트 | 임장ON
서울치과의원 (대전 서구) — 치과의원 정보·주변 아파트 | 임장ON
중앙초등학교 (수원시) — 초등학교 정보·주변 아파트 | 임장ON
하나약국 (부산 중구) — 약국 정보·주변 아파트 | 임장ON
햇살론15 (서민금융진흥원) 한도·금리 — 주거금융 | 임장ON
```

길이는 33자 내외다. 루트 layout의 `template: '%s | 임장ON'`이 6자를 자동으로 붙인다.

`getAllSigungus()`는 level-2만 조회하므로 장안구 같은 일반구(level-3)는 부모 시(`수원시`) 단위로 접혀 나온다 — 지역 단위는 시군구 고정이라는 제약과 일관된 동작이다.

### 4.2 `lib/seo/title.ts` (신규)

제목 조립의 유일한 지점.

```ts
/**
 * 시설 상세 제목을 조립한다.
 * qualifier가 null이면 접미사 없이 기존과 동일한 문자열을 낸다 — 지역 해석 실패가 회귀를 만들지 않는다.
 */
export function qualifiedTitle(name: string, qualifier: string | null, tail: string): string {
  return qualifier ? `${name} (${qualifier}) ${tail}` : `${name} ${tail}`;
}
```

`tail`은 자체 구분자를 포함한다(`'— 치과의원 정보·주변 아파트'`, `'한도·금리 — 주거금융'`). 라우트마다 꼬리 모양이 달라 헬퍼가 구분자를 강제하지 않는다.

### 4.3 `lib/region.ts` — 역방향 조회 추가

`SIDO_LIST`는 이미 2026-07-01 통합을 담고 있다(`{ code: '1200000000', sido: '전남광주', fullName: '전남광주통합특별시' }`).

기존 `sidoPrefix()`는 **행정구역 코드 앞 2자리**(`'30'`, `'12'`)를 반환하므로 표시용으로 쓸 수 없다. `sidoFullName()`은 축약명 → 풀네임 방향뿐이다. `Region.sido`에는 풀네임이 담기므로 역방향이 필요하다.

```ts
/** 시도 풀네임 → 축약명. SIDO_LIST가 정적 상수라 조회 비용이 없다. */
export function shortSido(fullName: string): string | undefined {
  return SIDO_LIST.find(s => s.fullName === fullName)?.sido;
}
```

### 4.4 `lib/region/from-address.ts` (이동 + 확장)

현재 `lib/urban/region-from-address.ts`. 소비자가 urban 하나에서 12개 라우트로 늘어나므로 `urban` 네임스페이스를 벗어난다. 파일 이동 + import 갱신 외에 기존 로직은 건드리지 않는다.

**① alias 보강** — §2.3의 매칭 실패 수정. **선행 PR에서 이미 반영된다(§9).** 이 스펙 작업에서는 파일 이동 시 그대로 옮기기만 한다.

```ts
전남광주통합특별시: ['전남광주통합특별시', '광주광역시', '광주', '전라남도', '전남'],
```

기존 `광주광역시`·`전라남도` 항목은 **남겨둔다.** 카탈로그는 `Region` 행을 순회하며 `SIDO_ALIASES[r.sido]`를 찾는데, 실측 결과 `Region` level-2에 두 시도 행이 모두 없어 조회되지 않는다(활성 시도 16개: 경기·경남·경북·충남·충북·대구·대전·부산·서울·울산·인천·강원·세종·전북·제주·전남광주통합). 지워도 남겨도 동작이 같고, 남기는 쪽이 폐지 데이터 표시 경로(§4.3의 `SIDO_LIST` 주석 참조)와 어긋나지 않는다.

**② 카탈로그 적재 시 표시명 사전 계산** — 런타임 비용 0.

```ts
// 같은 sigungu 이름을 쓰는 시도가 2개 이상이면 시도를 앞에 붙인다.
// distinct 시도 수로 세므로 같은 시도 안의 중복 행(세종 오분류 등)에 흔들리지 않는다.
const sidosByName = new Map<string, Set<string>>();
for (const r of rows) {
  let set = sidosByName.get(r.sigungu);
  if (!set) sidosByName.set(r.sigungu, (set = new Set()));
  set.add(r.sido);
}

const label = sidosByName.get(r.sigungu)!.size > 1
  ? `${shortSido(r.sido) ?? r.sido} ${r.sigungu}`   // '대전 서구'
  : r.sigungu;                                       // '강남구'
```

**③ 구·군이 없는 시는 시 이름으로 접는다.** 세종은 `Region` level-2에 읍면동 33행이 `sigunguCode` 하나(`36110`)를 공유한다. ② 규칙만 적용하면 `(조치원읍)`처럼 동 이름이 나와 `(강남구)`와 단위가 어긋난다.

```ts
// 한 sigunguCode를 여러 행이 공유 = 구·군이 없는 시(세종) → 동 이름 대신 시 이름
const rowsPerCode = new Map<string, number>();     // sigunguCode → 행 수
const label = rowsPerCode.get(r.sigunguCode)! > 1
  ? (shortSido(r.sido) ?? r.sido)                  // '세종'
  : /* ② 규칙 */;
```

기존 `collapseSigungus()`(`lib/region.ts`)가 시군구 목록에서 쓰는 것과 같은 규칙이다. 다만 그 함수는 동 단위 행을 접어 없애므로 여기서 재사용하지 않는다(`lib/region.ts:146` 주석) — 주소 매칭에는 동 단위 행이 필요하고, 라벨만 접는다.

`?? r.sido` 폴백을 둔다. 앞으로 행정구역이 개편돼 `SIDO_LIST`에 없는 시도가 `Region`에 먼저 들어와도, 숫자나 `undefined` 대신 풀네임(`○○특별시 서구`)이 나온다 — 길지만 정확하다.

**③ 라벨 반환 함수 신규.** 기존 `resolveSigunguFromAddress` 시그니처는 바꾸지 않는다.

```ts
export async function resolveSigunguLabelFromAddress(addr: string | null | undefined): Promise<string | null>
```

### 4.5 지역 해석은 주소 파싱 한 경로

§2.2 근거로 `sigunguCode`·`sigungu` 컬럼을 쓰지 않는다. 모든 시설 테이블에 `address`가 있고, alias 보강 후 커버리지가 99.9%이며, 전 라우트 표기가 일관된다.

```ts
const locality = await resolveSigunguLabelFromAddress(item.address);
title: qualifiedTitle(item.name, locality, `— ${def.label} 정보·주변 아파트`),
```

`finance`만 예외로 `ofrinstnm`(기관명)을 쓴다 — 금융상품에 지역 개념이 없다.

카탈로그는 모듈 레벨 캐시라 프로세스당 1회만 `Region`을 읽는다. 상세 페이지는 전부 ISR(`revalidate` 최대 7일)이므로 재생성 시에만 발생한다.

### 4.6 라우트별 적용

| 라우트 | name | qualifier 소스 | tail |
|---|---|---|---|
| `medical/hospital` | `hospital.name` | address | `— {typeName} 정보·주변 아파트` |
| `medical/pharmacy` | `pharmacy.name` | address | `— 약국 정보·주변 아파트` |
| `school` | `school.name` | address | `— {schoolKind ?? '학교'} 정보·주변 아파트` |
| `childcare` | `item.name` | address | `— {crType ?? '어린이집'} 정원 {capacity ?? '-'}` |
| `amenity/{convenience,cafe,mart,market}` | `item.name` | address | `— {def.label} 정보·주변 아파트` |
| `urban/park` | `item.name` | address | `— 공원 정보·주변 아파트` |
| `urban/parking` | `item.name` | address | `— {def.label} 정보·주변 아파트` |
| `urban/charger` | `item.name` | address | `— 전기차충전소 정보·주변 아파트` |
| `finance` | `product.finprdnm` | `product.ofrinstnm` | `한도·금리 — 주거금융` |

`description`·`robots`·`canonical`은 건드리지 않는다.

---

## 5. 알려진 잔존 — 기록하고 고치지 않음

| 라우트 | 잔존 | 이유 |
|---|---:|---|
| `hospital` / `pharmacy` | 199 / 279 | 같은 구 진짜 동명 (`정치과의원` 남양주시 3개) |
| `school` / `childcare` | 12 / 6 | 동일 |
| `convenience` / `cafe` / `mart` | 9.9k / 14.4k / 8.9k | 브랜드 체인 — 시군구로 불가능, 고정 `noindex` |
| `charger` | 7.1k | 동일 |
| 주소 미매칭 | ~120행 | 원본 오타(`전북특별차치도`), 시도 없이 시작하는 주소 |

읍면동까지 내려가면 더 줄지만, 색인 대상 라우트에서 전체의 0.1~1%를 위해 주소 파싱 실패 경로를 늘릴 값어치가 없다. 브랜드 체인은 읍면동으로도 완전히 풀리지 않으며 해당 라우트는 전부 `noindex`라 SEO 실익이 없다.

---

## 6. 테스트

- **`qualifiedTitle` 단위** — qualifier 있음 / `null` / 빈 문자열
- **`resolveSigunguLabelFromAddress` 단위** — 동명 시군구(`대전 서구`) / 유일 시군구(`강남구`) / 구·군 없는 시(`세종특별자치시 조치원읍 …` → `세종`) / 신 시도명(`전남광주통합특별시`) / 구 시도명 alias(`광주광역시` → `전남광주 …`) / 미매칭(`null`)
- **`shortSido` 단위** — 풀네임 매칭 / 미등록 시도(`undefined`)
- **`generateMetadata` SSR 2종** — `hospital`(대표), `amenity/cafe`(카테고리 라벨 경로)

전 라우트 SSR 테스트는 만들지 않는다. 조립이 한 함수에 모여 있고 나머지는 인자 전달이다.

기존 `resolveSigunguFromAddress` 테스트는 시그니처가 불변이므로 그대로 통과해야 한다 — 회귀 감시선으로 쓴다.

---

## 7. 후속 (이 스펙 범위 밖)

### 7.1 subscription 공고 중복

`서울은평뉴타운 디에트르 더 퍼스트` 한 공고가 ID 23개로 갈라져 있다. 전체로는 5,869행 중 2,445행이 중복 title이고 시군구를 붙여도 2,339행이 남는다. 수집 단계에서 주택형/블록별로 별도 레코드가 생기는지 진단이 먼저다. 해법은 title이 아니라 canonical 또는 레코드 병합이다.

### 7.2 단지 레코드 중복

301 리다이렉트 행을 제외한 실제 렌더 페이지 기준:

| 유형 | 시군구만 | +읍면동 |
|---|---:|---:|
| 연립·다세대 | 4,103 | 1,100 |
| 아파트 | 2,752 | 2,196 |
| 오피스텔 | 892 | 812 |

아파트는 읍면동을 넣어도 20%만 준다. 남는 모양이 이렇다.

```
삼양비취타워  동해시 묵호진동  5개
프리가        구로구 오류동    4개
```

같은 동·같은 이름 단지 5개는 표기 문제가 아니라 한 단지가 여러 레코드로 갈라진 것이다. 메모리에 기록된 「동명 단지 병합 10,762건」과 같은 뿌리다.

### 7.3 `Store` 폐지 시군구 코드

`Store` 311,857행 중 87,641행(28%)의 `sigunguCode`가 `Region`의 미폐지 level-2에 없다. 이 스펙은 주소 파싱으로 우회하지만, 시군구 필터·목록 등 `sigunguCode`에 의존하는 기능은 여전히 영향을 받는다. 2026-07-01 개편(`project_region_reorg_2026jul`)과 연결해 별도 진단이 필요하다.

### 7.4 잔존 동명 시설의 읍면동 세분화

§5의 199/279/12/6건. 읍면동을 붙이면 해소되지만 주소 파싱 실패 경로가 늘어난다. 네이버 재진단에서 여전히 문제로 잡히면 그때 착수한다.

---

## 8. 배포

DB·마이그레이션·렌더 트리 변화가 없다. `title` 문자열만 바뀐다.

상세 페이지가 ISR(`revalidate` 최대 604,800초 = 7일)이므로 **기존 캐시가 만료돼야 새 제목이 나간다.** 강제 재검증은 하지 않는다 — 네이버 재진단도 캐시 만료 뒤라야 의미가 있다.

`og:title`은 Next가 `title`에서 채우므로 함께 바뀐다. 별도 작업이 없다.

---

## 9. 선행 PR — `전남광주통합특별시` alias

§2.3의 매칭 실패는 이 스펙과 무관하게 이미 `/urban/*` 6,310행에 영향을 주고 있으므로 **별도 PR로 먼저 반영한다.**

**범위:** `lib/urban/region-from-address.ts`의 `SIDO_ALIASES`에 통합 시도 1줄 추가 + 테스트. 파일 이동·라벨 계산·`shortSido`는 포함하지 않는다.

**테스트:** 통합 시도를 신 명칭·구 명칭(`광주광역시`/`광주`/`전라남도`) 양쪽으로 매칭. 신 명칭 케이스는 폴백 덕에 수정 전에도 통과하므로, 결함을 실제로 잡는 것은 구 명칭 케이스다 — 수정을 되돌려 실패를 확인했다.

이 PR이 머지된 뒤 본 작업을 시작한다. §4.4 ①은 이미 반영된 상태를 전제한다.
