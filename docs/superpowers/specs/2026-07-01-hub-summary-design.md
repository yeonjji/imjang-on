# 허브 페이지 상단 요약 설계 (생활편의·실거래 6개 허브)

작성일: 2026-07-01
상태: 승인 대기 (사용자 리뷰 전)

## 배경 / 문제

AdSense "가치가 낮은 콘텐츠" 거절 대응. 상세페이지의 탭 콘텐츠는 이미 SSR로 봇에 노출됨(별도 진단 완료)이라 이번 작업 대상이 아니다. 문제는 **허브/리스트 페이지**다. 현재 개수만 표시되는 허브들은:

- `/amenity/cafe?sido=서울` → "전체 21,619개" + 가나다순 카드 덤프. 요약·분포·맥락 전무.
- `/medical/hospital` → "전국 79,562개" + 카드 목록. 설명 없음.
- `/officetel`, `/villa` → 제목 + "거래 많은 TOP N"만. 설명 문구 완전 부재.

개수만 바뀌는 페이지들은 사용자 가치가 낮고, 봇에게는 근접중복(near-duplicate)·thin content로 보인다.

## 목표

대상 6개 허브에 **고유한 상단 요약 산문**을 SSR로 추가한다. 요약은 페이지마다 실제 값이 달라 근접중복을 벗어나야 한다. 기존 리스트/필터/카드 UX는 건드리지 않는다(최소 침습).

### 대상 허브 (6개)

| 라우트 | 파일 | 스코프 | 렌더링 |
|--------|------|--------|--------|
| `/officetel` | `app/(public)/officetel/page.tsx` | 전국 | force-dynamic |
| `/villa` | `app/(public)/villa/page.tsx` | 전국 | force-dynamic |
| `/amenity/[category]` | `app/(public)/amenity/[category]/page.tsx` | 시도 또는 시군구 | revalidate 21600 |
| `/urban/[category]` | `app/(public)/urban/[category]/page.tsx` | 시도 또는 시군구 | revalidate 21600 |
| `/medical/hospital` | `app/(public)/medical/hospital/page.tsx` | 전국(+region 필터) | revalidate 86400 |
| `/medical/pharmacy` | `app/(public)/medical/pharmacy/page.tsx` | 전국(+region 필터) | revalidate 86400 |

### 비목표

- 상세페이지 변경
- 리스트/필터/카드 UX 재구성
- 인구 데이터 ETL (지역별 인구 데이터가 DB에 없음 — 진짜 밀도 계산 불가, 이번 범위 제외)
- `/region`, `/apt`, `/school`, `/childcare`, `/subscription`, `/finance` (이미 산문 있거나 이번 범위 밖)

## 아키텍처 — 3계층 분리

```
[집계 lib]  도메인별 지역 분포 쿼리(DB) → 정규화된 HubSummaryData 반환
   ↓
[프로즈 빌더]  순수 함수: HubSummaryData → 한국어 문장 배열 (LLM 없음, 결정적)
   ↓
[HubSummary 컴포넌트]  서버 컴포넌트, 헤더 카드 안에 렌더 (SSR → raw HTML 포함)
```

각 계층은 독립 테스트 가능하다. 프로즈 빌더는 순수 함수라 값만 넣어 문장을 검증한다. 집계는 도메인 lib에 두어 기존 쿼리 패턴을 재사용한다.

### 공통 데이터 인터페이스

```ts
export type HubScopeLevel = 'nation' | 'sido' | 'sigungu';

export interface HubSummaryData {
  kind: 'amenity' | 'medical' | 'property';
  categoryLabel: string;        // "카페", "병원·의원", "오피스텔"
  scopeLabel: string;           // "서울", "전국", "서울 강남구"
  scopeLevel: HubScopeLevel;
  total: number;
  topRegions: { name: string; count: number }[];  // 상위 3 (집계 단위는 scopeLevel이 결정)
  concentrationPct?: number;    // 상위 3 지역이 전체에서 차지하는 비중(%)
}
```

`topRegions`의 집계 단위는 `scopeLevel`이 결정한다:
- `nation` → 시·도별 GROUP BY
- `sido` → 시·군·구별 GROUP BY
- `sigungu` → 하위 집계 없음 (폴백 처리)

### 집계 함수 (도메인 lib)

- `getAmenityRegionBreakdown(slug, scope)` — sido 스코프면 시군구별, 전국이면 시도별 GROUP BY count
- `getMedicalRegionBreakdown(kind: 'hospital' | 'pharmacy', region?)` — region 없으면 시도별 GROUP BY count; region 있으면 시군구 스코프로 폴백
- `getPropertyHubStats(type: PropertyType)` — 최근 12개월 거래량 시도별 분포(상위 3 + 전체)

집계 실패 시 각 함수는 `null`을 반환하고, 호출부는 요약을 생략한다(개수만 렌더). officetel/villa는 force-dynamic이므로 기존 `getTopPropertiesByVolume`과 동일하게 `.catch(() => null)` 폴백으로 감싼다.

## 프로즈 규칙

### 용어

- **"등록 수 · 분포 · 비중"** 만 사용한다.
- **"밀집도 / 밀도"는 쓰지 않는다** (인구 정규화 데이터가 없어 과장이 됨. PRODUCT.md "과장 금지" 원칙).

### 집중도 프레이밍 단일화

페이지 종류와 무관하게 집중도는 **항상 "상위 3개 {지역단위}가 전체의 약 N% 비중"** 하나로 표현한다. "수도권 N%" 등 다른 프레이밍과 혼용하지 않는다.

### 집계 단위 ↔ 문장 표현 일치

`scopeLevel`이 문장의 지역단위 라벨을 결정한다. 집계 기준과 문장 표현이 반드시 일치해야 한다.

| scopeLevel | 집계 기준 | 문장의 지역단위 |
|------------|----------|----------------|
| `nation` | GROUP BY 시·도 | "시·도별 분포를 보면 …" |
| `sido` | GROUP BY 시·군·구 | "시·군·구별 분포를 보면 …" |
| `sigungu` | 하위 집계 없음 | → 폴백 문장 |

### 정상 문장 (분포·비중 포함)

3단 구성: (정체) + (분포 상위 3) + (상위 3 비중).

- **sido 스코프 예 (amenity 서울 카페):**
  > 서울에 등록된 카페는 21,619곳입니다. 시·군·구별 분포를 보면 강남구(2,100)·마포구(1,340)·송파구(980) 순으로 등록 수가 많고, 상위 3개 구가 전체의 약 21% 비중입니다.

- **전국 예 (병원):**
  > 전국에 등록된 병원·의원은 79,562곳입니다. 시·도별 분포를 보면 경기(1.7만)·서울(1.4만)·부산(5천) 순으로 등록 수가 많고, 상위 3개 시·도가 전체의 약 46% 비중입니다.

### 폴백 문장 (데이터 적은 페이지 — 필수)

- `total === 0` 또는 집계 `null`(실패) → **요약 전체 생략**, 개수 표시(`전체 {total}개`)만 유지.
- 지역 3개 미만 **또는** total이 임계값 미만(시군구 스코프 등) → **분포·비중 문장 없이** 사실 문장 하나만:
  > {scope}에 등록된 {categoryLabel}은 {total}곳입니다.
  순위·비중을 주장하지 않는다(과장 방지).
- 임계값 상수는 구현 시 정의(예: `MIN_TOTAL_FOR_DISTRIBUTION = 30`, `MIN_REGIONS_FOR_DISTRIBUTION = 3`).

### 메타데이터

각 허브 `generateMetadata`/`metadata`의 `description`을 요약 첫 문장(정체 문장)으로 교체하여 고유화한다. 현재 템플릿 반복(`"${scope}의 ${label} 목록과 위치..."`)을 제거한다. 폴백 케이스에서는 기존 정체 문장을 사용한다.

## 배치 / 렌더링

- 각 페이지 헤더 카드에서 `전체 {total}개` / `전국 {total}개` `<p>` **바로 아래**에 `<HubSummary data={...} />` 삽입.
- 기존 리스트·필터·카드·페이지네이션은 변경하지 않는다.
- 모두 서버 컴포넌트이므로 요약은 **초기 HTML(raw)에 포함**된다(봇 가독). amenity/urban/medical은 ISR이 집계 쿼리 결과를 캐시한다.
- officetel/villa(force-dynamic): 집계 쿼리를 `.catch(() => null)`로 감싸 실패 시 요약 생략. 시도별 집계는 단일 aggregate 쿼리로 가볍게 유지(Supabase 부하 고려).

## 톤

PRODUCT.md의 "조용한 정보 안내자" 톤. 사실·수치 위주, 형용사 과장 없음.

## 테스트

- **프로즈 빌더 단위 테스트** (순수 함수):
  - 스코프별(nation / sido / sigungu) 문장 형태
  - 지역 0개·1개·3개, total 소·대
  - 폴백 케이스(total 0, 임계값 미만, 지역 3개 미만)
  - 서로 다른 두 페이지 입력이 서로 다른 문자열을 생성하는지(근접중복 방지) 단언
  - 집계 단위 라벨이 scopeLevel과 일치하는지 단언
- **집계 함수 통합 테스트**: `.env.test`(로컬 docker DB)로 GROUP BY 결과·상위 3·비중 계산 검증.

## 성공 기준

1. 6개 허브 초기 HTML(curl, Googlebot UA)에 고유 요약 문장이 포함된다.
2. 서로 다른 지역/카테고리 페이지의 요약 문자열이 실제로 다르다(근접중복 탈출).
3. 데이터 적은/실패 케이스에서 페이지가 죽지 않고 폴백 문장 또는 개수만 렌더된다.
4. 기존 리스트/필터/카드 동작 회귀 없음.
5. 프로즈 빌더·집계 함수 테스트 통과.
