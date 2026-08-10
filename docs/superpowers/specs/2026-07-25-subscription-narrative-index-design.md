> # ⛔ 폐기됨 (2026-08-09) — 구현하지 말 것
>
> 이 설계는 **애드센스 3차 거절(2026-08-06) 이전의 틀린 문제 정의** 위에 서 있다.
>
> - 전제였던 **"enrich-not-hide"**(템플릿 산문을 더 붙여 색인을 지킨다)가 거절 사유 그 자체였다. 정책 원문이 *"automatically generated content without manual review or curation"*, *"slight modifications through automated techniques"*를 위반으로 명시한다.
> - 이 설계가 하려던 두 가지 — ①**템플릿 narrative를 새 유형(subscription)으로 확대** ②**`isNarrativeIndexable`(fired≥3) 게이트를 그 유형까지 확대** — 는 지금 방침에서 **정확히 하지 말 것**으로 지정돼 있다.
> - 받은 라벨은 `Low value content`(**질**)이지 `Not enough content`(양)가 아니다. 자동 생성 문장을 더 많은 페이지에 붙이는 네 번째 라운드가 된다.
>
> **대체 방침:** `docs/adsense/2026-08-09-4th-application-plan.md` (§1.2 축소/복원, §6 하지 말 것).
> 청약 5,910건은 D1 축소 대상이 **아니고**(부동산 레이어) 사이트맵에 유지된다 — 단 보강 방식은 템플릿 산문이 아니라 사람이 쓴 해설이어야 한다.
>
> 아래 원문은 이력 보존용이다.

---

# 청약(subscription) 상세 산문 + 색인 게이트 설계

작성 2026-07-25. subscription 상세를 apt/villa와 동일하게 데이터 기반 narrative로 보강해 thin-content 색인 이탈을 방지한다(enrich-not-hide).

## 목표

subscription 상세(`/subscription/[id]`)에 **데이터 기반 산문(narrative)**을 추가하고, 색인 게이트를 "공급표 유무"에서 apt와 동일한 **`isNarrativeIndexable`(발화 모듈 ≥3)**로 통일한다.

**성공 기준**
- 실질 데이터 있는 공고 = 산문 노출 + 색인 유지, 빈 공고 = noindex(현행 유지, 슬롭 없음)
- 산문은 **각 공고의 고유 숫자**(공급·일정·분양가·주변시세 갭) 기반 — 템플릿 보일러플레이트 금지
- **신 게이트가 현재 색인 페이지를 떨어뜨리지 않음**(커버리지 검증 필수)

## 배경 (현황)

- 현재 `generateMetadata`: `indexable = notice.totalSupply != null || notice.units.length > 0` (공급표만 실질 콘텐츠로 봄). narrative 없음.
- apt/villa/officetel·hospital·childcare·park는 `build*Narrative` → `assembleNarrative`(shared) → `isNarrativeIndexable(fired≥3)`. **subscription만 산문 부재 = 덜 enriched.**
- 페이지는 이미 `nearbyApts`·`infra`·`subway`·`units`·`coord`를 계산 중 → 산문 입력 재사용 가능.

## 설계 원칙
1. **데이터 기반 per-공고** — 없는 데이터는 문장 미발화(null). 슬롭 금지.
2. **게이트 유지/강화** — 산문으로 빈 공고를 억지 색인하지 않음. requireKeys로 "청약 실질 모듈" 1개 이상 강제.
3. **shared 재사용** — `accessInsight`(역+인프라), `priceContextInsight`(주변 실거래 range)를 그대로 씀.

## narrative 모듈 (`lib/insights/subscription.ts`)

`buildSubscriptionNarrative(d)` → `assembleNarrative(name, mods, { minFired: 3, requireKeys: ['supply','price','schedule'] })`.

| key | 소재(필드) | 발화 조건 | 예시 문장 |
|---|---|---|---|
| `supply` | totalSupply, units.generalSupply/specialSupply | 총공급 또는 units 존재 | "총 480세대(일반 384·특별 96)를 공급합니다." |
| `schedule` | receiptBegin/End·winnerDate·moveInYm + status | 접수일정 존재 | "청약 접수는 7.14~7.16, 당첨자 발표 7.24, 입주 예정 2028년 3월입니다." (status로 시제: 접수중/마감) |
| `price` | units.area·topAmount | topAmount 있는 units 존재 | "전용 84㎡ 분양가는 최고 6.2억(3.3㎡당 약 1,830만원)입니다." |
| `priceVsMarket` | unit 3.3㎡당 분양가 vs nearbyApts 실거래 | 둘 다 존재 | "인근 아파트 최근 실거래 대비 약 12% 낮은 수준입니다." ★고유가치 |
| `builder` | developer·constructor | 존재 | "시행 ○○, 시공 △△가 맡았습니다." |
| `access`(재사용) | subway 최근접 + infra | shared 로직 | "인근 지하철역은 …" |
| `priceRange`(재사용) | nearbyApts sale range | shared `priceContextInsight` | "도보권 아파트 실거래가는 약 A~B억…" |

- **requireKeys=['supply','price','schedule']**: 최소 1개의 *청약 실질* 모듈이 있어야 색인(access/priceRange만으로는 색인 안 됨 — 그건 어느 위치나 나오는 generic이라 near-duplicate 방지).
- 실제 공고는 보통 supply+schedule+price 동시 존재 → fired≥3 → 색인. 빈 공고는 <3 → noindex.

## 색인 게이트 변경
`generateMetadata`:
```ts
const { narrative } = await loadSubscriptionInsight(BigInt(id));
robots: robotsFor(isNarrativeIndexable(narrative)),
description: narrative?.text.slice(0, 150) ?? (기존 폴백),
```
- **⚠️ 커버리지 검증(필수, 배포 전)**: 현재 `totalSupply||units`로 색인되는 공고 중 신 게이트(fired≥3)로도 색인되는 비율을 실측. units만 있고 일정·분양가 없는 공고가 다수면 색인이 줄 수 있음 → 그 경우 `minFired=2`로 완화하거나 `supply` 단독도 requireKeys 통과시키도록 조정. **줄어들면 안 됨이 원칙.**

## 시제/상태 처리
- `status`(접수예정/접수중/접수마감/…)로 schedule 문장 시제 결정: 미래="접수 예정", 진행="접수 중(~M.D)", 과거="접수 마감(과거 공고, 분양가 참고용)".
- 지난 공고도 분양가·규모는 참고가치 → 색인 유지하되 톤만 과거형.

## 파일 변경
- **신규 `lib/insights/subscription.ts`**: `buildSubscriptionNarrative` + subscription 전용 모듈(supply·schedule·price·priceVsMarket·builder).
- **신규 `lib/insights/subscription-loader.ts`**: `loadSubscriptionInsight(id)` = notice+units+nearbyApts+subway+infra 로드(페이지 함수 재사용) → build → `{ narrative, dateModified: updatedAt }`. `cache()`로 dedupe.
- **`app/(public)/subscription/[id]/page.tsx`**: generateMetadata 게이트 교체 + 본문에 `<InsightSection sentences={narrative.sentences} />`(apt와 동일 컴포넌트) 추가.
- (선택) JSON-LD에 narrative 반영.

## 테스트
- `buildSubscriptionNarrative` 순수함수: 모듈별 발화/미발화, requireKeys 가드, minFired 경계, priceVsMarket 계산(단위 정규화). tests/lib.
- 단위 정규화 주의: `topAmount` 단위(만원 추정) 확인 후 3.3㎡당 환산이 nearbyApts 실거래와 같은 기준인지 테스트로 고정.

## 검증 (배포 전)
1. 커버리지 쿼리: `SELECT count(*) FILTER (신게이트) / count(*) FILTER (구게이트)` — 신 게이트 색인 수 ≥ 구 게이트.
2. 스팟체크: 데이터 풍부 공고 = 산문 3+문장·index, 빈 공고 = noindex.
3. lint·typecheck·단위테스트.

## 범위 밖
- `topAmount` 없는 옛 공고(분양가 미수집)는 price 모듈 미발화 → supply+schedule로 fired 채우거나 noindex(정상).
- 청약 lifecycle 정리(아주 오래된 공고 noindex)는 별도.
