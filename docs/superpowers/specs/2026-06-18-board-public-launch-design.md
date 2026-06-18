# 게시판(소식) 사용자 공개 — 설계

날짜: 2026-06-18
브랜치: `feat/board-public-launch`

## 배경 / 문제

자동 게시판(`/board`)은 목록·상세·OG·사이트맵·어드민 검수까지 전부 구현·운영되고 있으나,
`NEXT_PUBLIC_BOARD_ENABLED` 토글(기본 off)로 **일반 사용자에게는 비공개** 상태다.
이는 "콘텐츠가 충분히 쌓일 때까지 비노출"이라는 기존 결정에 따른 것이었다.

현재 운영 DB에 **PUBLISHED 12건**이 5개 분야 전부에 분포(청약 4·부동산 4·금융 2·대출 1·경제 1)해
공개 가능한 수준에 도달했다. 이제 게시판을 사용자에게 공개한다.

## 목표

게시판을 일반 사용자에게 공개하되, 진입은 **상단 메뉴 링크 하나**로 한다. 라벨은 **"오늘의 소식"**.

1. (운영) Vercel Production에 `NEXT_PUBLIC_BOARD_ENABLED=true` 설정 후 재배포 → 공개 활성화
2. (코드) 메뉴 진입 라벨을 `소식` → `오늘의 소식`으로 변경 (데스크톱 + 모바일)

페이지 자체(H1 **"오늘의 이슈"**)와 메타 타이틀·eyebrow·상세 마스트헤드·OG·브레드크럼 문구는
**변경하지 않는다**. 메뉴 라벨(진입 문구)과 페이지 H1(섹션 정체성)은 달라도 자연스럽다.

## 현재 구조

- 공개 여부는 `lib/board/visibility.ts`의 `isBoardPublic()` = `NEXT_PUBLIC_BOARD_ENABLED === 'true'`로 게이트된다.
- `isBoardPublic()`이 true면 다음이 **전부 자동**으로 켜진다(추가 작업 불필요):
  - 데스크톱 나브 링크 — `nav.tsx:36`
  - 모바일 드로어 링크 — `mobile-drawer.tsx:22`
  - `/board`·`/board/[slug]` 200 응답 — `canViewBoard()` 게이트(`page.tsx`)
  - 사이트맵 post 소스 — `lib/sitemap/{sources,static-entries}.ts`
  - `robots.ts`의 `/board/` 크롤 허용
- 메뉴 라벨은 데스크톱·모바일이 **각각 하드코딩**된 별도 소스다.
  - 데스크톱: `nav.tsx:36` — `실거래가 · 청약 · 금융정보 · {소식} · 생활편의▾`
  - 모바일: `mobile-drawer.tsx:22` — `links` 배열(홈·실거래가·청약·금융정보·{소식})

## 변경 사항

### 1. `nav.tsx` (데스크톱) — 라벨 변경

```tsx
{isBoardPublic() && <Link href="/board">오늘의 소식</Link>}
```
(메뉴 위치는 금융정보 다음·생활편의 앞 그대로 유지)

### 2. `mobile-drawer.tsx` (모바일) — 라벨 변경

```js
...(isBoardPublic() ? [{ href: '/board', label: '오늘의 소식' }] : []),
```

### 3. (운영) Vercel Production 환경변수 + 재배포

- `NEXT_PUBLIC_BOARD_ENABLED=true` 설정
- `vercel --prod` 재배포 (메모리 기준 main push에 git auto-deploy가 안 붙어 CLI 수동 배포 필요)
- `NEXT_PUBLIC_` 변수는 빌드 시 인라인되므로 **env 설정 후 반드시 재빌드/재배포**해야 반영된다.

### 4. (점검, 코드 아님) 공개 전 콘텐츠 확인

- PUBLISHED 12건을 미리보기(`/board?preview=<BOARD_PREVIEW_TOKEN>`) 또는 배포 후 실제 화면으로 한 번 훑기 — 사실·형식

## 범위 밖 (YAGNI)

- **홈 대시보드 진입 동선**(소식 모듈/티저). 지금은 나브 링크 하나로만. 트래픽 보고 추후 추가 가능.
- **검수 카덴스/소유권 프로세스**(누가 언제 DRAFT를 게시할지). 운영 정책 이슈로 분리.
- 페이지 H1 "오늘의 이슈" / 메타 타이틀 "소식 — 오늘의 이슈" / eyebrow / 상세 마스트헤드 "임장온 소식" / OG / 브레드크럼 "소식" 문구 변경.
- 데스크톱·모바일 메뉴를 공용 config로 추출하는 리팩터링.

## 알려진 리스크 (블로커 아님)

"오늘의 소식" 라벨 + 게시판 페이지의 "매일 업데이트합니다" 메타 설명은 **매일 갱신** 기대를 준다.
크론은 하루 1건 DRAFT 생성 → 수동 게시 구조라, 검수가 며칠 밀리면 최상단 글이 오래된 것으로 보인다.
이번 스코프에서는 인지만 하고, 카덴스 정책은 범위 밖으로 둔다.

## 검증

- `pnpm lint` + 타입체크 통과 (라벨 변경은 테스트 무영향: `소식` 문자열을 단언하는 테스트 없음, 테스트/CI 환경은 토글 off라 링크 미렌더)
- 배포 후 데스크톱: `금융정보`와 `생활편의` 사이에 **"오늘의 소식"** 노출 → 클릭 시 `/board` 이동
- 배포 후 모바일 햄버거: `금융정보` 아래·`생활편의` 위에 **"오늘의 소식"** 노출 → 클릭 시 `/board` 이동 후 drawer 닫힘
- `/board`·`/board/[slug]` 200 응답, PUBLISHED 12건 렌더
- 사이트맵에 `/board` 포함, `robots.txt`가 `/board/` 크롤 허용

---

## 변경 (2026-06-18): 토글 제거 — 상시 공개

위 설계는 "env 스위치를 켜서 공개"였으나, 사용자 요청으로 **`NEXT_PUBLIC_BOARD_ENABLED` 토글 자체를 제거하고 게시판을 상시 공개**로 전환한다. env 설정·재배포 트릭 없이, 배포만 하면 공개된다.

- `lib/board/visibility.ts`: `isBoardPublic()`을 `true` 상수로. (게시판 공개 여부의 단일 제어점은 유지 — 7개 사용처가 그대로 이 함수를 본다.)
- 미리보기(`isBoardPreview`/`canViewBoard`/`?preview`)는 상시 공개라 무의미해지지만 무해해 그대로 둔다(별도 정리 가능).
- `.env.example`에서 `NEXT_PUBLIC_BOARD_ENABLED` 줄 제거, 토글을 단언하던 테스트(`board-visibility`·`sitemap`·`sitemap-post-source`)를 상시 공개 기준으로 수정.
- **운영 단계 변경:** Vercel env 설정 단계 불필요 → PR 머지 후 재배포만 하면 공개.
- 검증: `pnpm lint`/`typecheck` ✔, unit 595/595 ✔, **env 미설정 로컬에서 나브 "오늘의 소식"·`/board` 200 확인**.
