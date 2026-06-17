# 주변 생활 인프라 — 웹 더보기를 모달로 (데스크탑 전용)

- 날짜: 2026-06-17
- 대상: 공용 `NearbyInfra` 컴포넌트(`components/ui/nearby-infra.tsx`) — 전 상세 페이지
- 관련: `2026-06-17-nearby-infra-expand-independent-design.md`(모바일 인라인 확장, PR #132), `2026-06-17-nearby-infra-item-links-design.md`(항목 href)

## 배경 / 목표

데스크탑(2열)에서 카드를 인라인으로 확장하면 같은 행 옆 카드가 짧은 채 빈 공간이 생겨 **그리드가 깨진다**.
그래서 **데스크탑에서는 "+N곳 더보기"를 누르면 그리드를 건드리지 않고 모달로 전체 목록을 띄운다**.
모바일은 **현재 동작(인라인 독립 확장, PR #132)을 그대로 유지**한다.

| | 평소 | 더보기 클릭 |
|---|---|---|
| 모바일(<768px) | 카드 내용 높이 | 인라인 확장(클릭 카드만) — **변경 없음** |
| 데스크탑(≥768px) | 2열 균등 | **모달**에 전체 목록, 각 항목 클릭 시 시설 상세로 이동 |

## 핵심 결정

- **기존 `Modal` 재사용**(`components/ui/modal.tsx`, `@radix-ui/react-dialog` 기반). 오버레이·포털·포커스 트랩·ESC·바깥클릭·닫기 버튼·`Dialog.Title` 접근성을 모두 제공 → 새 컴포넌트/의존성 불필요.
- **분기 기준**: 더보기 클릭 시 `window.matchMedia('(min-width: 768px)').matches`로 판단(Tailwind `md` 브레이크포인트와 일치). 데스크탑이면 모달 오픈, 모바일이면 기존 인라인 `setExpanded(true)`.
  - 버튼은 양쪽에서 동일하게 렌더되고 **클릭 시점(클라이언트)** 에만 동작이 갈라지므로 SSR/하이드레이션 불일치 없음.
- **모달 항목 = 인라인 항목과 동일**: 각 행은 같은 `<Link href={it.href}>`(이름·보조줄·거리칩·화살표·호버). 클릭 시 `/amenity/...`·`/medical/hospital/...` 등 시설 상세로 이동(이미 만든 `infraHref` href 재사용). 라우트 이동 시 모달은 언마운트됨.

## 변경 사항 — `components/ui/nearby-infra.tsx`

### A. 행 렌더 추출 (DRY) — `InfraRow`

현재 `InfraBlock`의 `<li>`(Link/ div 분기) 마크업을 `InfraRow({ item })` 컴포넌트로 추출해, 인라인 리스트와 모달 리스트가 **같은 행 컴포넌트**를 쓰게 한다. 마크업·클래스는 현재와 동일(이름·보조줄·거리칩·`›`·호버, href 없으면 비클릭 div).

### B. 모달 상태를 `NearbyInfra`로 끌어올림

```tsx
export function NearbyInfra({ categories }: { categories: InfraCategory[] }) {
  const [modalCat, setModalCat] = useState<InfraCategory | null>(null);
  // …헤더·배지줄·그리드…
  //   <InfraBlock … onOpenModal={setModalCat} />  (각 카드에 콜백 전달)
  // …
  // 한 개의 모달만 NearbyInfra 레벨에서 렌더:
  return (
    <>
      <Card id="poi"> … </Card>
      <Modal
        open={modalCat !== null}
        onOpenChange={(o) => { if (!o) setModalCat(null); }}
        title={modalCat ? `${modalCat.icon} ${modalCat.label} ${modalCat.items.length}${modalCat.capped ? '+' : ''}곳` : ''}
      >
        <ul className="max-h-[60vh] overflow-y-auto">
          {modalCat?.items.map((it) => <InfraRow key={it.id} item={it} />)}
        </ul>
      </Modal>
    </>
  );
}
```

- `Modal`은 `max-w-md` 중앙 다이얼로그. 긴 목록(12+)은 `<ul>`에 `max-h-[60vh] overflow-y-auto`로 스크롤 → 기존 `Modal` 컴포넌트는 수정하지 않음.
- `NearbyInfra` 반환을 `Card` 단일에서 `<>…</>`(Card + Modal)로 감쌈.

### C. `InfraBlock` — 더보기 분기

```tsx
function InfraBlock({ category, onOpenModal }:
  { category: InfraCategory; onOpenModal: (c: InfraCategory) => void }) {
  const [expanded, setExpanded] = useState(false);
  // …
  const handleMore = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
      onOpenModal(category);        // 데스크탑: 모달
    } else {
      setExpanded(true);            // 모바일: 인라인(기존)
    }
  };
  // 더보기 버튼 onClick={handleMore}
}
```

- 데스크탑에서는 `expanded`가 true가 되지 않으므로 데스크탑 카드는 인라인으로 자라지 않음 → `md:[grid-auto-rows:1fr]` 균등 룩 유지.
- 인라인 리스트는 `InfraRow`로 렌더(추출된 동일 컴포넌트).

### 변경하지 않는 것

- 그리드 클래스(`items-start md:[grid-auto-rows:1fr] md:items-stretch`), `DISPLAY_CAP`, 더보기 버튼이 보이는 조건(`hiddenCount > 0`), `mt-auto` 푸터, 배지줄, `SourceCaption`, `INFRA_SOURCE`.
- `Modal`/`BottomSheet` 컴포넌트 자체.
- 데이터 계층(`lib/amenity/*`)·prop 시그니처(`categories`)는 그대로. `InfraBlock`에만 내부 prop `onOpenModal` 추가(공개 API 불변).

## 엣지 케이스

- **모바일에서 인라인 확장 후 데스크탑으로 리사이즈**: 해당 카드는 펼친 채 유지(드문 경우, 허용). 별도 리셋 안 함(YAGNI).
- **href 없는 항목**(시군구 누락 병원/약국): 모달에서도 비클릭 div(`InfraRow`가 동일 처리).
- 모달은 `hiddenCount > 0`인 카테고리에서만 열림(더보기 버튼 노출 조건과 동일).

## 검증

1. `pnpm typecheck` + `pnpm lint` 통과.
2. dev 서버 Playwright(실데이터, 인프라 다수 카테고리):
   - **데스크탑(≥768px)**: 더보기 클릭 → 모달 오픈, 뒤 그리드 높이 불변(2열 균등 유지). 모달 항목이 `<a href="/...">`이고 클릭 시 시설 상세로 이동. ESC·바깥클릭·× 닫힘.
   - **모바일(<768px)**: 더보기 클릭 → 기존처럼 인라인 확장(모달 안 뜸), 나머지 카드 고정.
3. 회귀: 기존 e2e(`officetel-villa-infra`, `apt-detail`)는 텍스트·링크 단언 위주 → 영향 없음. 단위 테스트(amenity-infra)는 데이터 계층이라 무관.

## 비목표 (out of scope)

- 모바일 동작 변경 없음(인라인 유지). 바텀시트(`BottomSheet`) 미채택 — 추후 모바일을 시트로 통일하고 싶을 때 별도 결정.
- 팝오버 방식 미채택.
- 카드 내부 레이아웃·항목 표시·카테고리 구성·데이터 변경 없음.
