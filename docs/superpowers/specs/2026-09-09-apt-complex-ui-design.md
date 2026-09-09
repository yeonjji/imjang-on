# 실거래가 상세 — 단지정보 화면

**작성일** 2026-09-09
**대상** 아파트 상세 `/apt/[id]` (villa·officetel은 매칭 대상이 아니라 자연히 제외)
**선행** `docs/superpowers/specs/2026-09-07-apt-complex-ingest-design.md` — 데이터 계층 완료
**목표** 원자료를 나열하지 않는다. 비율·밀도·연차로 가공해 실거래 판단에 쓰이게 한다.

---

## 0. 범위

데이터는 이미 운영에 있다. 이 스펙은 **그 데이터를 화면에 놓는 일**만 다룬다.

| | 이번 스펙 | 별도 스펙 |
|---|---|---|
| 파생 지표 계산 (`lib/insights/apt-complex.ts`) | ✅ | |
| 해석 문장 2개 (`buildAptNarrative` 확장) | ✅ | |
| 화면 3곳 배치 | ✅ | |
| **색인 화이트리스트 전환** | | ✅ |

**화이트리스트 전환을 뺀 이유.** 실측상 아파트 색인 페이지의 55%(약 21,000)가 빠지는 변경이라 성격도 위험도도 다르다. 이 스펙은 "단지 모듈을 색인 판정에 넣지 않는다"는 계약만 지키면 되고, 그건 `fired`에서 빼는 것으로 충분하다. `lib/seo/indexable.ts`를 한 줄도 수정하지 않는다.

---

## 1. 전제가 되는 실측 (2026-09-08 ~ 09, 운영)

| | |
|---|---|
| `AptComplex` 적재 | 22,301건 (상세 100%) |
| 매칭 확정 | 12,544 (아파트 `Property` 44,479 대비 **28%**) |
| 면적 4칸 + 세대수 완비 | 21,422 / 22,301 (96%) — **매칭분 기준 11,938 (27%)** |
| 합계 불일치 | **0건** |

### 1.1 필드 채움률 (22,301 전수)

동수·사용승인일·복도유형·EV 100% · 최고층·시공사 99% · 세대수·지하주차·CCTV 96% · 승강기 92% · **지하철역 19%**

### 1.2 설계에 영향을 준 사실 세 가지

**면적 구성의 합계 불일치는 0건이다.** 4칸을 채울 때 원본은 항상 총세대수와 정확히 맞춰서 준다. 96%라는 수치는 "4%가 틀렸다"가 아니라 "4%(879건)는 **세대수 자체가 없다**"는 뜻이다. 그 879건은 신축이라 관리 데이터가 미등록된 빈 레코드와 같은 집단이다. 따라서 **허용오차를 논의할 대상이 없다.**

**지하철 필드는 쓰지 않는다.** 채움률 19%인데다, 우리는 `SubwayStation` 테이블로 최근접 역과 실제 거리를 이미 계산한다(`lib/insights/apt.ts`의 `aAccess`). API 값보다 우리 것이 정확하다.

**부대시설은 `welfareFacility` 하나만 쓸 수 있다.** 나머지 둘은 괄호가 비어 온다.
```
convenientFacility  "관공서() 병원() 백화점() 대형상가() 공원() 기타()"
educationFacility   "초등학교() 중학교() 고등학교()"
```
"있다/없다"조차 알 수 없어 카테고리화가 불가능하다. **이번 스펙에서는 부대시설을 노출하지 않는다.**

---

## 2. 배치 — 기존 구조에 흡수

상세 페이지에는 이미 블록이 18개 있다. 6블록을 신설하면 24개가 된다. **새 컴포넌트는 하나만 만든다.**

| 위치 | 무엇 | 컴포넌트 |
|---|---|---|
| ① 「한눈에 보기」 | 해석 문장 2개 | 기존 `InsightSection` — **수정 없음** |
| ② 「면적별 실거래 비교」 | 단지 면적 구성 한 줄 | 기존 `AreaComparison` 확장 |
| ③ 「단지 정보」 | 가공 수치 타일 | `ComplexInfoSection` **신설** |

②가 이 설계의 핵심이다. 위는 *공급된* 구성, 아래는 *거래된* 평형이라 **나란히 놓는 것만으로 대조가 생긴다.** "중소형이 84%인데 최근 거래는 34평에 몰렸다"를 열람자가 읽는다.

제목과 앵커(`#area`)는 그대로 둔다 — `detail-sidebar.tsx`의 `ANCHORS`가 `면적별 비교`로 참조한다.

③은 `#complex` 앵커로 `ANCHORS`의 **`면적별 비교` 다음**에 넣는다. 규모·구조를 보고 주변으로 넘어가는 읽기 순서다.

---

## 3. 데이터 계층

**`lib/insights/apt-complex.ts`** (신규, **DB를 모르는 순수 함수**)

```ts
export interface ComplexFacts {
  households: number | null; buildingCount: number | null;
  usedate: Date | null; hallType: string | null;
  topFloor: number | null; baseFloor: number | null;
  area60: number | null; area85: number | null;
  area135: number | null; area136: number | null;
  parkingGround: number | null; parkingUnder: number | null;
  evGround: number | null; evUnder: number | null;
  elevator: number | null; cctv: number | null;
  builder: string | null;
  fetchedAt: Date | null;   // 출처 캡션의 기준일
}

/** 밴드 라벨은 이 네 개로 고정한다. 문장과 화면이 같은 문자열을 쓴다. */
export type BandLabel = '60㎡ 이하' | '60~85㎡' | '85~135㎡' | '135㎡ 초과';

export interface UnitMix {
  bands: { label: BandLabel; units: number; pct: number }[];  // 항상 4개, units 0인 밴드 포함
  smallMidPct: number;                    // 85㎡ 이하 비중 = bands[0].pct + bands[1].pct
  dominant: { label: BandLabel; pct: number };  // 최대 밴드. 동률이면 작은 면적 우선
}

export interface DensityFacts {
  parkingPerHousehold: number | null;
  parkingAllUnderground: boolean;
  evPer100: number | null;
  householdsPerElevator: number | null;   // 역수 — "N세대당 1대"
  cctvPer100: number | null;
}

export function buildUnitMix(f: ComplexFacts): UnitMix | null;
export function buildDensity(f: ComplexFacts): DensityFacts;
export function buildingAgeYears(usedate: Date | null, now: Date): number | null;
```

### 3.1 결정 기록

**`UnitMix`는 4칸 완비 + 합 일치일 때만 만든다.** 실측 불일치는 0건이라 이 검사는 통과 전용이지만 **남긴다.** 비중을 %로 보여주는 순간 합이 100%가 아니면 바로 들통나고, 원본이 나중에 달라졌을 때 틀린 표가 조용히 나가는 것보다 블록이 사라지는 편이 낫다.

**밀도는 나눗셈 방향을 값마다 다르게 잡는다.** 주차·EV·CCTV는 "세대당 몇 개"가 직관적이고, 승강기는 반대로 **"몇 세대당 1대"** 가 읽힌다(0.04대보다 25세대당 1대). 그래서 `householdsPerElevator`만 역수다.

**세대수가 없으면 밀도 값은 전부 `null`이다.** 분모가 없으면 밀도가 없다. 다만 `parkingAllUnderground`는 **세대수와 무관하다** — 지상·지하 대수만 보는 구조 판정이라 세대수가 없어도 계산된다.

**`parkingAllUnderground`는 지상 0 그리고 지하 > 0일 때만 참이다.** 둘 다 0인 빈 레코드를 "전면 지하주차"로 읽으면 안 된다.

**`buildingAgeYears`는 기준일을 인자로 받고 연 단위만 반환한다.** `new Date()`를 안에서 부르면 해가 바뀔 때 테스트가 저절로 깨진다. 월 단위를 버리는 건 ISR 때문이다 — 렌더 시점에 계산된 값이 캐시에 박제되므로 정밀할수록 오래 틀린다.

### 3.2 로더 연결

`lib/insights/apt-loader.ts`의 `Promise.all`에 `getComplexFacts(propId)` 한 줄을 추가한다. `AptComplex.propertyId`로 1:1 조인이고 미매칭이면 `null`이다. villa·officetel은 매칭 대상이 아니었으므로 자연히 `null`이 되어 같은 코드가 그대로 안전하다.

---

## 4. 해석 문장

`buildAptNarrative`에 모듈 **2개**를 더한다. 조건 분기가 많은 소수 문장으로 간다 — 기존 `floorPremiumInsight`가 쓰는 방식이고, 주석에 *"조건부·구간별 분기라 단지마다 문장 구성이 달라져 near-duplicate를 줄인다"* 는 의도가 이미 명시돼 있다.

### 4.1 색인 계약을 지키는 방법

```ts
const core    = [bScale, tTrend, pPeer, aAccess];        // 색인 게이트 판정
const extra   = [floorPremiumInsight, flagsInsight];      // 기존 파생
const complex = [unitMixInsight, parkingInsight];         // 신규

return {
  sentences: [...core, ...extra, ...complex].map(...),    // 렌더는 전부
  text: sentences.join(' '),
  fired: [...core, ...extra].map((m) => m.key),           // 단지 모듈 제외
};
```

`fired`를 읽는 곳은 `isNarrativeIndexable` 하나뿐임을 확인했다(`grep` 실측). **단지 모듈을 `fired`에서 빼면 색인 판정이 그대로다.** 타입 변경도 `indexable.ts` 수정도 없다.

메타 설명도 안전하다. `narrative.text.slice(0, 150)`이 쓰이는데 단지 문장이 맨 뒤라 거의 들어가지 않는다 — 기존 `floorPremium`·`flags`와 같은 자리다.

### 4.2 `unitMixInsight`

`UnitMix`가 있을 때만 발화한다(아파트 페이지의 27%). **위에서부터 먼저 맞는 하나만** 쓴다.

| 순 | 조건 | 문장 |
|---|---|---|
| 1 | `dominant.pct` ≥ 90 | "전용 60~85㎡ 한 종류로 이루어진 단지입니다." |
| 2 | `smallMidPct` ≥ 80 | "전용 85㎡ 이하가 84%인 중소형 중심 단지입니다." |
| 3 | `smallMidPct` ≤ 35 | "전용 85㎡ 초과가 71%로 중대형 비중이 높은 단지입니다." |
| 4 | 그 외 | "전용 60~85㎡ 54%, 85㎡ 초과 16%로 면적대가 고르게 섞여 있습니다." |

4번의 문장은 `dominant`와 그다음 밴드를 쓴다. 비중은 소수점 없이 반올림해 표기한다.

**실거래와의 자동 연결은 넣지 않는다.** "대표 평형 거래가 시세를 대표한다"는 해석은 매력적이지만, 우리 실거래는 *평* 단위이고 API 구성은 *㎡* 밴드라 경계에서 어긋난다 — 전용 85㎡가 25.7평이라 "26평"이 어느 밴드인지 단정할 수 없다. 틀린 연결을 자동 생성하느니 §2의 ②처럼 **나란히 놓아 눈으로 대조하게** 한다.

### 4.3 `parkingInsight`

`parkingPerHousehold`가 있을 때만 발화한다.

| 조건 | 문장 |
|---|---|
| ≥ 1.5 | "세대당 주차는 1.8대로 넉넉한 편입니다." |
| 1.0 ~ 1.5 | "세대당 주차는 1.27대입니다." |
| < 1.0 | "세대당 주차는 0.8대로 세대 수에 못 미칩니다." |
| + 전면 지하 | 뒤에 "주차는 전부 지하에 있습니다." 를 잇는다 |

**총평과 단서 문구를 쓰지 않는다.** "주차 여건이 양호하다"는 데이터로 뒷받침되지 않고(실제 편의는 동별 연결 구조에 좌우된다), "실제 편의성은 다를 수 있습니다" 같은 단서는 모든 페이지에 똑같이 붙어 그 자체가 near-duplicate가 된다. 수치와 구조만 말하고 판단은 열람자에게 남긴다.

### 4.4 문장 수

최대 6개 → 최대 8개. 다만 `floor`는 9%, `flags`는 43%만 발화하므로 실제로는 대개 6~7개다.

---

## 5. 화면

### 5.1 `AreaComparison` 확장

기존 평형별 카드 **위에** 구성 한 줄을 얹는다. `UnitMix`가 `null`이면(73%) 이 줄만 빠지고 기존 카드는 그대로다. props에 `unitMix?: UnitMix | null` 하나를 추가한다.

### 5.2 `ComplexInfoSection` 신설 — 타일 그리드

가공값을 주인으로, 원자료를 보조로 둔다. 기존 「면적별 실거래 비교」와 같은 결이라 페이지 리듬이 유지된다.

```
단지 정보
┌───────────┬───────────┬───────────┐
│ 세대당 주차 │ 준공      │ 승강기    │
│ 1.27대    │ 7년차     │ 25세대당  │
│ 전부 지하  │ 2018년    │ 1대       │
├───────────┼───────────┼───────────┤
│ EV 충전   │ CCTV      │ 규모      │
│ 100세대당 │ 100세대당 │ 9,510세대 │
│ 2.7기     │ 28대      │ 84개 동   │
└───────────┴───────────┴───────────┘
계단식 · 지상 35층 / 지하 3층
시공사 현대건설 · 삼성물산 · 현대산업개발

출처: 국토교통부 · 2026-09-08 수집
```

**결측 타일은 렌더하지 않는다.** 빈 타일이나 "정보 없음"을 두지 않는다. 타일은 위 순서(주차 → 준공 → 승강기 → EV → CCTV → 규모)로 남은 것만 채워 흐른다.

**섹션을 띄우는 최소 조건은 타일 3개다.** `facts`가 있어도 채워지는 타일이 2개 이하면 섹션 전체를 숨긴다. 타일 하나짜리 카드는 정보가 아니라 빈칸으로 읽히고, 그런 페이지가 늘어나는 것이 곧 얇은 콘텐츠다. 실측상 매칭된 단지는 대부분 필드가 92~100% 차 있어 이 게이트에 걸리는 경우는 드물다.

**`facts`가 `null`이면 컴포넌트가 `null`을 반환한다.** 섹션도 사이드바 네비 항목도 나타나지 않는다. 매칭 안 된 72%에서는 페이지가 지금과 완전히 같다.

사이드바 네비는 섹션 렌더 여부와 **같은 조건**을 써야 한다. 항목만 남고 앵커가 없으면 클릭해도 아무 데도 안 간다. 판정을 두 곳에 복사하지 않도록 `shouldRenderComplexInfo(facts): boolean`을 `apt-complex.ts`에 두고 페이지가 그 결과를 `DetailSidebar`에 넘긴다.

**출처 캡션.** `lib/data-sources.ts`에 항목 한 줄을 추가하고 `SourceCaption`으로 렌더한다. 수집이 수동(`workflow_dispatch`)이라 데이터는 마지막 수집 시점 기준이므로 `fetchedAt`을 함께 표기한다.

---

## 6. 검증

### 6.1 단위 테스트 — 순수 함수

```
buildUnitMix        4칸 완비 + 합 일치 → 비중 (헬리오시티 2854/5132/1500/24 = 9510)
                    한 칸이라도 null → null · 세대수 null → null · 합 불일치 → null
                    비중 합이 100%에 수렴(반올림 오차)
buildDensity        세대당 주차 = (지상+지하)/세대
                    지상 0 && 지하>0 → parkingAllUnderground = true
                    지상 0 && 지하 0 → false (빈 레코드는 '전면 지하'가 아니다)
                    승강기 역수 — 9510/384 = 24.8 → 25
                    세대수 null → 전부 null
buildingAgeYears    2018-12-28 · 기준 2026-09-09 → 7 · usedate null → null
```

### 6.2 해석 문장 — 구간 경계와 색인 계약

`unitMixInsight`는 79%/80%/81%, 34%/35%/36%, 89%/90%/91%에서 문장이 갈리는지 찍는다.

색인 계약은 코드로 못박는다.

```ts
it('단지 모듈은 fired에 들어가지 않는다', () => {
  const n = buildAptNarrative({ ...충분한입력, complexFacts });
  expect(n!.sentences.length).toBeGreaterThan(n!.fired.length);
  expect(n!.fired).not.toContain('unitMix');
  expect(n!.fired).not.toContain('parking');
});
```

### 6.3 컴포넌트

이 저장소엔 `@testing-library`가 없어 `renderToStaticMarkup` SSR 계약까지만 본다.

```
facts = null            → 아무것도 렌더하지 않는다 (빈 카드도 아님)
타일 2개만 채워짐        → 섹션 전체를 숨긴다
타일 3개                → 섹션이 뜨고 결측 타일은 사라진다
shouldRenderComplexInfo  섹션 렌더 조건과 같은 답을 낸다 (네비와 본문이 갈리지 않게)
```

### 6.4 e2e 회귀

**UI 문구를 바꾸면 Playwright가 옛 문구를 검증 중이라 CI가 깨진다.** 유닛·빌드가 통과해도 그렇다. 「면적별 실거래 비교」에 구성 줄을 얹으므로 그 섹션을 보는 e2e가 있는지 먼저 확인하고 있으면 함께 고친다.

### 6.5 배포 후

ISR 때문에 즉시 반영되지 않는다. 매칭된 단지 하나와 미매칭 단지 하나를 실제 URL로 확인한다. **미매칭 페이지에 빈 카드나 "정보 없음"이 새어나오면** 그게 곧 얇은 콘텐츠다.

---

## 7. 이번 스펙이 하지 않는 것

- `lib/seo/indexable.ts` 수정 — 화이트리스트 전환은 별도 스펙
- 부대시설 노출 — 원본이 빈 괄호라 쓸 수 없다
- 지하철 필드 사용 — 우리 `SubwayStation`이 더 정확하다
- 관리 운영 정보(3군)·연락처·홈페이지 — 스키마에 컬럼조차 없다
- 지역 평균·유사 단지 백분위 비교
- villa·officetel 대응 — 매칭 대상이 아니었다
- 원본 단지정보 표(접어두기) — 원자료 나열은 이 스펙의 목적과 반대다
