# 모바일 필터 UX 개선 — 보류(pending) 방식 + 조회 버튼

**날짜:** 2026-05-21  
**범위:** 모바일 전용 (데스크톱 동작 무변경)

---

## 문제

`ListFilterPanel`의 `updateParams()`가 칩/셀렉트 변경마다 즉시 `router.push()`를 호출한다.
모바일 바텀시트 안에서 이 동작은 UX가 어색하다:
- 칩 클릭마다 페이지 재요청 발생
- "조회" 버튼 없음 → 사용자가 필터 선택 후 직접 스와이프다운해야 닫힘

---

## 목표

- 모바일 바텀시트에서 필터를 선택하면 로컬 상태에만 반영
- "조회" 버튼 클릭 시 한 번에 URL 반영 + 시트 닫힘
- "필터 초기화" 버튼으로 선택 중인 pending 필터만 리셋 (URL 변경 없음)
- 시트 dismiss(스와이프다운/배경 탭) 시 URL 변경 없음

---

## 설계

### 1. `ListFilterPanel` — prop 2개 추가 (선택)

```typescript
interface Props {
  sidoList: SidoItem[];
  params?: URLSearchParams;       // 읽기 소스. 없으면 searchParams 사용 (데스크톱)
  onParamsChange?: (next: URLSearchParams) => void; // router.push 대체. 없으면 즉시 push (데스크톱)
}
```

- `params` 있으면 `searchParams` 대신 `params`에서 필터값 읽음
- `onParamsChange` 있으면 `router.push` 대신 콜백 호출
- `updateParams` 내부에서 분기:
  ```typescript
  if (onParamsChange) {
    onParamsChange(next);
  } else {
    router.push(`/list?${next.toString()}`);
  }
  ```
- "필터 초기화" 버튼: `onParamsChange` 없을 때(데스크톱)만 노출

### 2. `MobileFilterSheet` — pending 상태 + 하단 footer

```typescript
const [pendingParams, setPendingParams] = useState(
  () => new URLSearchParams(searchParams.toString())
);

// 시트 열릴 때 현재 URL 기준으로 초기화
useEffect(() => {
  if (open) {
    setPendingParams(new URLSearchParams(searchParams.toString()));
  }
}, [open]);
```

**"조회" 클릭:**
```typescript
router.push(`/list?${pendingParams.toString()}`);
setOpen(false);
```

**"필터 초기화" 클릭:**
```typescript
setPendingParams(new URLSearchParams()); // pending 상태만 리셋, URL 그대로
```

**하단 footer UI (시트 내 sticky):**
```
[필터 초기화]    [조회]
 ghost button   primary button (flex-1)
```

### 3. `BottomSheet` — 높이 + 레이아웃

- `Drawer.Content`에 `max-h-[85vh] flex flex-col` 추가
- 필터 목록 영역: `overflow-y-auto flex-1`
- footer: 하단 고정

---

## 데이터 흐름

```
시트 열림  → pendingParams = URLSearchParams(현재 URL)
칩 클릭    → onParamsChange(next) → setPendingParams(next)  [URL 변경 없음]
초기화     → setPendingParams(new URLSearchParams())         [URL 변경 없음]
조회       → router.push(pendingParams) → setOpen(false)    [URL 변경, 시트 닫힘]
dismiss    → setOpen(false)                                  [URL 변경 없음]
```

---

## 엣지 케이스

| 상황 | 동작 |
|------|------|
| 시도 변경 시 시군구 연동 | `params.get('sido')` 의존 useEffect 정상 동작 |
| "초기화" 후 "조회" | 빈 URLSearchParams → `/list` (필터 없음) |
| 조회 없이 dismiss | URL 그대로, 목록 재요청 없음 |

---

## 변경 파일

1. `app/(public)/list/_components/list-filter-panel.tsx`
2. `app/(public)/list/_components/mobile-filter-sheet.tsx`
3. `components/ui/bottom-sheet.tsx`

## 비변경 파일

- `app/(public)/list/page.tsx` — 변경 없음
- 데스크톱 사이드바 동작 — 변경 없음
