# 게시판(소식) 사용자 공개 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자동 게시판(`/board`)을 일반 사용자에게 공개한다 — 상단 메뉴 진입 라벨을 "오늘의 소식"으로 바꾸고, 운영 노출 토글을 켠다.

**Architecture:** 공개 여부는 `lib/board/visibility.ts`의 `isBoardPublic()`(= `NEXT_PUBLIC_BOARD_ENABLED === 'true'`) 하나로 게이트된다. 토글이 켜지면 나브 링크·`/board` 200·사이트맵·robots가 전부 자동 활성화된다. 따라서 코드 변경은 메뉴 라벨 문자열 2곳뿐이고, 실제 "오픈"은 Vercel Production 환경변수 + 재배포라는 운영 작업이다.

**Tech Stack:** Next.js(App Router) · TypeScript · Tailwind · Vercel · pnpm

설계 문서: `docs/superpowers/specs/2026-06-18-board-public-launch-design.md`

---

## Task 1: 메뉴 진입 라벨 `소식` → `오늘의 소식` (데스크톱 + 모바일)

데스크톱 나브와 모바일 드로어는 라벨이 각각 하드코딩된 별도 소스다. 같은 논리적 변경(진입 라벨 rename)이므로 두 파일을 함께 수정하고 한 번에 커밋한다. 메뉴 위치(금융정보 다음·생활편의 앞)는 그대로 둔다.

**Files:**
- Modify: `app/(public)/_components/nav.tsx:36`
- Modify: `app/(public)/_components/mobile-drawer.tsx:22`

- [ ] **Step 1: 데스크톱 나브 라벨 변경 (`nav.tsx:36`)**

변경 전:
```tsx
{isBoardPublic() && <Link href="/board">소식</Link>}
```
변경 후:
```tsx
{isBoardPublic() && <Link href="/board">오늘의 소식</Link>}
```

- [ ] **Step 2: 모바일 드로어 라벨 변경 (`mobile-drawer.tsx:22`)**

변경 전:
```js
  ...(isBoardPublic() ? [{ href: '/board', label: '소식' }] : []),
```
변경 후:
```js
  ...(isBoardPublic() ? [{ href: '/board', label: '오늘의 소식' }] : []),
```

- [ ] **Step 3: lint + 타입체크**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: 통과(에러 0). 라벨 문자열만 바뀌었으므로 새 경고/에러가 없어야 한다.

> 참고: `pnpm lint`/타입체크 정확한 스크립트명은 `package.json`의 `scripts`로 확인 후 사용한다(`lint`, `typecheck` 등). 없으면 `pnpm exec next lint` + `pnpm exec tsc --noEmit`.

- [ ] **Step 4: 기존 테스트 스위트가 여전히 green인지 확인**

Run: `pnpm test`
Expected: 전부 PASS. 나브 라벨을 단언하는 테스트는 없고, 테스트 환경은 `NEXT_PUBLIC_BOARD_ENABLED` 미설정이라 board 링크 자체가 렌더되지 않으므로 이 변경으로 깨지는 테스트는 없어야 한다.

- [ ] **Step 5: 커밋**

```bash
git add app/(public)/_components/nav.tsx app/(public)/_components/mobile-drawer.tsx
git commit -m "feat(board): 메뉴 진입 라벨 '소식' → '오늘의 소식'

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 로컬 시각 확인 (선택, 라벨·동선 눈으로 검증)

라벨이 실제로 렌더되고 `/board`로 연결되는지 로컬에서 확인한다. board 링크는 토글이 켜져야 보이므로 임시로 켜서 띄운다. (`.env.local`은 운영 Supabase를 가리키므로 읽기만 일어나는 이 확인은 안전하다.)

**Files:** 없음(실행만)

- [ ] **Step 1: 토글 켠 채 dev 서버 기동**

Run: `NEXT_PUBLIC_BOARD_ENABLED=true pnpm dev`
Expected: 로컬 서버 기동(기본 `http://localhost:3000`).

- [ ] **Step 2: 데스크톱·모바일 메뉴 확인**

- 데스크톱 폭: 상단 메뉴에 `금융정보` 다음·`생활편의` 앞으로 **"오늘의 소식"** 노출 → 클릭 시 `/board` 이동
- 모바일 폭(개발자도구 반응형): 햄버거 → 드로어에 `금융정보` 아래·`생활편의` 위 **"오늘의 소식"** 노출 → 클릭 시 `/board` 이동 + 드로어 닫힘
- `/board` 목록에 PUBLISHED 글이 표 형태로 렌더되는지 확인

- [ ] **Step 3: dev 서버 종료**

토글을 끈 평소 상태로 되돌린다(서버 Ctrl-C). `.env.local`에 토글을 영구로 추가하지 않는다 — 공개는 운영 env에서만 켠다.

---

## Task 3: main 반영 + 운영 공개 (운영 작업 — 사용자 실행)

코드 변경(라벨)을 main에 머지하고, Vercel Production 환경변수로 게시판을 실제 공개한다. `vercel --prod`는 yeonjji 인증 계정에서 실행해야 하므로 이 태스크는 사용자가 직접 수행한다(또는 사용자 승인하에 진행).

**Files:** 없음(PR/머지 + 운영 env)

- [ ] **Step 1: 공개 전 콘텐츠 최종 점검**

미리보기로 PUBLISHED 12건을 한 번 훑는다: `/board?preview=<BOARD_PREVIEW_TOKEN>` (운영) 또는 Task 2의 로컬 화면. 사실·형식·분류가 공개해도 되는 상태인지 확인.

- [ ] **Step 2: PR 생성 → main 머지**

```bash
git push -u origin feat/board-public-launch
gh pr create --base main --head feat/board-public-launch \
  --title "feat(board): 게시판 사용자 공개 — 메뉴 라벨 '오늘의 소식'" \
  --body "설계: docs/superpowers/specs/2026-06-18-board-public-launch-design.md

- 메뉴 진입 라벨 '소식' → '오늘의 소식' (데스크톱+모바일)
- 운영 노출은 Vercel \`NEXT_PUBLIC_BOARD_ENABLED=true\` + 재배포로 별도 활성화

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
리뷰 통과 후 main 머지.

- [ ] **Step 3: Vercel Production 환경변수 설정**

Vercel 프로젝트 → Settings → Environment Variables(Production)에 추가:
```
NEXT_PUBLIC_BOARD_ENABLED = true
```
`NEXT_PUBLIC_` 변수는 빌드 시 인라인되므로 **설정만으로는 반영되지 않는다 — 반드시 재배포해야 한다.**

- [ ] **Step 4: 운영 재배포**

Run(yeonjji 인증): `vercel --prod`
Expected: 빌드 green. (메모리 기준 main push에 git auto-deploy가 안 붙으므로 CLI 수동 배포 필요. 빌드가 `/finance/[seq]` prerender로 운영 DB(5432)를 타므로 DB 정상 상태에서 배포.)

- [ ] **Step 5: 공개 검증 (운영)**

배포 후 운영 사이트에서 확인:
- 상단 메뉴(데스크톱) `금융정보`–`생활편의` 사이에 **"오늘의 소식"** 노출, 클릭 시 `/board` 이동
- 모바일 햄버거 드로어에 **"오늘의 소식"** 노출, 클릭 시 `/board` 이동
- `/board` → 200, PUBLISHED 12건 렌더 / `/board/<slug>` → 200
- `/sitemap.xml`에 `/board` 포함, `/robots.txt`가 `/board/` 크롤 허용(`Disallow` 아님)
- (회귀) `?preview=` 없이 익명 접근해도 정상(이제 공개이므로 404 아님)

---

## Self-Review

**1. Spec coverage:**
- 라벨 변경 `소식`→`오늘의 소식` (데스크톱+모바일) → Task 1 ✅
- H1·OG·브레드크럼 문구 유지 → 변경 대상에서 제외(건드리는 파일 2개뿐) ✅
- Vercel env `NEXT_PUBLIC_BOARD_ENABLED=true` + 재배포 → Task 3 Step 3–4 ✅
- 공개 전 12건 점검 → Task 3 Step 1 ✅
- 검증(나브·/board 200·사이트맵·robots) → Task 3 Step 5 ✅
- 범위 밖(홈 동선·카덴스) → 태스크 없음(의도적) ✅

**2. Placeholder scan:** `<BOARD_PREVIEW_TOKEN>`은 시크릿 값 placeholder(하드코딩 금지)로 의도적. lint/typecheck 스크립트명은 package.json 확인 안내를 명시. 그 외 TODO/TBD 없음. ✅

**3. Type consistency:** 코드 변경은 JSX 텍스트·객체 리터럴 `label` 문자열뿐 — 시그니처/타입 변경 없음. ✅
