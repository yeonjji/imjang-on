# 모바일 햄버거 메뉴 — 오른쪽 슬라이드 서랍

**날짜:** 2026-05-27  
**범위:** 모바일 전용 (`<768px`). 데스크톱 동작 무변경.

---

## 문제

`app/(public)/_components/nav.tsx`의 데스크톱 메뉴 링크가 `hidden ... md:flex`로 묶여 있어,
모바일(`<768px`)에서는 헤더에 로고와 검색창만 남고 **메뉴로 진입할 방법이 없다.**

- 홈 / 실거래가 / 생활인프라 / 청약 으로 이동 불가
- HTML 시안(`html/main.html:623`)도 `@media (max-width:900px)`에서 메뉴를 `display:none` 처리만 할 뿐, 모바일 대안이 없음

---

## 목표

- 모바일 헤더에 햄버거 버튼(☰) 추가 → 누르면 오른쪽에서 서랍(drawer) 슬라이드
- 서랍 구성: 맨 위 검색창, 그 아래 메뉴 링크 (홈·실거래가·생활인프라·청약)
- 데스크톱(≥768px)은 현재와 100% 동일하게 유지
- 접근성·스크롤 잠금·Esc 닫기 등 기본 인터랙션 포함

---

## 설계

### 1. 방식 결정 (브레인스토밍 결과)

- **열림 방식:** 오른쪽 슬라이드 서랍 + 어두운 오버레이 (가장 익숙, 항목 증가에 안정적)
- **검색창 위치:** 헤더에서 빼고 **서랍 맨 위**에 배치 → 헤더는 로고 + ☰ 만 남아 가장 깔끔
- **브레이크포인트:** 기존 `md`(768px) 기준 유지. 버거는 `md:hidden`, 데스크톱 링크는 기존대로 `hidden md:flex`

### 2. `Nav` (`app/(public)/_components/nav.tsx`)

상태 추가:
```typescript
const [menuOpen, setMenuOpen] = useState(false);
```

헤더 레이아웃 변경:
- 기존 데스크톱 검색창(`<div className="ml-auto w-48 lg:w-64"><SearchInput /></div>`)은
  `hidden md:block`으로 데스크톱에서만 노출
- 헤더 오른쪽 끝에 햄버거 버튼 추가 (`md:hidden`, `aria-label="메뉴 열기"`, `aria-expanded={menuOpen}`)
- 서랍은 별도 컴포넌트 `MobileDrawer`로 분리 (nav.tsx 비대화 방지)

### 3. `MobileDrawer` (신규: `app/(public)/_components/mobile-drawer.tsx`)

Props:
```typescript
interface Props {
  open: boolean;
  onClose: () => void;
  onSoonClick: () => void; // 청약(Soon) 버튼 → Nav의 SoonModal 오픈
}
```

구성:
- **오버레이:** `fixed inset-0 z-30 bg-black/45`, 클릭 시 `onClose`. `open`일 때만 렌더/표시
- **패널:** `fixed top-0 right-0 z-40 h-full w-[78%] max-w-[320px] bg-white`,
  `transform transition-transform`로 `translate-x-0`(열림) / `translate-x-full`(닫힘) 토글
- **상단 행:** 닫기 버튼(X, `aria-label="메뉴 닫기"`)
- **검색창:** 기존 `<SearchInput />` 재사용 (맨 위)
- **링크 목록:**
  - 홈 → `/`
  - 실거래가 → `/list`
  - 생활인프라 → `/life`
  - 청약 → `<button>` + `<Badge tone="gray">Soon</Badge>`, 누르면 기존 `SoonModal` 트리거
- 각 `<Link>`의 `onClick`에서 `onClose()` 호출 → 이동 시 자동 닫힘

청약 Soon 동작은 현재 `Nav`의 `soonOpen` 상태 + `SoonModal`을 그대로 사용한다.
`SoonModal` 제어는 `Nav`에 유지하고, 드로어의 청약 버튼은 전달받은 `onSoonClick`을 호출한다.
(`Nav`에서 `onSoonClick={() => { setSoonOpen('청약'); setMenuOpen(false); }}`로 연결)

### 4. 인터랙션 / 접근성

- **닫기 트리거:** 오버레이 클릭 · X 버튼 · 링크 클릭 · `Esc` 키
- **스크롤 잠금:** `open`일 때 `document.body.style.overflow = 'hidden'`, 닫힐 때 복원 (useEffect cleanup)
- **Esc:** `open`일 때 `keydown` 리스너 등록 → `Escape`면 `onClose`
- **포커스:** 열릴 때 패널 첫 포커스 요소(닫기 버튼)로 포커스 이동 (기본 수준)
- **트랜지션:** `translateX` 슬라이드 + 오버레이 `opacity` 페이드

---

## 데이터 흐름

```
☰ 클릭        → setMenuOpen(true)  → 서랍 슬라이드 인 + 스크롤 잠금
오버레이/X    → setMenuOpen(false) → 서랍 슬라이드 아웃 + 스크롤 복원
링크 클릭     → onClose() 후 라우팅 → 새 페이지에서 서랍 닫힌 상태
청약 클릭     → SoonModal 오픈 (서랍은 닫음)
Esc          → setMenuOpen(false)
뷰포트 ≥768px → 버거/서랍 비표시 (md:hidden), 데스크톱 링크 노출
```

---

## 엣지 케이스

| 상황 | 동작 |
|------|------|
| 서랍 열린 채 화면 회전/리사이즈로 ≥768px | `md:hidden`으로 서랍·오버레이 비표시, 데스크톱 메뉴 노출 |
| 서랍에서 검색 실행 | 기존 `SearchInput` 동작 그대로(라우팅) → 페이지 이동 시 닫힘 |
| 청약(Soon) 클릭 | 라우팅 없음, `SoonModal`만 오픈 |
| 빠른 연속 토글 | `menuOpen` 단일 상태로 idempotent |

---

## 테스트

Playwright e2e 1개 추가 (모바일 뷰포트, 예: 390×844):
1. 모바일에서 햄버거 버튼이 보인다
2. 탭하면 서랍이 열리고 메뉴 링크가 보인다
3. "실거래가" 탭 → `/list`로 이동 + 서랍 닫힘
4. (선택) 오버레이 탭으로 닫힘 확인

---

## 변경 파일

1. `app/(public)/_components/nav.tsx` — 햄버거 버튼, `menuOpen` 상태, 검색창 `hidden md:block`
2. `app/(public)/_components/mobile-drawer.tsx` — 신규 서랍 컴포넌트
3. `tests/` — 모바일 메뉴 e2e 1개

## 비변경 파일

- `app/(public)/layout.tsx` — 변경 없음
- 데스크톱 내비 링크/검색 동작 — 변경 없음
- `components/ui/*` — 기존 `Badge`, `SoonModal`, `SearchInput` 재사용 (수정 없음)
