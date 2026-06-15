# 자동 게시판(/board) 콘텐츠 파이프라인 — 설계

- 작성일: 2026-06-15
- 상태: 설계 합의 완료 (구현 계획 대기)
- 한 줄: 매일 공공 보도자료를 근거로 금융·부동산 이슈 해설 글을 자동 생성하고, 어드민 컨펌 후 `/board`에 게시한다.

---

## 1. 목표 & 범위

매일 자동으로 금융·대출·경제·청약·부동산 분야의 이슈 해설 글을 생성해 게시판(`/board`)에 올린다. **사실·출처 기반**이 최우선 가치이며, **생성은 자동이지만 게시는 사람(운영자) 컨펌 이후**에만 이루어진다.

파이프라인: **이슈 수집 → 글 생성 → 컨펌 → 게시**

### 비범위 (이번엔 안 함)
- 생성형 AI 이미지 (브랜드·사실성 원칙과 충돌 → 사용 안 함)
- 회원/로그인 시스템 (어드민은 기존 Basic Auth로 충분)
- 댓글, 좋아요 등 커뮤니티 기능
- 뉴스 본문 재가공 (저작권 — 뉴스는 탐지 신호로만)

---

## 2. 핵심 결정 (확정)

| # | 결정 | 선택 |
|---|---|---|
| 템플릿 | 주제 유형별 2개 템플릿 + 자동 분류 | **B** (PROGRAM 제도형 / TREND 동향형) |
| 수집 전략 | 뉴스=이슈 탐지 전용, 본문 사실=공공 1차 자료 | **C (혼합)** |
| 근거 확보 | 공식 피드 레지스트리 + RAG 주입, 매칭 실패 시 스킵 | **A** |
| 컨펌 범위 | 인라인 수정 후 게시 | **B** |
| 이미지 | 생성형 AI 안 씀. OG 템플릿 썸네일 자동 생성 | **B** |
| 어드민 보안 | 기존 Basic Auth(`middleware.ts`), 공개 링크 비노출 | 기존 재사용 |
| 본문 저장 | 마크다운 단일 문자열 | 확정 |
| 게시판 경로 | `/board` | 확정 |

### 코드 레벨로 강제하는 4대 원칙
1. **LLM은 주입된 공공 자료 텍스트 안에서만 작성** — 자기 지식 사용 금지 (RAG).
2. **공식 근거 없으면 글 없음** — 매칭 실패 시 해당 이슈 스킵.
3. **생성과 게시 분리** — 자동은 DRAFT까지만, PUBLISHED는 반드시 사람 손.
4. **변이 동작(게시·수정·삭제)은 전부 `/admin` 하위 Server Action** — Basic Auth가 자동 보호.

---

## 3. 아키텍처

기존 ETL 패턴(`scripts/ingest/*` + GitHub Actions 크론 + Prisma + Supabase)에 그대로 얹는다. 새 인프라 없음.

생성 파이프라인은 **GitHub Actions에서만 실행**된다. 공개 사이트(Vercel) 런타임은 OpenAI를 절대 호출하지 않는다 → `OPENAI_API_KEY`는 Actions Secret에만 둔다.

```
[1] 이슈 탐지   뉴스 검색 API로 오늘의 화제 토픽 수집 (5개 분야 키워드)
                 → 본문엔 안 씀. "뭐가 이슈인가" 신호로만.
      ▼
[2] 근거 매칭   공식 피드 레지스트리에서 이슈와 매칭되는 최신 보도자료 탐색
                 ├ 실패 → 스킵 (지어내지 않음)
                 └ 성공 → 보도자료 원문 텍스트 확보
      ▼
[3] 분류+생성   OpenAI (입력 = 보도자료 원문 + 규칙만)
                 3a. 분류: PROGRAM / TREND
                 3b. 해당 템플릿으로 structured output 생성
                 → 가드레일(금지표현·분량·출처) 통과 필수
      ▼
[4] 저장        Post insert, status=DRAFT
      ▼
[5] 알림        notify.ts → "오늘 초안 N건 대기" 운영자 채널 발송
      ▼
─────── 여기까지 자동 / 아래는 수동 ───────
      ▼
[6] 컨펌        /admin/posts (Basic Auth) → 인라인 수정 → [게시]/[반려/삭제]
      ▼
[7] 게시        PUBLISHED + ISR revalidate → /board 노출
```

### 공식 피드 레지스트리
기존 `lib/data-sources.ts` 출처 레지스트리(SSOT) 패턴과 동일한 결로 작성. 새 소스는 한 줄씩 추가.
- 대상(초기): 국토교통부, 금융위원회, 기획재정부, 한국부동산원, HUG(주택도시보증공사), 주택도시기금, HF(주택금융공사), 정책브리핑(korea.kr), 청약홈 공지
- 각 항목: 기관명, 보도자료 RSS/목록 URL, 카테고리 힌트, 파서 방식

---

## 4. 데이터 모델 (Prisma)

```prisma
enum PostStatus   { DRAFT  PUBLISHED  REJECTED }
enum PostType     { PROGRAM  TREND }                 // 제도/상품형, 사건/동향형
enum PostCategory { FINANCE LOAN ECONOMY SUBSCRIPTION REALESTATE } // 금융 대출 경제 청약 부동산

model Post {
  id            BigInt      @id @default(autoincrement())
  slug          String      @unique                  // URL용 (예: 2026-06-15-디딤돌대출-한도)
  title         String
  summary       String      @db.Text                 // 목록·OG 썸네일·메타용 한 줄
  body          String      @db.Text                 // 마크다운 단일 본문(섹션 포함)
  type          PostType
  category      PostCategory
  status        PostStatus  @default(DRAFT)

  // 근거(출처) — 모든 글에 필수
  sourceName    String                               // 예: "국토교통부"
  sourceUrl     String                               // 보도자료 원문 링크
  sourceDate    DateTime                             // 기준일(보도자료 발표일)
  sourceExcerpt String      @db.Text                 // 생성 근거 원문 발췌(비공개, 감사/재생성용)

  // 중복 방지
  dedupeKey     String      @unique                  // sourceUrl 해시 등 — 같은 보도자료 재생성 차단

  // 운영 메타
  detectedFrom  String?                              // 탐지된 뉴스 키워드(비공개, 감사용)
  generatedAt   DateTime    @default(now())
  publishedAt   DateTime?
  reviewedAt    DateTime?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  @@index([status, publishedAt])                     // 공개 목록 정렬
  @@index([category, status])                        // 카테고리 필터
}
```

설계 의도:
- 출처 4종(`sourceName/Url/Date/Excerpt`) 필수 → "출처 없는 글 불가"를 스키마로 강제.
- `sourceExcerpt`는 비공개 보관 → 근거 추적·재생성 가능.
- `dedupeKey`로 동일 보도자료 중복 발행 차단.
- 썸네일은 **저장 안 함** — `title + category + sourceDate`로 OG `ImageResponse`가 매번 생성.

---

## 5. 콘텐츠 템플릿 (2종)

공통 규칙(두 템플릿 모두 적용):
1. 제공된 자료·출처에 근거해서만 작성. 원문에 없는 내용 추측·추가 금지.
2. 집값 전망·투자 조언·추천·예측 등 의견성 문장 금지.
3. "~으로 보입니다 / ~일 가능성이 있습니다 / ~할 것으로 예상됩니다" 등 표현 금지.
4. 객관·중립 어조, 어려운 용어는 풀어서 설명.
5. 표·목록 적극 활용. 전체 1,500~2,000자.
6. 출처·기준일 필수.

### 5.1 PROGRAM (제도/상품형) — 9단계 고정 구조
독자가 "이게 무엇 → 내가 대상인지 → 어떻게 신청"을 따라가도록.
1. 서론(제도/이슈 소개)
2. 제도/상품 한눈에 보기
3. 주요 지원 내용 / 핵심 정보
4. 신청 대상 및 자격 조건
5. 신청 기간 및 신청 방법
6. 유의사항
7. 자주 묻는 질문(FAQ)
8. 마무리
9. 출처 및 기준일

### 5.2 TREND (사건/동향형) — "신청 방법/자격"이 성립 안 하는 이슈용
1. 무슨 일인가 (요약)
2. 핵심 수치 (표 위주)
3. 배경 · 맥락
4. 영향 받는 대상
5. 관련 제도 · 다음 일정 (자료에 있을 때만)
6. 유의사항
7. 출처 및 기준일

---

## 6. 어드민 / 컨펌

기존 `app/admin` + Basic Auth 확장. 공개 사이트엔 링크 비노출(주소 직접 입력) + 비밀번호가 실제 잠금.

- **`/admin/posts`**: 탭(대기/게시됨/반려). 행 = 제목·카테고리·유형 뱃지·출처기관·기준일·생성시각.
- **`/admin/posts/[id]`**: 좌측 편집(제목 input, 유형·카테고리 select, 본문 마크다운 textarea + 미리보기), 우측 근거 패널(출처 링크 + `sourceExcerpt` 원문 읽기전용). 미리보기는 공개 상세와 동일 컴포넌트로 렌더(WYSIWYG 일치).
- **Server Actions**(`/admin` 하위): `publishPost`(→ PUBLISHED + publishedAt + ISR revalidate) / `rejectPost` / `updatePost` / `deletePost`.
- 마크다운 렌더러 의존성 1개 추가(예: `react-markdown`).

---

## 7. 게시판 페이지 (공개)

- **목록 `/board`** (ISR, 게시 시 revalidate): OG 템플릿 썸네일 + 카테고리 뱃지 + 제목 + summary + 기준일. 카테고리 필터 탭 + 페이지네이션.
- **상세 `/board/[slug]`** (ISR): 마크다운 본문 + 헤더(제목·카테고리·기준일) + 하단 `SourceCaption`(기존 컴포넌트, 출처기관+링크) + JSON-LD Article 스키마 + OG 썸네일(`opengraph-image` 라우트 재사용) + 빵부스러기.
- **SEO**: 기존 샤딩 사이트맵 `SOURCE_MAP`에 "게시글" 소스 추가 → 자동 색인. `robots.ts`에 `/board/` allow.
- **내비**: 헤더 메뉴에 "소식"(또는 "게시판") 추가.

---

## 8. 스케줄 · 비용 · 가드레일

### 스케줄
- GitHub Actions 크론 **하루 1회**(KST 오전, 보도자료 발표 이후 시간대). 기존 ingest 워크플로 패턴.
- **하루 생성 상한 N건**(초기 3건 제안) — 비용·컨펌 부담 통제. 매칭 0건이면 발행 0건이 정상.

### 비용 / 키
- OpenAI: structured outputs 지원 최신 모델 + 낮은 temperature. (구현 시 최신 모델 ID 확인)
- 호출: 분류(저렴) + 생성. 하루 몇 건 × 수천 토큰 → 하루 몇 센트 수준.
- `OPENAI_API_KEY`는 **GitHub Actions Secret에만**. 공개 런타임 미사용.
- 뉴스 검색: 네이버 검색 API 등 별도 앱 자격증명 필요(지도용 NCP와 별개).

### 가드레일 (프롬프트뿐 아니라 코드로 강제)
- 금지표현 정규식 필터("보입니다/가능성이 있습니다/예상됩니다/전망/추천" 등) → 검출 시 재생성 또는 폐기.
- 분량 검사 1,500~2,000자(±허용치).
- 출처 필수(null이면 저장 거부).
- (선택, MVP 이후) 2차 검증 패스: 생성문을 `sourceExcerpt`와 대조해 "원문에 없는 주장" 검출하는 LLM 1콜.
- 운영 추적: 기존 `IngestionRun` 모델로 매 실행 성공/스킵/실패 기록.

---

## 9. 컴포넌트 경계 (구현 단위)

| 단위 | 책임 | 의존 |
|---|---|---|
| `lib/board/feed-registry.ts` | 공식 피드 레지스트리(SSOT) | — |
| `scripts/ingest/posts/detect-issues.ts` | 뉴스 탐지 → 후보 이슈 | 뉴스 API |
| `scripts/ingest/posts/match-source.ts` | 이슈 ↔ 보도자료 매칭 + 원문 확보 | feed-registry |
| `scripts/ingest/posts/generate.ts` | 분류+생성+가드레일 → DRAFT insert | OpenAI, Prisma |
| `lib/board/guardrails.ts` | 금지표현·분량·출처 검사 | — |
| `lib/board/post.ts` | Post 조회/목록 (공개) | Prisma |
| `app/(public)/board/page.tsx` · `[slug]/page.tsx` | 공개 목록·상세 | lib/board/post |
| `app/(public)/board/[slug]/opengraph-image.tsx` | 템플릿 썸네일 | lib/seo/og |
| `app/admin/posts/*` + actions | 컨펌·수정·게시 | Prisma, revalidate |

각 단위는 단일 책임 + 명확한 인터페이스로 독립 테스트 가능하게 둔다.

---

## 10. 열린 항목 (구현 단계에서 확정)
- 뉴스 검색 API 최종 선택(네이버 검색 API 유력) 및 자격증명 발급.
- OpenAI 최신 모델 ID 확정.
- 하루 생성 상한 N 최종값.
- 초안 대기 알림 채널(`notify.ts` 기존 채널 재사용).
