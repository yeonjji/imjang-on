# 게시글 구조·디자인 개편 설계

- 작성일: 2026-06-30
- 상태: 승인됨 → 구현 예정
- 관련: 자동 게시판(board)·상록 가이드(guide), AdSense thin-content 개선, 경쟁사 [ilsangkit.co.kr](https://ilsangkit.co.kr/guide)

## 배경 / 목표

현재 임장ON 브리핑(board)·가이드(guide) 글은 "글만 쭉 나열"되는 문제가 있다.
원인은 렌더러가 아니라 **생성 프롬프트**다 — `lib/board/generate.ts`의 SYSTEM_PROMPT가
명시적으로 구조화를 억제한다:

- 규칙 6: "문단 중심의 산문으로 서술한다. 정보를 표·불릿으로 토막내 나열하지 말고"
- 규칙 8: "소제목(##)은 …정해진 섹션 골격은 없다"
- 규칙 5: "리드 문단으로 시작 (소제목 없이 본문부터 시작)"

→ 모델이 소제목 거의 없는 산문을 생산.

경쟁사 ilsangkit는 반대로 모든 글이 `## 핵심 요약`(굵은 키워드 불릿 TL;DR) → `## 배경` /
`## 주요 내용` / `## 영향` 같은 H2 섹션 → `## 참고 자료` 구조이며, Tailwind `prose`로 렌더한다.

**목표:** 브리핑·가이드 글을 ilsangkit식 「핵심 요약 + 섹션 소제목 + 출처/관련글」 구조로 통일한다.
신규 글은 생성 단계부터, 기존 글은 재구조화로 맞춘다.

## 적용 범위

- **board(Post) + guide(Guide) 둘 다.** 두 모델은 렌더러(`board-prose` + ReactMarkdown)와
  생성 프롬프트 구조가 동일해 함께 개선해도 추가 비용이 거의 없다.
- DESIGN.md 톤·접근성(WCAG 2.1 AA) 준수: 색은 정보 전달용, 그림자는 `--shadow-soft` 하나,
  한글 본문 ≥14px.

## 현황 (실측)

- 저장: `Post.body` / `Guide.body` 모두 `String @db.Text`, **마크다운**.
- 렌더: `app/(public)/board/[id]/page.tsx`·`app/(public)/guide/[slug]/page.tsx`에서
  `<ReactMarkdown remarkPlugins={[remarkGfm]}>` + `.board-prose` 클래스.
- CSS: `app/globals.css`의 `.board-prose`가 h2/h3/p/ul/ol/table/th/td/a/strong을 이미 스타일.
  단 H2가 1.125rem으로 작고 구분선·콜아웃이 없다.
- 가드레일: `lib/board/guardrails.ts` — 금지표현(전망·추천 등) + 분량 800–2200자(공백 제외).
  **불릿/섹션 금지 규칙은 없음** → 구조화와 충돌하지 않는다.
- 기존 컴포넌트 재사용 가능: `PostSource`(출처 블록), `BoardBriefingSection`(관련 글).

## 핵심 설계 결정

### 1. 콘텐츠 구조 — 생성 프롬프트 (신규 글)

`lib/board/generate.ts`·`lib/guide/generate.ts`의 SYSTEM_PROMPT를 교체한다.

- **억제 규칙 제거**: 현재 규칙 5–8(소제목 없이 시작 / 토막내지 말고 산문 / 섹션 골격 없음)을 제거.
- **골격 명시**:
  - 맨 위 `## 핵심 요약` — 굵은 키워드(`**...**`) 포함 3–4개 불릿 TL;DR.
  - 이어서 H2 본문 섹션 2–4개. 흐름은 자유(예: 배경 → 주요 내용 → 영향 → 마무리),
    라벨을 강제하지 않되 각 섹션에 `## 소제목`을 붙인다.
  - 마지막에 `## 참고 자료` 한 줄(출처·기준일).
- **유지**: 사실 원칙(자료에 있는 사실만), 금지표현, 분량 800–2200자, 분류(type/category).
- 가이드는 상록(evergreen) 가드레일·금지문구를 그대로 유지하되 동일한 핵심요약+섹션 골격 적용.

### 2. 시각 개선 — 렌더링 (모든 글, 즉시 반영)

- **`.board-prose` CSS 강화** (`app/globals.css`):
  - H2를 ≈1.5rem(text-2xl급)으로 키우고 하단 옅은 구분선(`border-bottom: 1px var(--color-line)`)
    + 상단 여백 확대.
  - H3·리스트 간격·강조(strong) 미세 조정. 표/링크는 현행 유지.
  - DESIGN.md 토큰만 사용. 새 그림자·강한 색 추가 금지.
- **핵심 요약 콜아웃**:
  - 순수 함수 `lib/board/summary-split.ts`가 본문 맨 앞의 `## 핵심 요약` 섹션을 분리해
    `{ summary: string | null, rest: string }`를 반환.
  - 상세 페이지가 `summary`가 있으면 콜아웃 컴포넌트(`<aside>`, 부드러운 배경·옅은 보더,
    추가 그림자 없음)로 렌더하고, `rest`를 일반 `.board-prose`로 렌더.
  - **`## 핵심 요약`이 없으면(미재구조화 기존 글) 콜아웃 생략 — 본문 전체를 일반 렌더(graceful).**
- 기존 `PostSource`·`BoardBriefingSection` 재사용. 가이드 상세에도 콜아웃 동일 적용.

### 3. 기존 글 재구조화 (1회성, 어드민 감독)

- 신규 스크립트 `scripts/board/restructure.ts`(+ `scripts/guide/restructure.ts`):
  - 게시된(PUBLISHED) 글마다 LLM에 **"사실·수치·날짜를 그대로 보존하고 아무것도 추가하지 말 것,
    핵심요약 + H2 섹션 구조로만 재배열"** 프롬프트를 보낸다.
  - 결과를 기존 `runGuardrails`로 검증(분량 ≤2200자 유지 포함).
  - `status=DRAFT`, `reviewedAt=null`로 되돌려 **기존 어드민 검수 큐로 복귀**.
  - 어드민이 기존 에디터(`app/admin/posts/[id]/post-editor.tsx`)에서 확인 후 재게시.
- **소량 배치**(예: 한 번에 N개)로 처리해 동시에 너무 많은 글이 비공개 전환되는 것을 방지.
- `--dry-run`으로 변경 diff를 먼저 출력해 검토 후 실제 적용.
- 사용자 확정: 라이브 글이 잠깐 DRAFT로 비공개되는 방식 그대로 진행("그냥 두고 진행").

## 구성 요소 / 파일

- 수정: `lib/board/generate.ts`, `lib/guide/generate.ts` (프롬프트)
- 수정: `app/globals.css` (`.board-prose`)
- 수정: `app/(public)/board/[id]/page.tsx`, `app/(public)/guide/[slug]/page.tsx` (콜아웃 렌더)
- 신규: `lib/board/summary-split.ts` (핵심요약 분리, 순수 함수 + 테스트)
- 신규: `app/(public)/_components/article-summary.tsx` (콜아웃 `<aside>`)
- 신규: `scripts/board/restructure.ts`, `scripts/guide/restructure.ts` (1회성 재구조화)

## 테스트

- 단위: `summary-split` — `## 핵심 요약` 유무, 여러 H2 존재, 첫 섹션이 핵심요약이 아닌 경우.
- 가드레일: 재구조화 샘플 본문이 `runGuardrails` 통과(금지표현·분량).
- 렌더: 상세 페이지가 핵심요약 있으면 콜아웃, 없으면 일반 렌더.
- 수동: 실제 글 몇 개로 prod 빌드 시각 확인.

## 범위 밖 (YAGNI)

- 본문 내 이미지/썸네일 자동 삽입(현행 유지).
- 스키마 변경(새 컬럼). 재구조화는 기존 `body`·`status` 필드만 사용.
- 콜아웃 외 추가 커스텀 블록(표 강조, 팁 박스 등).
- 다국어.
