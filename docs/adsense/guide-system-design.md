# L7 — evergreen `/guide` 콘텐츠 시스템 설계 (Design)

> 작성: 2026-06-29 · 상태: 설계 승인 대기 → writing-plans
> 상위 맥락: `docs/adsense/thin-content-remediation-design.md`의 L7 (원본 콘텐츠 앵커, 통과 무게중심)

## 0. 목표 & 성공기준
**목표:** AdSense 통과의 남은 무게중심인 "원본 콘텐츠 분량"을 **상록(evergreen) 카테고리 가이드**로 확보한다 — ilsangkit 모델(유한·고유·검수된 수십 편). board(뉴스)와 분리된 별도 시스템.
**성공기준(검증 가능):**
- `Guide` 테이블 기반 `/guide` 목록·상세가 **SSR·색인**된다.
- POI/매물 상세에 페이지 주제와 매칭된 **"관련 가이드"** 링크가 렌더된다.
- **지역 곱하기 양산 0**(주제별 고유 1편, 근접중복 금지).
- 카테고리당 2~3편(**~25–40편**) 검수·게시 후 재심사.

## 1. 핵심 결정 (확정)
- **생산:** AI 생성 → **어드민 검수** → 게시(board의 AI생성→검수→게시 흐름 재사용).
- **저장:** board와 **분리된 별도 `Guide` 테이블**(장르·가드레일·카테고리가 달라 분리가 깨끗). board의 `Post`/`PostCategory`는 손대지 않음.
- **검수 UI:** **신규 `/admin/guides`**(얇게). 기존 `/admin/posts` 일반화는 안 함.
- **재사용 범위:** 테이블-무관 헬퍼만(LLM 호출 래퍼·slug 생성·출처정책·markdown/html-text). 테이블-결합 부분(생성 모듈·쿼리·검수)은 가이드 전용 신규.

## 2. 데이터 모델 (마이그레이션 1개)
신규 `Guide` 모델 + `GuideCategory` enum. board 스키마 불변.

```prisma
enum GuideCategory { REALESTATE  SUBSCRIPTION  FINANCE  MEDICAL  CHILDCARE  SCHOOL  LIFE }

model Guide {
  id        BigInt        @id @default(autoincrement())
  slug      String        @unique @db.VarChar(200)
  title     String        @db.VarChar(200)
  summary   String        @db.Text
  body      String        @db.Text          // markdown
  category  GuideCategory
  status    PostStatus    @default(DRAFT)    // 기존 enum 재사용(DRAFT/PUBLISHED)

  // 근거(출처) — E-E-A-T·과장금지 원칙상 필수
  sourceName    String   @db.VarChar(120)
  sourceUrl     String   @db.VarChar(500)
  sourceDate    DateTime @db.Date
  sourceExcerpt String   @db.Text

  dedupeKey   String    @unique @db.VarChar(120)  // 중복 생성 방지
  generatedAt DateTime  @default(now())
  reviewedAt  DateTime?
  publishedAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([status, publishedAt(sort: Desc)])
  @@index([category, status])
}
```
> `PostStatus`(DRAFT/PUBLISHED)는 기존 enum 재사용. 가이드 전용 필드(목차·HowTo 단계 등)는 **YAGNI** — 필요해지면 후속 추가.

## 3. 콘텐츠 생산 — `lib/guide/`
board의 테이블-무관 헬퍼를 import해 가이드 전용 모듈 구성.
- **주제 시드 리스트**(유한·고유, 지역 변수 없음) — 카테고리별 2~3 주제.
- **생성기:** 시드 주제 → 가이드 프롬프트 → DRAFT `Guide` 생성(dedupeKey로 중복 방지). LLM 래퍼·slug·출처정책은 board 헬퍼 재사용.
- **가이드 가드레일**(`lib/guide/guardrails.ts`, board와 별도): 해설·비교·하우투 **허용**. **금지:** 과장·단정적 시세전망·투자권유. **필수:** 출처표기·중립 톤(PRODUCT.md "조용한 정보 안내자").
- 게시는 **수동 검수 필수**(자동 게시 없음).

## 4. 검수 — `/admin/guides` (신규, 얇게)
- 목록(`app/admin/guides/page.tsx`): DRAFT/PUBLISHED 필터, 카테고리 필터.
- 에디터(`app/admin/guides/[id]/...`): title·summary·body·category·출처 편집 + **상태 토글(DRAFT→PUBLISHED, reviewedAt/publishedAt 기록)**. 서버 액션.
- 기존 `/admin/posts` 권한·레이아웃 패턴 따름.

## 5. 공개 라우트 & SEO
- `app/(public)/guide/page.tsx` — 목록(카테고리 필터·요약 카드). PUBLISHED만.
- `app/(public)/guide/[slug]/page.tsx` — 상세: ReactMarkdown(body) + 출처 표기(`SourceCaption`/PostSource 패턴) + breadcrumb. SSR.
- **사이트맵:** `lib/sitemap/sources.ts`에 `guide` 소스 추가(PUBLISHED Guide URL 방출).
- **JSON-LD:** `lib/seo/json-ld.tsx`에 `Article`(필요 시 `HowTo`) 스키마 추가(+BreadcrumbList). 기존 `articleSchema`(NewsArticle)와 별도.
- **나브:** 공개 헤더에 "가이드"(`/guide`) 추가.

## 6. POI 연결 (L4 실현)
- POI/매물 상세에 **"관련 가이드"** 블록: 페이지 카테고리 → `GuideCategory` 매핑으로 PUBLISHED 가이드 N편(예: 3) 링크. 매칭 없으면 블록 생략(빈 블록 금지).
- **매핑 함수** `lib/guide/page-category.ts`:
  - `medical/hospital`·`medical/pharmacy` → `MEDICAL`
  - `childcare` → `CHILDCARE` · `school` → `SCHOOL`
  - `apt`·`villa`·`officetel`·`region` → `REALESTATE`
  - `subscription` → `SUBSCRIPTION` · `finance`·`jeonse-guarantee` → `FINANCE`
  - `amenity`·`subway`·`life` → `LIFE`
- 신규 서버 컴포넌트 `RelatedGuides`를 각 상세 페이지에 삽입(BoardBriefingSection 옆).

## 7. 주제 시드 (초기, 확정은 검수 단계)
- **MEDICAL:** 진료과 선택법 · 야간/공휴일 병원·약국 찾기 · 건강검진 안내
- **CHILDCARE:** 어린이집 유형·고르는 법 · 입소대기 · 보육료 지원
- **SCHOOL:** 학군·배정 이해 · 전학 절차
- **REALESTATE:** 실거래가 읽는 법 · 전세가율·갭투자 · 등기부 보는 법 · 매매 체크리스트
- **SUBSCRIPTION:** 청약 자격·가점 · 일정 보는 법 · 무순위(줍줍)
- **FINANCE:** 디딤돌·보금자리 한도 · 전세보증 한도 · DSR 이해
- **LIFE:** 역세권·지하철 · 전기차 충전·주차

## 8. 테스트 & 검증
- **단위:** 가이드 가드레일(금지어·출처 필수), `page-category` 매핑, 사이트맵 guide 소스, JSON-LD(Article/Breadcrumb 파싱), slug 생성.
- **검증:** `/guide` 목록·상세 no-JS fetch에 본문 존재(SSR), POI 상세에 관련가이드 렌더, 사이트맵에 guide URL, 지역 곱 0편.

## 9. 범위 밖 (YAGNI)
- 지역 곱하기 양산 · board 뉴스 파이프라인/스키마 변경 · 가이드 **자동** 게시(검수 필수) · 가이드 전용 부가필드(목차·HowTo 단계) · 25–40편 본문을 다 쓰는 것(시스템 + 생성 도구까지가 구현 범위, 실제 집필·검수는 운영) · 댓글·평점 등.

## 10. 구현 단위 (plan 분해 예고)
1. 데이터 모델(Guide + GuideCategory + 마이그레이션).
2. `lib/guide` — 타입·쿼리·가드레일·생성 모듈(+시드).
3. `/admin/guides` — 목록·에디터·검수 액션.
4. `/guide` 공개 라우트 + JSON-LD + 사이트맵 소스 + 나브.
5. POI "관련 가이드" 블록 + page-category 매핑 + 상세 배선.
