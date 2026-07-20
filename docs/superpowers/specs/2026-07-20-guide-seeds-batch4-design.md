# 상록 가이드 7편 추가 (카테고리당 4편) — AdSense/SEO enrich

- **작성일:** 2026-07-20
- **상태:** 설계 승인 대기
- **목적:** AdSense/SEO 콘텐츠 강화

## 1. 배경·목표

상록(evergreen) 가이드는 현재 **21편**(7개 카테고리 × 정확히 3편)이 있고, 상세페이지 하단 `RelatedGuides` 블록으로 고트래픽 상세페이지(apt·officetel·villa·병원·약국·학교·청약·금융)와 이미 맥락 링크로 연결돼 있다.

이번 작업의 목적은 **AdSense/SEO enrich**다. 색인 가능한 가이드 페이지를 늘리고, 상세페이지에서 가이드로 들어오는 내부 링크를 강화해 "저품질 콘텐츠(Low value content)" 게이트를 넘기는 최근 흐름(PR #233~#239)의 연장선이다.

**범위:** 카테고리당 1편씩 **총 7편** 추가 → 21편 → **28편**. 각 카테고리 4편 균등.

## 2. 추가할 7개 시드 (승인된 슬레이트)

`lib/guide/seeds.ts`의 `GUIDE_SEEDS` 배열에 아래 7개를 기존과 동일한 shape로 추가한다. 모든 출처는 실재하는 공식 포털이며, `date`는 기존 시드와 동일하게 `'2026-01-01'` 기준선을 쓴다.

| # | key | category | title | related CTA |
|---|-----|----------|-------|------------|
| 1 | `medical-hospital-tiers` | MEDICAL | 의원·병원·종합병원, 종별 차이 이해하기 | 병원 찾기 → `/medical/hospital` |
| 2 | `childcare-kindergarten-vs-daycare` | CHILDCARE | 유치원과 어린이집, 무엇이 다를까 | 어린이집 찾기 → `/childcare` |
| 3 | `school-afterschool-care` | SCHOOL | 초등 돌봄교실·방과후학교 이해하기 | 학교 정보 보기 → `/school` |
| 4 | `realestate-property-registry` | REALESTATE | 등기부등본, 무엇을 확인해야 할까 | 실거래가 조회하기 → `/list` |
| 5 | `subscription-public-vs-private` | SUBSCRIPTION | 국민주택과 민영주택, 청약 차이 이해하기 | 청약 일정 보기 → `/subscription` |
| 6 | `finance-jeonse-loan-basics` | FINANCE | 버팀목 전세자금대출 이해하기 | 정책대출 상품 보기 → `/finance` |
| 7 | `life-ev-charger-access` | LIFE | 전기차 충전소, 어떻게 찾고 따져볼까 | 충전소 찾기 → `/urban/charger` |

### 선정 논리
- 기존 3편과 **겹치지 않는 명백한 공백**을 골랐다. 예: 부동산은 실거래가·면적·공시가격은 있으나 **등기부등본**(임장 핵심 체크리스트)이 없었다.
- 6번은 기존 "전세보증금 반환보증 한도"와 자주 혼동되는 **전세자금대출**을 구분해주는 각도다(반환보증 ≠ 전세대출).
- 7번은 실제 전용 페이지 `/urban/charger`가 있어 맥락 링크 가치가 크다.

### 시드 전문 (구현이 그대로 복사)

```ts
{
  key: 'medical-hospital-tiers',
  category: GuideCategory.MEDICAL,
  title: '의원·병원·종합병원, 종별 차이 이해하기',
  angle: '의원·병원·종합병원·상급종합병원의 종별 구분 기준과 진료 의뢰·회송(1·2·3차) 체계의 일반 구조, 이용 시 확인할 점을 설명한다.',
  source: { name: '건강보험심사평가원', url: 'https://www.hira.or.kr', date: '2026-01-01', excerpt: '요양기관 종별(의원·병원·종합병원·상급종합병원) 구분·현황 정보 공개.' },
  related: { label: '병원 찾기', href: '/medical/hospital' },
},
{
  key: 'childcare-kindergarten-vs-daycare',
  category: GuideCategory.CHILDCARE,
  title: '유치원과 어린이집, 무엇이 다를까',
  angle: '유치원(교육·교육부 소관)과 어린이집(보육·보건복지부 소관)의 대상 연령·운영·정보 확인처의 일반 차이를 설명한다.',
  source: { name: '교육부 유치원알리미', url: 'https://e-childschoolinfo.moe.go.kr', date: '2026-01-01', excerpt: '유치원 현황·정원·운영 정보 공개.' },
  related: { label: '어린이집 찾기', href: '/childcare' },
},
{
  key: 'school-afterschool-care',
  category: GuideCategory.SCHOOL,
  title: '초등 돌봄교실·방과후학교 이해하기',
  angle: '초등학교 돌봄교실과 방과후학교의 운영 목적·대상·신청의 일반 구조와 학교별 운영 정보를 확인하는 방법을 설명한다.',
  source: { name: '교육부 학교알리미', url: 'https://www.schoolinfo.go.kr', date: '2026-01-01', excerpt: '학교별 방과후학교·돌봄 운영 현황 공시.' },
  related: { label: '학교 정보 보기', href: '/school' },
},
{
  key: 'realestate-property-registry',
  category: GuideCategory.REALESTATE,
  title: '등기부등본, 무엇을 확인해야 할까',
  angle: '부동산 등기사항전부증명서(등기부등본)의 표제부·갑구·을구 구성과 소유권·근저당 등 확인 포인트의 일반 개념, 열람 방법을 설명한다.',
  source: { name: '대법원 인터넷등기소', url: 'https://www.iros.go.kr', date: '2026-01-01', excerpt: '부동산 등기사항전부증명서 열람·발급 서비스 제공.' },
  related: { label: '실거래가 조회하기', href: '/list' },
},
{
  key: 'subscription-public-vs-private',
  category: GuideCategory.SUBSCRIPTION,
  title: '국민주택과 민영주택, 청약 차이 이해하기',
  angle: '국민주택과 민영주택의 공급 주체·청약 자격·당첨자 선정 방식의 일반 차이를 설명한다.',
  source: { name: '한국부동산원 청약홈', url: 'https://www.applyhome.co.kr', date: '2026-01-01', excerpt: '국민·민영주택 청약 자격·당첨자 선정 방식 안내.' },
  related: { label: '청약 일정 보기', href: '/subscription' },
},
{
  key: 'finance-jeonse-loan-basics',
  category: GuideCategory.FINANCE,
  title: '버팀목 전세자금대출 이해하기',
  angle: '버팀목 전세자금대출 등 정책 전세대출의 목적·자격 구조와, 전세보증금 반환보증(HUG 등)과의 차이를 구분해 설명한다.',
  source: { name: '주택도시기금', url: 'https://nhuf.molit.go.kr', date: '2026-01-01', excerpt: '버팀목 전세자금대출 등 정책 전세대출 상품 안내.' },
  related: { label: '정책대출 상품 보기', href: '/finance' },
},
{
  key: 'life-ev-charger-access',
  category: GuideCategory.LIFE,
  title: '전기차 충전소, 어떻게 찾고 따져볼까',
  angle: '완속·급속 충전 방식의 일반 차이와 주거지 인근 전기차 충전소를 공식 데이터로 확인하는 방법·유의점을 설명한다.',
  source: { name: '환경부 무공해차 통합누리집', url: 'https://ev.or.kr', date: '2026-01-01', excerpt: '전국 전기차 충전소 위치·충전 방식 정보 제공.' },
  related: { label: '충전소 찾기', href: '/urban/charger' },
},
```

## 3. 코드 변경 (4파일)

### 3.1 `lib/guide/seeds.ts`
`GUIDE_SEEDS` 배열 끝에 §2 "시드 전문"의 7개 시드를 추가. `validateGuideSeeds()`는 수정 불필요(중복 key·카테고리 커버만 검사, 개수는 무관).

### 3.2 `tests/lib/guide-seeds.test.ts`
개수 불변식 갱신:
- 테스트 이름 `'카테고리당 정확히 3편이다(총 21편)'` → `'카테고리당 정확히 4편이다(총 28편)'`
- `expect(n).toBe(3)` → `expect(n).toBe(4)`
- `expect(GUIDE_SEEDS.length).toBe(21)` → `expect(GUIDE_SEEDS.length).toBe(28)`

### 3.3 `scripts/generate-guides.ts` — `--only` CSV 지원
현재 `--only`는 단일 key만 받는다. 7개를 한 번의 workflow_dispatch로 생성하려면 CSV를 받아야 한다.

```ts
// 변경 전
const only = onlyArg ? onlyArg.slice('--only='.length) : null;
const seeds = only ? GUIDE_SEEDS.filter((s) => s.key === only) : GUIDE_SEEDS;

// 변경 후
const onlyKeys = onlyArg
  ? onlyArg.slice('--only='.length).split(',').map((k) => k.trim()).filter(Boolean)
  : null;
const seeds = onlyKeys ? GUIDE_SEEDS.filter((s) => onlyKeys.includes(s.key)) : GUIDE_SEEDS;
```
- 빈 시드 에러 메시지의 `only` 참조도 `onlyKeys?.join(',')`로 맞춘다.
- **재과금 방어의 핵심:** `generateGuideDraft`(LLM 호출)가 dedupe 검사보다 **먼저** 실행되므로, `--only` 없이 돌리면 기존 21편까지 LLM이 재호출(과금)된다. 반드시 신규 7개 key만 CSV로 지정한다.
- 워크플로(`generate-guides.yml`)는 `inputs.only`를 `--only={값}`으로 그대로 넘기므로(`format('--only={0}', inputs.only)`) 워크플로 수정 불필요. CSV는 그대로 통과.

### 3.4 `app/(public)/_components/related-guides.tsx` — 노출 3→4
`RelatedGuides`의 기본 `limit = 3` → `limit = 4`. 카테고리당 4편이 모두 상세페이지 맥락링크로 노출되어, 신규 글이 기존 글을 밀어내지 않고 내부 링크 수를 늘린다(enrich 목적에 부합).
- `getGuidesByCategory(category, limit)`는 `publishedAt DESC take limit`이라 limit만 올리면 됨. 별도 쿼리 수정 불필요.
- 3열 그리드(`lg:grid-cols-3`)에서 4개는 3+1로 자연 배치됨(레이아웃 변경 불필요). 반응형 확인만.

## 4. 운영 런북 (코드 밖 — 머지 후 수동 실행)

1. 브랜치에 위 변경을 push (워크플로는 dispatch한 ref를 checkout하므로 **push가 선행**돼야 신규 시드가 생성 대상이 된다).
2. 생성 실행 (신규 7개 key만, CSV 1회):
   ```
   gh workflow run generate-guides.yml --ref <branch> \
     -f only=medical-hospital-tiers,childcare-kindergarten-vs-daycare,school-afterschool-care,realestate-property-registry,subscription-public-vs-private,finance-jeonse-loan-basics,life-ev-charger-access
   ```
3. 실행 로그에서 **7줄 모두 `<key>: created`** 확인. `rejected`(가드레일 위반)·`duplicate`·`error`면 해당 key만 재실행. **job success ≠ 생성 성공** — 로그 라인 필수 확인.
4. `/admin/guides` 대기(DRAFT) 탭에서 7편 검수 → 발행.
5. 발행 후 노출 확인(§5).

## 5. 성공 기준 (검증)

- **로컬 게이트:** `pnpm test tests/lib/guide-seeds.test.ts`(28/4-each green) · `pnpm lint` · `pnpm typecheck`(=`tsc --noEmit`) 모두 통과. *lint 게이트 필수 — typecheck는 미사용 변수 못 잡음.*
- **생성:** CI 로그 7× `created`.
- **노출(발행 후):** 각 슬러그가 `/guide` 목록과 `/guide/[slug]`에 노출. 샘플 상세페이지 최소 1곳(예: 임의 apt 상세, `/medical/hospital/...`)의 "관련 가이드" 블록에 신규 글이 4편 노출.
- **사이트맵:** 신규 슬러그가 가이드 사이트맵 소스(`lib/sitemap/sources.ts`)에 반영.

## 6. 리스크·완화

| 리스크 | 완화 |
|--------|------|
| 가드레일 `rejected`(금지어·고정 앵커 누락) | angle·source excerpt가 중립·출처 범위 내로 유도. rejected 시 해당 key만 `--only`로 재실행. |
| 재과금(기존 21편 LLM 재호출) | `--only` CSV로 신규 7개만 지정. `only` 없이 절대 실행 금지. |
| 출처 정확성 | 7곳 모두 실재 공식 포털(hira.or.kr·e-childschoolinfo.moe.go.kr·schoolinfo.go.kr·iros.go.kr·applyhome.co.kr·nhuf.molit.go.kr·ev.or.kr). |
| 발행 전 상태 오해 | 생성물은 DRAFT — `/admin/guides` 발행 전엔 `/guide` 비노출(정상). |

## 7. 범위 밖 (Out of scope)

- 신규 카테고리/영역 추가(스키마 enum 변경) — 이번엔 기존 7개 카테고리만.
- 기존 21편 본문 재생성·개편.
- `page-category.ts` 매핑 추가(신규 시드가 기존 카테고리라 매핑 변경 불필요).
- ETL·데이터 수집 변경(가이드는 LLM 생성 콘텐츠, 원천 데이터 파이프라인과 무관).
