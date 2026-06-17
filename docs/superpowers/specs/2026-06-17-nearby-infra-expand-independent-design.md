# 주변 생활 인프라 — 더보기 시 클릭한 카드만 확장

- 날짜: 2026-06-17
- 대상: 공용 `NearbyInfra` 컴포넌트(`components/ui/nearby-infra.tsx`) — 전 상세 페이지
- 관련: 직전 작업 `2026-06-17-nearby-infra-item-links-design.md`(같은 컴포넌트)

## 배경 / 문제

각 인프라 카테고리 카드(`InfraBlock`)는 화면 cap 5개까지 보여주고 "+N곳 더보기"로 펼친다.
현재 그리드 래퍼가 `[grid-auto-rows:1fr]`라 **모든 행 트랙을 가장 큰 카드 높이로 균등화**한다.
결과적으로 한 카드에서 더보기를 누르면 그 카드가 제일 커지고 **나머지 카드들이 전부 같은 높이로 부풀어** 빈 공간이 생긴다(모바일 1열·데스크탑 2열 모두).

원하는 동작:
- **모바일(1열)**: 더보기를 누른 카드만 펼쳐지고, 나머지는 자기 크기 그대로 고정.
- **데스크탑(2열)**: 평소에는 카드들이 같은 높이(균등 그리드 룩) 유지, 더보기를 누르면 그 카드만 커지고 옆 카드는 그대로.

## 핵심 트레이드오프

- "클릭한 카드만 커지고 나머지 고정" ⇒ 카드가 **자기 내용 높이**여야 하고, 같은 행의 옆 카드가 따라 늘어나면 안 됨 ⇒ 그리드 `align-items: start`.
- "모든 카드 같은 높이"(웹) ⇒ 균등화가 필요. 단, `grid-auto-rows:1fr`처럼 강제 균등화는 확장 시 부풀음을 유발하므로 사용 불가.
- 해법: **`items-start`(확장 독립성) + 데스크탑 전용 `min-height`(평소 균등)**. min-height는 평소(collapsed) 카드들을 동일 높이로 맞추되, 확장된 카드는 그 높이를 초과해 자라고 옆 카드는 영향받지 않는다.

## 변경 사항 — `components/ui/nearby-infra.tsx` (2곳, CSS 클래스만)

### A. 그리드 래퍼 (현재 45행)

```tsx
// before
<div className="grid grid-cols-1 gap-3 [grid-auto-rows:1fr] md:grid-cols-2">
// after
<div className="grid grid-cols-1 gap-3 items-start md:grid-cols-2">
```

- `[grid-auto-rows:1fr]` 제거 → 행이 더 이상 강제 균등화되지 않음.
- `items-start` 추가 → 카드가 내용 높이로 유지되고 같은 행의 옆 카드가 stretch로 따라 늘지 않음(상단 정렬, 빈 공간은 그리드 셀 아래로).

### B. 카드 컨테이너 (현재 62행, `InfraBlock`의 최상위 `div`)

```tsx
// flex flex-col … p-3.5 className 끝에 md:min-h-[344px] 추가
<div className="flex flex-col rounded-2xl border border-[var(--color-line)] bg-[var(--color-soft)] p-3.5 md:min-h-[344px]">
```

- `md:min-h-[…]` → **데스크탑에서만** 평소 카드가 같은 최소 높이를 가져 균등해 보임.
- 모바일에는 min-height 미적용 → 카드가 내용 높이라 항목이 적은 카드에 큰 빈 공간이 생기지 않음("나머지 고정" 요구 부합).
- 픽셀값 ≈ 344px은 "5개 항목(이름+보조줄) + 헤더 + 푸터" collapsed 카드 기준의 시작값. **모든 collapsed 카드가 동일 높이가 되도록(= 가장 큰 collapsed 카드 ≤ min-h)** 스크린샷으로 미세조정한다. 너무 작으면 5항목 카드가 평소에 더 커져 균등이 깨짐.

### 변경하지 않는 것

- `expanded` 로컬 state, `DISPLAY_CAP`, 더보기 버튼, `mt-auto` 푸터 정렬, 항목 Link/호버/화살표, 카테고리 배지줄, `SourceCaption` — 전부 그대로.
- JS·데이터·prop 변경 없음.

## 동작 결과

| | 평소(rest) | 더보기 클릭 |
|---|---|---|
| 모바일(1열) | 각 카드 내용 높이 | 클릭한 카드만 확장, 나머지 고정 |
| 데스크탑(2열) | 모든 카드 동일 높이(min-h) | 클릭한 카드만 확장, 옆 카드 그대로(상단 정렬) |

## 검증

1. `pnpm typecheck` + `pnpm lint` 통과(클래스 변경이라 타입 영향 없음).
2. dev 서버 스크린샷(실데이터, 인프라 카테고리 6개 이상인 상세 페이지):
   - 데스크탑: 평소 2열 카드가 모두 같은 높이. 한 카드 더보기 → 그 카드만 길어지고 같은 행 옆 카드는 그대로(상단 정렬, 아래 빈 공간).
   - 모바일(≤375px): 평소 카드가 내용 높이(짧은 카드에 빈 공간 없음). 한 카드 더보기 → 그 카드만 확장, 위아래 카드 고정.
3. 회귀: 기존 e2e(`tests/e2e/officetel-villa-infra.spec.ts`, `tests/e2e/apt-detail.spec.ts`)는 텍스트·링크 단언 위주 → 영향 없음 확인.

## 비목표 (out of scope)

- 더보기 동작 자체(인라인 확장 → 오버레이/페이지 이동 등)의 변경 없음.
- 카드 내부 레이아웃·항목 표시·카테고리 구성 변경 없음.
- 데스크탑에서 확장된 카드가 옆 카드보다 길어져 생기는 그리드 셀 하단 여백은 의도된 결과(허용).
