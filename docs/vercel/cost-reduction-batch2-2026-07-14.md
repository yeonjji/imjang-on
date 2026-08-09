# Vercel 비용 절감 배치 2 — 설계 문서

- 작성일: 2026-07-14
- 배경 청구: 7/12–7/14(3일) Infrastructure **$16.20**
- 선행 문서: `docs/vercel/cost-reduction-2026-07-10.md`(= PR #223, 미병합)
- 상태: 설계 승인됨 → 구현 착수 전

---

## 1. 문제 정의

3일치 인프라 청구 $16.20의 구성:

| 라인 | 금액 | 비중 |
|---|---|---|
| **Fast Origin Transfer** (41GB) | **$10.98** | 68% |
| **ISR Writes** (645K) | **$3.36** | 21% |
| Fluid Memory / CPU / Function Inv. 등 | $1.86 | 11% |

두 데이터 소스로 원인을 특정함:

- **Observability(12h):** 캐시 **MISS 75.2%** (ISR 히트 19.2%, CDN 5.6%). 쓰기 127K vs 읽기 17K → 캐시 쓰레싱.
- **Firewall(1h):** 단일 Azure IP `74.7.242.32`(AS8075 Microsoft, netname `cloud`, 역방향 DNS 없음)가 전체 트래픽의 **~40%**, 거의 전량 `/api/staticmap`. **Bot Protection 비활성.**

### 라우트별 ISR 쓰기 (Observability 12h)

| 라우트 | 쓰기 | 고유경로 | revalidate | sitemap |
|---|---|---|---|---|
| /amenity/[category]/[id] | 14K | 7K | 24h | ❌(내부링크) |
| /apt/[id] | 5.6K | 3K | 24h | ✅ |
| /villa/[id] | 5.3K | 2.8K | 24h | ✅ |
| /urban/charger/[id] | 4.7K | 2.3K | **60s** ⚠️ | ❌ |
| /childcare/…/[id] | 3.6K | 1.9K | 24h | ✅ |
| /medical/hospital/…/[id] | 3K | 1.6K | 24h | ✅ |
| /medical/pharmacy/…/[id] | 1.1K | 576 | 24h | ✅ |

---

## 2. 근본 원인 재규정 (핵심)

세 개의 **독립된 비용 벡터**이고, 각각 도구가 다르다:

| 벡터 | 근거 | 올바른 도구 | 금액 규모 |
|---|---|---|---|
| **A. force-dynamic 허브** (`/`,`/apt`,`/officetel`,`/villa`) | 캐시 0, 매 요청 풀 렌더 | **#223 병합**(허브→ISR) | **큰돈** (전송 15–40GB) |
| **B. Azure 스크래퍼의 /api/staticmap 폭격** | IP 1개=트래픽 40%, 위장 UA | **방화벽 IP 차단**(robots로는 불가) | **큰돈** (staticmap PNG 미스 전송) |
| **C. ISR 쓰기 쓰레싱** | amenity 14K, charger 4.7K | charger=revalidate 수정 / amenity=크롤축소 | **소액** ($3.36 전체) |

### 2.1 반드시 인지할 메커니즘 (적대적 리뷰 결과)

- **ISR 쓰기 = 요청 시 캐시 미스로 인한 페이지 재생성.**
- **charger(4.7K)** = 적은 URL이 `revalidate=60초`로 **반복** 재생성 → `60→24h`가 정확한 즉효 레버.
- **amenity(14K)** = 많은 서로 다른 URL이 각각 1회 크롤 → 쓰기 수 ≈ 크롤된 URL 수.
  **→ noindex도 revalidate도 amenity 쓰기를 못 줄인다.** 구글은 noindex 태그 재확인을 위해 계속 크롤하며, 크롤 축소는 몇 주 걸린다. amenity 쓰기를 실제로 없앨 유일한 코드 수단은 `robots.txt Disallow`(또는 내부링크/URL 수 축소)뿐.
- **금액 관점:** ISR 쓰기 라인 전체가 $3.36. amenity 몫은 ~수십 센트~$1. **돈은 전송비($10.98)에 있고, 그건 벡터 A·B가 지배.**

**결론: amenity/charger noindex는 "비용 절감"이 아니라 "애드센스 얇은-콘텐츠 위생"용으로 규정한다.** 비용은 A(#223)+B(방화벽)로 잡는다.

---

## 3. 목표 / 비목표

**목표**
- 월 인프라 비용을 유의미하게(전송비 중심) 절감.
- **애드센스 승인/게재, 검색봇 크롤, SEO 색인에 손상 0.**
- 각 레버의 효과를 **귀속 가능**하게 측정.

**비목표**
- 얇은 POI 페이지의 대규모 아키텍처 개편(별도 과제).
- robots.txt 콘텐츠 차단(현 단계 제외, 컨틴전시 카드로만).
- 약국 사이트맵 정리(이번 배치 제외 — §6).

**성공 기준**
- 스크래퍼 IP 차단 후 24h: Fast Origin Transfer / Function Invocations 하락 관측.
- #223 병합 후: 허브 전송비 하락, 허브가 빈 페이지 아닌 실데이터 서빙 확인.
- charger PR 후: charger ISR 쓰기 급감.
- 전 기간 GSC Coverage·클릭, 애드센스 매출 회귀 없음.

---

## 4. 단계적 실행 계획 (측정 간격 필수)

> 한꺼번에 배포하면 귀속 불가. **레버마다 측정 창을 둔다.**

### Lever 0 — 진단 (착수 전 1회)
- Vercel Observability에서 **Fast Origin Transfer·ISR Writes를 라우트별**로 분해(이미 §1 확보).
- 방화벽 로그에서 스크래퍼가 `/api/staticmap` **외 HTML(`/amenity/*` 등)도 긁는지** 확인. (1h 표본상 상위 경로는 staticmap 지배 → amenity 쓰기는 정상 구글봇 내부링크 크롤로 추정.)

### Lever 1 — Azure 스크래퍼 차단 (1순위, 즉시, 오탐 0) — **사용자(대시보드)**
Vercel Firewall은 대시보드 전용(§7). **Log 먼저.**
1. **IP Deny 규칙(전 경로):** `ip_address = 74.7.242.32`(또는 AS8075/Azure CIDR) → Log로 관찰 → Deny(403/429). 실사용자·검증봇에 오탐 0.
2. **Rate Limit 규칙(일반 그물):** `path startsWith /api/staticmap` → Rate Limit(IP 키, 10분 창, ~300) → **Log 유지**(2~7일 관찰).
3. 측정: 24h 후 Fast Origin Transfer / Function Invocations 비교.

### Lever 2 — PR #223 병합 (전송비 큰돈) — **나(코드) + 사용자(확인)**
1. `tests/lib/robots.test.ts` 수정(§8.1) → `feat/vercel-cost-safe-batch`에 커밋 → CI `check` green.
2. **#223 diff 확장 금지**(계약='색인 영향 0' 유지). 테스트 수정만.
3. 병합 → 프로덕션 배포 → **warm-hub-cache 워크플로가 실제로 돌았는지 확인**(§8.2). 안 돌면 수동 revalidate+warm.
4. 측정: 허브 전송비 + `x-vercel-cache: HIT` 실데이터 확인.

### Lever 3 — charger revalidate 수정 (깔끔한 쓰기 절감) — **나(코드)**
- **#223 병합 후** main에서 새 브랜치(예: `feat/poi-index-diet`)를 따 별도 PR.
- `app/(public)/urban/charger/[id]/page.tsx:28` `revalidate = 60` → `86_400`(§8.3).
- 측정: charger ISR 쓰기 급감.

### Lever 4 — amenity·charger noindex (애드센스 위생, 비용 아님) — **나(코드), 단 GSC 확인 후**
- **선행 게이트:** GSC에서 `/amenity/[category]/[id]`·`/urban/charger/[id]` 패턴의 노출·클릭 확인. 유입 거의 없으면 진행, 있으면 재고.
- Lever 3과 **같은 follow-up PR**에 포함. 각 `generateMetadata`에 `robots: { index: false, follow: true }` 추가(§8.4).
- **애드센스 제출 창과 분리**해서 배포(색인 영향 변경이므로).
- 기대 효과: 비용 ~$0, 얇은-콘텐츠 위생 개선.

### 제외 / 컨틴전시
- ~~약국 사이트맵 제거~~ → **제외**(§6).
- **robots.txt Disallow**(amenity/charger 상세) → 컨틴전시. amenity 14K 쓰기를 실제로 없앨 유일한 코드 수단이나, 절감액 ~$1 대비 링크에쿼티 손실. GSC 관찰 후 크롤이 과도하게 지속될 때만 재검토.

---

## 5. 브랜치 / 시퀀싱 전략

단일 트렁크(feat/* → main 직접 PR, 병합 즉시 배포).

1. `tests/lib/robots.test.ts` 수정 → **`feat/vercel-cost-safe-batch`에 커밋**(rebase/확장 금지) → `check` green → **#223 병합**.
2. `fix/board-reference-freshness`(현재 브랜치)는 **무관한 보드 PR** — 비용 작업 절대 올리지 않음.
3. #223가 main에 오른 뒤: `git switch main && git pull` → 새 브랜치 `feat/poi-index-diet` → **charger revalidate + amenity/charger noindex**를 한 follow-up PR로.
4. **왜 분리:** #223 계약이 '색인 영향 0'. noindex는 색인 영향 변경이라 번들 시 계약 위반 + 병합-즉시-배포에서 깔끔한 비용 승리와 색인 변경이 엉켜 단독 롤백이 어려워짐.

---

## 6. 약국 사이트맵 제거를 제외하는 이유

- 약국 상세는 **이미 noindex**(#221, `dc085a3`) → 사이트맵 제거해도 **색인 불변**, **쓰기 1.1K로 작음** → **비용·색인 모두 no-op**.
- 샤드 id가 **전역 순차**(`lib/sitemap/manifest.ts` `let id=0; id++`). 중간의 약국(≈3샤드) 제거 시 **뒤 샤드 번호 −3 시프트** → GSC에 일시적 tail 404 + 컨테이너 churn. `sources.ts:282` append-only 불변식이 이를 경고.
- **하필 애드센스 재심사 중 GSC 신호를 지저분하게** 만듦. `approval-strategy-2026-07-08.md`가 이미 "보류"로 결정.
- 유일 이득은 "Submitted URL marked noindex" **경고(정보성)** 소거뿐 → 이번 배치에서 제외, 필요 시 단독으로 별도 처리.

---

## 7. 방화벽 상세 레시피 (대시보드 전용)

`/api/staticmap` = NCP 정적지도 좌표별 프록시(상세페이지 대표이미지, 사용자 1페이지=~1콜, CDN `s-maxage=30d`).

### 규칙
- **IP Deny(권장 1순위):** `path startsWith /api/staticmap` **없이 전 경로** `ip = 74.7.242.32`(또는 AS8075 CIDR) → Log → Deny(403). 오탐 0, 스크래퍼가 HTML도 긁으면 그 쓰기까지 차단.
- **Rate Limit(일반 그물):** `path startsWith /api/staticmap` + IP 키 + **10분 창**(버스트 평탄화) + limit ≈ 300 → Log 유지.
- **JA4로 격리 금지**(크롬 릴리스마다 단일 JA4 → 실사용자 포함). IP+경로+레이트가 정답.
- `app/robots.ts`의 `/api/staticmap` allow는 **그대로 둔다**(방화벽과 직교).

### 검증봇 안전 (애드센스 게재 리스크)
- **커스텀 규칙은 검증봇 자동제외가 적용 안 됨** — 모든 트래픽(구글봇/Mediapartners/Yeti 포함)에 평가됨. 이들의 안전은 **오직 레이트 임계값**(단일 엔드포인트 30/분 미도달)에서 나온다.
- 보조로 `AND user_agent NOT contains (Googlebot|Mediapartners|AdsBot|bingbot|Yeti)` 추가 가능(UA는 위조 가능 → 2차 수단).
- **Bot Protection(managed)는 이 문제 해결책으로 켜지 않는다**(단일 IP·단일 엔드포인트에 과함). 켠다면 Log 먼저 + Mediapartners-Google가 verified/allowed로 분류되는지 확인(챌린지되면 애드센스 게재 중단).

### Log → 차단 승격 게이트 (전부 충족 시에만)
1. **주중+주말 포함 2~7일** 관찰(10분 라이브뷰는 하한, diurnal 스크래퍼엔 부족).
2. 트립한 IP가 전부 데이터센터/호스팅 ASN(예 AS8075) — 국내 주거/모바일 CGNAT IP 0.
3. 트립/챌린지 행에 검증봇(Googlebot/Mediapartners/AdsBot/Bingbot/Yeti) 0.
4. 정상 상세 세션 오탐 0.
5. 임계값이 관측된 정상 IP 피크의 3~5배 이상 & 스크래퍼 레이트 미만.
- 승격: Log → **Deny(403)/429**(비-JS 봇이라 Challenge는 무의미). 롤백=Log로 즉시 복귀(재배포 불필요).
- `vercel.json`에는 challenge/deny만 표현 가능(log/bypass 불가) → **관찰 단계는 대시보드 필수**.

---

## 8. 정확한 코드 변경

### 8.1 PR #223 언블록 — `tests/lib/robots.test.ts`
`{ userAgent: blockedBots, disallow: '/' }` 규칙(allow 없음)이 "모든 룰이 /api/staticmap 허용" 단정 3개를 깨뜨림. **최소 수정:**

1. `const rules = ...` 뒤에 파티션 추가:
   ```ts
   // allow 목록을 가진 그룹만 콘텐츠 크롤 허용 그룹. 전면 차단 그룹(allow 없음, disallow:'/')은
   // /api/staticmap·/api/·_rsc 예외가 적용되지 않으므로 아래 3개 단정에서 제외한다.
   const allowedRules = rules.filter((rule) => rule.allow !== undefined);
   const blockedRules = rules.filter((rule) => rule.allow === undefined);
   ```
2. 3개 it-block('/api/staticmap 허용', '/api/ 차단', '_rsc 차단')의 `for (const rule of rules)` → `for (const rule of allowedRules)`.
3. 차단 그룹 커버리지 보전용 4번째 it-block 추가:
   ```ts
   it('SEO 스크래퍼/AI 크롤러 그룹은 전면 차단한다', () => {
     expect(blockedRules.length).toBeGreaterThan(0);
     for (const rule of blockedRules) {
       const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
       expect(disallow, `rule for ${String(rule.userAgent)}`).toContain('/');
     }
   });
   ```
4. 로컬 확인: `pnpm exec vitest run tests/lib/robots.test.ts`(4 pass) + `pnpm lint`(미사용 변수 주의).

### 8.2 warm-hub-cache 병합 후 확인
- 트리거: Vercel GitHub 연동의 `deployment_status` 이벤트. **main에 올라야 발화**(feature 브랜치에선 skip이 정상).
- 게이트: `state == 'success' && environment == 'Production'`(대문자 P 정확히). Vercel이 다른 문자열(`production` 등) 보내면 조용히 skip.
- 확인: `gh run list --workflow=warm-hub-cache.yml` → 최신 run의 `warm` 잡이 'skipping' 아님 → `gh run view <id> --log`에서 4개 경로 `warm(round 1/2) /apt -> 200`.
- 폴백(허브가 최대 900s 빈 페이지): workflow_dispatch 없음 → 두 단계 수동 실행:
  ```bash
  curl -fsS -X POST "$SITE_URL/api/revalidate" -H 'Content-Type: application/json' \
    -d '{"token":"'"$REVALIDATE_TOKEN"'","paths":["/","/apt","/officetel","/villa"]}'
  for p in / /apt /officetel /villa; do curl -sI "$SITE_URL$p"; done   # 2회차 x-vercel-cache: HIT
  ```
  여전히 비면 동일 커밋 재배포로 `deployment_status` 재발화.

### 8.3 charger revalidate — `app/(public)/urban/charger/[id]/page.tsx`
- **line 28:** `export const revalidate = 60;` → `export const revalidate = 86_400;`

### 8.4 amenity·charger noindex (각 `generateMetadata` 반환 객체에 inline)
- `app/(public)/urban/charger/[id]/page.tsx` — `alternates: { canonical: ... }`(line 51) 다음 줄에 `robots: { index: false, follow: true },` 추가.
- `app/(public)/amenity/[category]/[id]/page.tsx` — `alternates: { canonical: ... }`(line 44) 다음 줄에 동일 추가.
- 주의: 초기 `return {}`(not-found) 분기엔 넣지 않음. 공유 helper 만들지 말고 inline(기존 apt/villa/pharmacy 컨벤션). `86_400` 언더스코어 표기. `import type { Metadata }` 이미 존재.
- amenity revalidate는 **이미 86_400 — 건드리지 않음.**

---

## 9. 측정 & 검증 프로토콜

| 시점 | 레버 | 관측 지표 | 성공 |
|---|---|---|---|
| Lever 1 +24h | 스크래퍼 IP Deny | Fast Origin Transfer, Function Inv., 트래픽 볼륨 | 하락, 검증봇/CGNAT 오탐 0 |
| Lever 2 병합+deploy | #223 허브 ISR | 허브 전송비, `x-vercel-cache` | HIT+실데이터, 허브 전송 하락 |
| Lever 3 PR 후 +24h | charger revalidate | charger ISR Writes | 급감 |
| Lever 4 배포 후 (주 단위) | amenity/charger noindex | GSC Coverage(색인 제거), 클릭 손실 | 비용 불변 예상, 클릭 손실 없음 |
| 상시 | 전체 | 애드센스 매출, GSC/Naver Coverage | 회귀 없음 |

- 레버 사이에 측정 창을 두어 귀속 가능성 확보(동시 배포 금지).
- 방화벽 **rate rule 차단(enforce) 판정은 별도 2~7일 창**으로 분리 보고(24~48h 창과 섞지 않음).

---

## 10. 리스크 & 완화

| 리스크 | 완화 |
|---|---|
| 방화벽이 Mediapartners-Google 챌린지→광고 중단 | Log 먼저 + 검증봇 verified 확인, 커스텀 rate는 임계값으로만 안전, deny는 IP 한정 |
| CGNAT 국내 모바일 오탐 | 10분 창 + 관찰서 주거/모바일 ASN 트립 0 확인 후 승격 |
| #223 warm 미발화→허브 빈 페이지 900s | §8.2 확인 + 수동 revalidate 폴백 |
| noindex가 유입 있는 페이지를 색인 제거 | Lever 4 선행 GSC 노출/클릭 게이트 |
| 약국 샤드 renumber GSC 노이즈 | 이번 배치 제외(§6) |
| 색인 변경이 애드센스 재심사 교란 | Lever 4를 제출 창과 분리 배포 |

## 11. 롤백
- 방화벽: 규칙 Log로 즉시 복귀(재배포 불필요).
- #223: 단일 커밋 revert.
- charger/noindex: follow-up PR revert(#223과 분리되어 있어 독립 롤백 가능).
