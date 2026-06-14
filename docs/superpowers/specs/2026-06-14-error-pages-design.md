# 에러 페이지 디자인 (404 / 500) — 설계 문서

- 날짜: 2026-06-14
- 범위: 기존 에러 페이지를 디자인 시스템 톤으로 재정비하고, 루트 크래시 폴백을 추가
- 대상 프레임워크: Next.js App Router

## 1. 배경 / 문제

현재 에러 화면은 최소 마크업으로만 존재한다.

- `app/not-found.tsx` (404): 제목 + "홈으로" 링크. 디자인 토큰 일부만 사용, 카드/아이콘 없음.
- `app/(public)/error.tsx` (런타임 에러 ≈ 500): 제목 + "다시 시도" 버튼. 동일하게 미니멀.
- `app/global-error.tsx` (루트 레이아웃 크래시 폴백): **없음.**

브랜드 톤("공공기록의 열람실", 조용한 정보 안내자)과 디자인 시스템(`DESIGN.md`)에 맞춰 정비하고, 누락된 루트 폴백을 채운다.

## 2. 목표 / 비목표

**목표**
- 404·500 화면을 브랜드 톤의 중앙 카드 레이아웃으로 통일.
- 톤·마크업 중복 제거를 위한 공용 프레젠테이션 컴포넌트 도입.
- 루트 레이아웃 크래시 시의 `global-error.tsx` 폴백 추가.

**비목표**
- 문자 그대로의 HTTP 400(Bad Request) 전용 화면은 만들지 않는다(App Router 자동 라우트 없음, 이번 범위 밖).
- 에러 로깅/모니터링 연동(Sentry 등) 신규 도입은 하지 않는다. 기존 `console.error`만 유지.
- 인기 지역/추천 목록 등 데이터 의존 콘텐츠는 넣지 않는다(크래시 화면의 안정성 우선).

## 3. 디자인 시스템 근거 (`DESIGN.md`)

- 서체: Pretendard. 위계는 서체 교체가 아니라 크기·굵기(`font-black`/`bold`/`semibold`)로.
- 버튼: 알약형(`rounded-full`). Primary = Signal Blue(`--color-blue`) 배경 + 흰 텍스트, hover = Deep Archive Blue(`--color-blue-dark`).
- 카드: 22px 라운드(`--radius-card`), 그림자는 `--shadow-soft` 하나만. 아이콘/배지에는 그림자 금지(One-Shadow Rule).
- 한글 본문 14px 이상.
- 색은 정보 전달용. `--color-red`는 큰 면적에 쓰지 않는다(자극적 부동산 광고 안티레퍼런스 회피).
- 접근성: WCAG 2.1 AA.

## 4. 컴포넌트 설계

### 4.1 `components/error-state.tsx` (신규)

훅을 쓰지 않는 순수 함수형 컴포넌트(`'use client'` 불필요) → 서버/클라이언트 컴포넌트 양쪽에서 재사용 가능. 기존 `components/ui/card.tsx`의 `Card`를 사용.

```
props:
  code?:        string        // "404" | "500" — 조용한 라벨 배지
  title:        string
  description:  string
  digest?:      string        // 있으면 카드 하단에 작은 뮤트 텍스트로 표기
  actions:      React.ReactNode  // 버튼/링크 — 페이지마다 주입

레이아웃:
  <main class="grid min-h-[70vh] place-items-center px-6">
    <Card class="w-full max-w-md text-center px-8 py-10">
      <아이콘>  // --color-sky-soft 원형 배경 + 라인 SVG, 그림자 없음, 중앙
      <code 배지>  // text-xs font-bold text-[--color-muted], 있을 때만
      <h1>      // font-black text-[--color-blue-dark], text-2xl 내외
      <p>       // text-sm+ text-[--color-muted] leading-relaxed
      <actions> // 상단 여백, 알약형 버튼 영역 (flex, 모바일 세로 스택)
      <digest>  // text-xs text-[--color-muted]/낮은 대비, 있을 때만
    </Card>
  </main>
```

- 시맨틱: 제목은 `<h1>`. 카드는 의미가 아니라 표면이므로 추가 landmark 부여하지 않음.
- 접근성: 아이콘 SVG는 `aria-hidden`(장식). 액션은 실제 `<Link>`/`<button>`로 키보드 접근 가능.

### 4.2 라우트별 매핑

| 파일 | 종류 | 상태 | code | 제목 | 설명 | 액션 |
|---|---|---|---|---|---|---|
| `app/not-found.tsx` | 404 | 재작성(서버) | `404` | 페이지를 찾을 수 없어요 | 요청하신 페이지가 존재하지 않거나 주소가 변경되었어요. | 홈으로(Primary→`/`) · 지역 둘러보기(Secondary→`/region`) |
| `app/(public)/error.tsx` | 500 | 재작성(`'use client'`) | `500` | 문제가 발생했어요 | 일시적인 오류일 수 있어요. 잠시 후 다시 시도해주세요. | 다시 시도(Primary, `reset()`) · 홈으로(Secondary→`/`) |
| `app/global-error.tsx` | 루트 크래시 | 신규(`'use client'`) | `500` | 문제가 발생했어요 | 페이지를 불러오는 중 문제가 발생했어요. 잠시 후 다시 시도해주세요. | 다시 시도(`reset()`) · 홈으로 |

## 5. 기술 포인트 / 함정

1. **`global-error.tsx`는 루트 레이아웃을 대체한다.** `<html lang="ko"><body>`를 직접 렌더하고, CSS 변수(토큰)가 적용되도록 파일 상단에서 `import './globals.css'`를 해야 한다. 누락 시 디자인 토큰이 먹지 않는다.
2. `error.tsx`·`global-error.tsx`는 클라이언트 컴포넌트. `useEffect(() => console.error(error), [error])`로 기존 로깅 유지. `error.digest`가 있으면 `ErrorState`의 `digest` prop으로 전달.
3. `not-found.tsx`는 서버 컴포넌트 유지(데이터 의존 없음). 액션은 `next/link`의 `<Link>`로 구성.
4. 버튼은 기존 `components/ui/button.tsx`의 `Button` 사용. 링크형 액션은 `Link`를 `Button`처럼 스타일링하거나 `Button asChild` 미지원 시 `Link`에 직접 동일 클래스 적용(기존 패턴에 맞춤).
5. `global-error.tsx`에서는 `next/link`보다 의존을 줄이기 위해 홈 이동은 `<a href="/">`로 처리(루트 폴백 안정성).

## 6. 성공 기준

- `npx tsc --noEmit` 통과(타입 에러 0).
- `pnpm lint` 통과.
- 세 파일 모두 `ErrorState`를 통해 동일 톤 렌더. 디자인 토큰(`--color-card`, `--radius-card`, `--shadow-soft`, `--color-blue` 등) 사용.
- 수동 확인: 존재하지 않는 경로 → 404 카드 렌더 / 의도적 throw → 500 카드 렌더 + `reset` 동작 / `global-error`는 토큰 적용된 스타일로 렌더.
- 모바일 폭에서 카드·버튼이 세로 스택으로 무너지지 않고 정상 표시(반응형).

## 7. 변경 파일 요약

- 신규: `components/error-state.tsx`, `app/global-error.tsx`
- 재작성: `app/not-found.tsx`, `app/(public)/error.tsx`
