# AdSense 3차 거절 전면 재진단 — "얇다"가 아니라 "복제·양산"이다

작성 2026-08-06. 3차 거절(사유: 가치 있는 콘텐츠 없음) 직후, 기존 전제를 버리고 정책 원문에서 다시 출발한 진단.

기존 문서와의 관계: `thin-content-diagnosis.md`·`approval-strategy-2026-07-08.md`·`ws4-part-a-enrich-gate-design.md`의 **문제 정의 자체를 교정**한다. 그 문서들의 측정 데이터는 유효하나, 그 데이터를 해석한 프레임이 틀렸다.

---

## 1. 왜 3번 연속 실패했는가 — 프레임 오류

지금까지 세 번의 대응은 모두 같은 전제 위에 있었다.

> "페이지에 텍스트가 얇다 → 서사·FAQ·파생지표를 추가해 두껍게 만들면 통과한다"

그래서 실제로 추가한 것:

| 시점 | 추가한 것 | 성격 |
|---|---|---|
| 2026-06 | 병원 탭 SSR, subscription blurb | 템플릿 문장 |
| 2026-07-15 | 파생지표 5종(평형보정변동률·층프리미엄 R² 등) | 템플릿 수치 카드 |
| 2026-07-16 | 서사 국면별 변주, 홈 편집산문 | 템플릿 문장 |
| 2026-07-20 | FAQ 9종 전면, 구조화 스키마 | 템플릿 Q&A |

**이 네 라운드는 전부 "자동 생성 템플릿 텍스트를 더 많은 페이지에 더 많이" 였다.**

정책 원문을 보면 그것이 바로 위반 항목 자체다.

### 거절 사유가 매핑되는 실제 정책

거절 문구("가치 있는 콘텐츠 없음")는 Google Publisher Policies의 다음 두 곳에 매핑된다.

**(1) Behavioral Policies → Inventory value → "Google-served ads on screens with replicated content"**
([support.google.com/publisherpolicies/answer/11190248](https://support.google.com/publisherpolicies/answer/11190248))

> content that is "copied from other websites and published on your own website **without adding any value by curation or providing commentary**."

허용되지 않는 예시로 명시된 것:
- "Mirroring, framing, scraping or **rewriting of content from other sources without adding value**"
- "**Automatically generated content without manual review or curation**"
- "Slight modifications through synonym substitution or **automated techniques**"

가치를 더하는 방법으로 명시된 것:
> "specialist knowledge, improvement ideas, reviews, or **your personal thoughts**"

**(2) Requirements → Spam policies for Google web search**
([developers.google.com/search/docs/essentials/spam-policies](https://developers.google.com/search/docs/essentials/spam-policies))

- **Scaled content abuse:** "many pages are generated for the primary purpose of manipulating search rankings and not helping users" / "**combining multiple sources without added benefit**"
- **Doorway abuse:** "sites or pages are created to rank for specific, similar search queries" / "**substantially similar pages** positioned closer to search results than a **clear browsable site hierarchy**" / "multiple pages targeting specific regions"

### 우리 서사 생성기의 실제 모습

`lib/insights/hospital.ts:18-75` — 병원 상세의 "서사" 전문:

```ts
text: d.deptCount >= 1
  ? `${josa(type, '으로', '로')} 진료과 ${d.deptCount}개과를 운영합니다.`
  : `${type}입니다.`
// ...
return { key: 'doctors', text: `의사 ${d.totalDoctors}명 중 전문의가 ${d.specialistTotal}명(약 ${pct}%)으로 ${judge}.` };
```

DB 필드를 문장 틀에 끼운 6문장. `assembleNarrative(..., { minFired: 3 })`로 3문장 이상 발화하면 `index`.
apt/villa/officetel/school/childcare/park도 동일 구조(`lib/insights/*.ts`).

정책 문구와 대조하면 — **"automated techniques"에 의한 "slight modification"이고, "manual review or curation" 없는 "automatically generated content"다.** 우리가 "enrichment"라고 부른 것이 정책 언어로는 위반 행위의 정의와 일치한다.

**결론: 지금까지의 대응은 문제를 완화한 게 아니라 확대했다.** 색인 게이트를 `narrative.fired>=3`으로 잡은 것도, 사실상 "자동 생성 문장 3개 이상이면 색인"이라는 규칙이라 방향이 반대다.

---

## 2. 세 가지 구조적 문제

### 문제 A — 복제 콘텐츠 (정책 직격)

10만+ 상세 페이지가 공공 레지스트리의 미러다. 원출처(국토부 실거래가·HIRA 병원·청약홈·교육부)에 동일 데이터가 그대로 있고, 우리가 더한 것은 자동 조립 문장뿐이다.

정책이 요구하는 "specialist knowledge / personal thoughts"는 **정의상 자동 생성으로 만들 수 없다.** 이 항목은 코드로 해결되지 않는다.

### 문제 B — 규모가 사이트의 성격을 규정한다

> **2026-08-06 프레임 교정.** 초판은 이 절을 "site-wide 평균" 으로 서술했으나 그것은 '양'의 언어이고 부정확하다. AdSense 라벨은 양과 질이 **분리**되어 있다:
>
> | 라벨 | 의미 |
> |---|---|
> | `Valuable inventory: Not enough content` | **양** — 글 수 부족. 더 쓰고 재신청 |
> | **`Low value content`** | **질** — 얇음·반복·복제·자동생성 |
>
> **우리는 3회 전부 '질' 라벨을 받았다. 구글은 "글이 부족하다"고 말한 적이 없다.**
>
> 따라서 13만 페이지가 문제인 이유는 *"원본이 적어서 평균이 낮다"*가 아니라, 그 13만이 사이트를 **"긁어온 정보 모음"으로 성격 규정**하기 때문이다. 레버(색인 축소)는 같으나 이유가 다르고, 이유가 다르면 해법의 우선순위가 바뀐다 — **원본 편수를 늘리는 것은 성격 규정을 바꾸지 못한다.**

| 구분 | 편수 | 비율 |
|---|---|---|
| 사람 검수 원본 글 (`/board` 48 + `/guide` 28) | **76** | ~0.06% |
| 자동 생성 템플릿 상세 (추정) | **~130,000** | ~99.94% |

*상세 추정 근거: 이전 실측 property 색인 117,568(P2-A 이후) + subscription 5,842 + hospital/childcare/school 게이트 통과분. **재신청 전 GSC Pages 리포트로 실제 색인 수를 확인해야 한다** — 이 숫자가 진단의 기준선이다.*

76편을 100편, 200편으로 늘려도 분모가 13만이면 평균은 움직이지 않는다. **L7 상록가이드 28편이 통과 레버가 되지 못한 이유가 이것이다.**

### 문제 C — 페이지 상호연결 메시 (사용자가 지적한 축)

말씀하신 "연관 페이지가 계속 이어지는 것이 문제"는 **doorway abuse** 조항이다. 우리 구조에서 실제로 확인된 것:

1. **파라미터 지역 양산** — `/amenity/{convenience,mart,cafe,market}?region={시군구}` ≈ **250 × 4 = 1,000개**의 동일 템플릿 목록 페이지가 사이트맵에 등재돼 있다 (`lib/sitemap/sources.ts:51-60`, 샤드 0에서 mart ~250 + convenience ~250 실측). 정책의 "multiple pages targeting specific regions" + "substantially similar pages"에 정확히 해당.

2. **상세 간 sibling 링크** — 상세 페이지가 "주변 단지 비교"·"주변 생활 인프라"·"주변 청약"으로 **거의 동일한 형제 페이지들**을 서로 가리킨다(`nearby-price-comparison.tsx`, `nearby-subscriptions.tsx`). 유사 페이지 간 상호 링크 = doorway 신호.

3. **역설: 사이트맵 제외가 hierarchy를 지웠다** — `lib/sitemap/sources.ts`에서 `property`·`school`·`pharmacy` 상세가 `count: async () => 0`으로 **사이트맵에서 완전 제외**됐다(주석: "noindex 0건 우선"). 그런데 페이지 자체는 여전히 `index,follow`다(`robotsFor`는 noindex여도 follow 유지).

   결과: 구글은 그 10만+ 페이지를 **사이트맵의 명시적 계층 없이 내부 링크 메시로만** 발견한다. 정책이 doorway로 규정하는 조건 — *"clear browsable site hierarchy보다 검색 결과에 가깝게 배치된 유사 페이지"* — 을 오히려 강화한 셈이다. **'제출됐지만 noindex' 경고를 없애려던 위생 작업이 정책 신호를 악화시켰다.**

### 문제 D — 자동화 미공개 + 필명 (새로 발견)

Google의 "Who / How / Why" 자기평가에 명시된 질문:

> "Is the use of automation, including AI-generation, **self-evident to visitors through disclosures** or in other ways?"

현재 상태:
- `/board` 48편·`/guide` 28편은 **AI 생성물**이다 (`lib/board/generate.ts`, `scripts/generate-guides.ts`)
- 바이라인은 `lib/editorial.ts`의 **필명 "임장ON 편집자"**, JSON-LD `author`는 `Person`
- `/about`에 데이터 수집 방법론은 있으나 **AI·자동화 언급이 전혀 없다** (실측 확인)

즉 AI 생성 콘텐츠를 사람 이름처럼 보이는 필명으로 서명하고 자동화를 공개하지 않고 있다. E-E-A-T 강화 목적이었지만(P0-B), 정책 관점에서는 **공개 의무 미이행**이며 Misrepresentative content 리스크도 있다.

### 문제 E — 원본 글 레이어도 같은 버킷에 있다 (가장 중요)

`Low value content`가 지목하는 전형 유형은 ①단순 정보 긁어오기 ②개인 일상 나열 ③**AI 생성물 그대로 사용**이다. 우리는 ①과 ③에 동시에 해당한다.

| 유형 | 해당 여부 |
|---|---|
| 단순 정보 긁어오기 | **해당** — 상세 13만 페이지 |
| 개인 일상 나열 | 해당 없음 |
| **AI 생성물 그대로 사용** | **해당** — `/board` 48편 + `/guide` 28편 **전량** |

즉 **분모(템플릿 상세)와 분자(원본 글)가 같은 버킷에 들어가 있다.** "AI로 가이드를 더 쓴다"는 백로그는 개선이 아니라 악화이므로 폐기 대상이다.

생성 워크플로 실측(2026-08-06 `gh workflow list --all`): `generate-board-posts` = `disabled_manually`, `generate-board-topic`·`generate-guides` = `workflow_dispatch` 전용(cron 없음). **자동 양산은 멈춘 상태이며 유지해야 한다.**

#### 원칙과 승인 요건의 정면 충돌

정책이 명시한 치료법은 "specialist knowledge, improvement ideas, reviews, or **your personal thoughts**"다.

그런데 `lib/board/guardrails.ts:1-10`이 그것을 **코드로 차단**한다:

```ts
{ label: '보입니다', re: /보입니다|보인다/ },
{ label: '가능성이 있', re: /가능성이\s*(높|있|크)/ },
{ label: '예상됩니다', re: /예상(됩니다|된다|되며)/ },
{ label: '전망', re: /전망(이다|입니다|된다|이며|성)/ },
{ label: '추천', re: /추천(합니다|드립니다|한다)/ },
{ label: '유망', re: /유망(하다|합니다|한)/ },
```

board 48편이 길이 기준(800~2,200자)을 충족했는데도 통과에 기여하지 못한 이유가 이것이다 — **설계상 "남의 말 요약"만 산출되게 되어 있다.** Google 자기평가 질문 *"Are you mainly summarizing what others have to say without adding much value?"* 에 우리는 구조적으로 "예"다.

**해소 방향 — 과장 금지 ≠ 해석 금지.** 브랜드 포기 없이 분리 가능하다:

- 계속 금지: 근거 없는 예측·권유 ("유망합니다", "오를 전망", "추천드립니다")
- 허용해야: 출처 근거가 있는 비교·해석·맥락 ("A지역이 B지역보다 전용면적당 12% 낮은데, 준공연차 차이로 설명된다")

PRODUCT.md의 "조용한 정보 안내자"와 양립한다 — 안내자는 해석을 제공한다. 단 이는 코드 결정이 아니라 **제품 정체성 결정**이므로 운영자 판단이 선행해야 한다.

#### 게이트 실측 (2026-08-06)

`lib/board/create-draft.ts:29`에서 가드레일은 **검수 플래그가 아니라 초안을 DRAFT 도달 전에 폐기하는 하드 게이트**다:

```ts
if (!guard.ok) return { status: 'rejected', violations: guard.violations };
```

#233의 SYSTEM_PROMPT rule 11이 "출처 근거 비교·맥락"을 요구하는데 이 게이트가 되돌려 보낼 수 있는 구조는 사실이다.

**단, 정규식이 주 블로커는 아니다.** 금지 패턴 대부분(전망·추천·유망·예상)은 "계속 금지" 범주와 일치한다. 과잉 차단은 두 패턴뿐이다 — `가능성이\s*(높|있|크)`, `것으로\s*(보|예상|전망)`: 신중한 사실 서술("신청 가능성이 있는 대상은")까지 걸린다.

**진짜 블로커는 상류에 있다:** board는 애초에 korea.kr 정책뉴스를 **요약하는 것**으로 설계됐다(주제 선정 → 요약 산출). 해석을 허용해도 소재가 남의 발표 요약이면 정보 이득은 생기지 않는다. 따라서 방향 2의 핵심은 가드레일 완화가 아니라 **소재 자체를 우리 데이터로 바꾸는 것**이다 — 우리만 산출 가능한 교차 분석(지역·평형·시계열)을 글의 출발점으로 삼는 것.

---

## 3. 사용자 질문에 대한 직답

### "이 데이터가 가치가 없는 건가?"

데이터는 가치가 있다. **페이지 단위 정보 이득이 0**인 것이 문제다. 원출처에서 같은 걸 그대로 얻을 수 있고, 우리가 더한 건 자동 조립 문장이다.

### "다른 데이터를 더 넣어야 하나?"

**데이터를 더 넣는 것만으로는 안 된다.** 정책이 "combining multiple sources **without added benefit**"을 명시적으로 scaled content abuse로 규정한다. 4기관 → 8기관이 되어도 결합 자체가 부가가치는 아니다.

가치가 생기는 것은 **결합이 원출처에 존재하지 않는 판단·산출물을 만들 때**다. 예: "이 소득·자산으로 이 단지 이 평형을 살 수 있는가"는 국토부에도 KINFA에도 없는 답이고, 실거래+대출한도+보증한도를 결합해야만 나온다.

### "페이지끼리 이어지는 게 문제인가?"

맞다. 위 문제 C. 특히 `?region=` 파라미터 1,000개와 사이트맵 계층 부재가 실질 리스크다.

---

## 4. 방법 — 네 방향

### 방향 1. 분모 줄이기 (subtract) — **미시도 영역**

가장 중요: **이 방향은 한 번도 제대로 시도되지 않았다.** PR #161로 noindex를 구현했다가 PR #162로 전량 revert했고(2026-06-28), 이후 "enrich-not-hide"로 노선을 확정했다.

그 근거는 경쟁사 ilsangkit·ayo가 색인을 유지한 채 승인받았다는 실측이었다. 그러나 그건 **이미 승인된 사이트의 사후 상태**다. 승인 심사 시점의 상태가 아니며, 2024-03 scaled content abuse 조항 신설과 2025 품질평가자 가이드 개정 이후 심사 기준이 조여졌다.

- 상세 페이지 대량 noindex, **시군구 허브 + 대표 상위 N만 색인**
- `/amenity/{slug}?region=` → 파라미터 페이지 `canonical`을 무파라미터 허브로 통합 (1,000 → 4)
- 목표 색인 규모: 13만 → **수천 단위**
- 트레이드오프: 검색 유입 손실. **승인 후 단계적 복원 가능** (승인은 되돌릴 수 없는 관문, 색인은 되돌릴 수 있다)
- 이 방향의 핵심 논리: 분자를 키우는 건 3번 실패했다. 분모를 줄이는 건 남아 있다.

### 방향 2. 진짜 부가가치 (add — 종류를 바꿔서)

템플릿 문장이 아니라 **원출처에 없는 산출물**.

- **계산·판단 도구**: 실거래 + LTV/DSR + 전세보증 한도 결합 → "이 조건으로 가능한가" 판정. 원출처 어디에도 없는 답.
- **교차 시계열 분석**: 원출처는 단건·단기 조회만 제공. 12개월·지역·평형 교차 비교는 우리만 산출 가능 — 이미 파생지표로 갖고 있다. **문제는 그것을 템플릿 문장으로 냈다는 것**이지 지표 자체가 아니다. 사람이 쓴 해설로 감싸야 한다.
- **사람이 쓴 지역 분석**: 시군구 단위(~250개)에 실제 사람 작성 분석. 이게 지역 허브를 doorway에서 빼내는 유일한 방법이다. 250편은 현실적이지 않으므로 **상위 20~30개 시군구부터**.

### 방향 3. 계층 재설계 (doorway 신호 제거)

- **browsable hierarchy 복원**: 시도 → 시군구 → 상세를 사이트맵과 UI 양쪽에서 명시. 방향 1의 색인 축소와 짝을 이룬다(허브는 색인, 상세는 대부분 noindex, 계층은 명확).
- 상세 간 sibling 링크 축소, 상위 허브 경유로 전환
- `?region=` 파라미터 정리

### 방향 4. 투명성·신뢰 (저비용·즉시)

- **AI·자동화 공개 명시** — `/about`과 각 자동 생성 페이지에 "이 글은 공공 보도자료를 기반으로 AI가 초안을 작성하고 운영자가 검수했습니다" 수준의 명시. Google이 문서로 요구하는 항목이고 비용이 거의 없다.
- 실명 또는 사업자 정보 노출 검토 (현재 필명 + 이메일뿐)
- board 가드레일 완화: 의견·전망 금지를 **출처 근거 비교·맥락 허용**으로 (과장 금지는 유지). #233에서 rule 11로 일부 완화했으나 `guardrails.ts`의 금지 정규식은 남아 있는지 확인 필요.

---

## 5. 남은 불확실성 (정직하게)

1. **경쟁사와의 모순**: ilsangkit·ayo는 공공데이터 미러인데 승인·송출 중이다. "복제 콘텐츠가 치명적"이라는 이 진단과 충돌한다. 가능한 설명 — (a) 승인 시점 기준이 달랐다 (b) 심사 샘플 운. 어느 쪽이든 **우리가 통제할 수 있는 변수는 분모와 공개성**이다.
2. **심사 샘플링**: AdSense 리뷰어가 어떤 페이지를 보는지 알 수 없다. 분모 축소가 유효하다는 것은 가설이며, 이 진단의 핵심 검증 대상이다.
3. **실제 색인 규모 미확인**: 위 13만은 이전 실측 기반 추정. **GSC Pages 리포트 확인이 모든 판단의 선행 조건.**

## 6. 착수 순서 제안

0. **GSC 실측** — 색인된 페이지 수, 유형별 분포. 기준선 확정.
1. **가드레일 결정** (문제 E) — "출처 근거 있는 해석 허용 / 예측·권유 금지"로 분리할지 운영자 판단. 이 결정이 방향 2의 전제다.
2. **방향 4 전부** (저비용·무리스크·정책 문서가 직접 요구)
3. **방향 1 + 3 동시** (색인 축소와 계층 복원은 한 몸)
4. **방향 2를 소규모로** — 편수가 아니라 **성격**을 바꾸는 것이 목표. 20~30편으로 효과 관측.
5. GSC 색인 감소 반영 확인 → 재신청

**하지 말 것:** AI 생성 가이드·board 편수 늘리기. 받은 라벨은 '양'이 아니라 '질'이며, AI 생성물 그대로 쓰는 것이 그 라벨의 전형 유형이다.

---

## 출처

- [Google-served ads on screens with replicated content](https://support.google.com/publisherpolicies/answer/11190248)
- [Google Publisher Policies](https://support.google.com/adsense/answer/10502938)
- [Spam policies for Google web search](https://developers.google.com/search/docs/essentials/spam-policies)
- [Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [AdSense Program policies](https://support.google.com/adsense/answer/48182)
