# 하단 섹션 카드화 + 대출상품 카드 높이 정렬

작성일: 2026-07-31

## 배경

상세 페이지 하단 섹션들의 시각 언어가 둘로 갈려 있다.

- `근처 지하철역`, `한눈에` 등은 `Card` 컴포넌트(흰 배경 + `--shadow-soft` + `radius-card`)로 감싸져 하나의 섹션으로 읽힌다.
- `최신 부동산·청약·금융 소식`, `관련 가이드`는 바깥 컨테이너 없이 안쪽 아이템만 흰 카드다. 페이지 배경(`--color-bg` #f7fbff) 위에 카드가 흩뿌려진 모양이라 섹션 경계가 없다.

같은 페이지에서 두 패턴이 번갈아 나오면 정보 위계가 흐려진다. 후자를 전자에 맞춘다.

부수적으로, `/finance` 목록의 대출상품 카드가 같은 행에서 높이가 어긋난다.

## 범위

세 가지 변경. 서로 독립적이다.

- **A.** `최신 소식`·`관련 가이드` 섹션을 각각 `Card`로 감싼다
- **B.** `맞춤전세보증찾기` 상세의 FAQ를 페이지 맨 아래로 옮긴다
- **C.** `/finance` 대출상품 카드 높이를 행 단위로 정렬한다

**범위 밖:** `자주 묻는 질문`(FAQ) 섹션의 카드화. 같은 무테두리 패턴이지만 아코디언이라 성격이 달라 이번에 건드리지 않는다.

## A. 섹션 카드화

### 대상 파일

- `app/(public)/_components/board-briefing-section.tsx`
- `app/(public)/_components/related-guides.tsx` (`RelatedGuidesView`)

### 컨테이너

각 컴포넌트의 루트 `<section className={className}>`을 `<Card className={className}>`으로 교체한다. `Card`(`components/ui/card.tsx`)가 이미 `rounded-[var(--radius-card)] bg-[var(--color-card)] shadow-[var(--shadow-soft)] p-6`을 제공하므로 추가 스타일이 필요 없다.

두 섹션은 **각각 독립된 카드**다. 하나로 합치지 않는다. 섹션 간 간격은 호출부가 이미 정하고 있으므로(`flex flex-col gap-6` 또는 명시적 `mt-10`/`mt-12`/`mt-16`) `className` 패스스루만 유지하면 그대로 동작한다.

`Card`는 `<div>`를 렌더하므로 `<section>` 태그가 사라진다. 접근성 손실은 없다 — `section`은 `aria-label`/`aria-labelledby`로 이름이 붙어야 `region` 랜드마크로 노출되는데, 두 컴포넌트 모두 이름이 없어 현재도 랜드마크가 아니다. `<h2>` 제목이 남아 있어 헤딩 구조는 그대로다. `Card`에 `as` prop을 추가하지 않는다(YAGNI).

### 제목

카드 안으로 들어가므로 사이트의 카드 섹션 제목 규약에 맞춘다.

| | 지금 | 수정 후 |
|---|---|---|
| 제목 `<h2>` | `text-xl font-black tracking-tight md:text-[22px]` | `text-lg font-bold text-[var(--color-blue-dark)]` |

부제(`공공기관 보도자료·고시를 사실 위주로 정리`, `실제 절차·개념을 정리한 안내 글`)와 `전체 보기 →` 링크는 그대로 유지한다.

### 안쪽 아이템

흰 카드 안에 흰 카드가 겹치는 것을 피하기 위해 안쪽 아이템을 연한 톤으로 내린다.

| | 지금 | 수정 후 |
|---|---|---|
| 배경 | `bg-white` | `bg-[var(--color-soft)]` |
| 그림자 | `shadow-[var(--shadow-soft)]` | 제거 |
| 모서리 | `rounded-[20px]` | `rounded-[16px]` |
| 안쪽 여백 | `p-5` | `p-4` |
| hover | `hover:border-[var(--color-blue)]` | `hover:border-[var(--color-blue)] hover:bg-[var(--color-sky-soft)]` |
| 격자 간격 | `gap-4` | `gap-3` |

`border border-[var(--color-line)]`는 유지한다(연한 배경 위 경계 유지).

### 배지 대비 보정

`board-briefing-section.tsx`의 카테고리 배지(`대출`/`부동산`/`청약`)가 현재 `bg-[var(--color-soft)]`다. 카드 배경이 같은 색이 되면 배지가 사라진다. 배지를 `bg-white`로 뒤집는다. 글자색 `text-[var(--color-blue)]`는 유지 — 흰 배경 위에서 대비가 오히려 올라간다.

`related-guides.tsx`에는 배지가 없어 해당 없음.

### 영향 범위

두 컴포넌트가 공용이라 다음 페이지 전부에 적용된다.

- 실거래가: `apt/[id]`, `villa/[id]`, `officetel/[id]`
- 청약: `subscription/[id]`
- 서민금융: `finance/[seq]`
- 맞춤전세보증찾기: `jeonse-guarantee/[grntDvcd]`
- 생활편의: `amenity/[category]/[id]`, `urban/[category]/[id]`, `urban/charger/[id]`, `childcare/[sigunguCode]/[id]`, `school/[sigunguCode]/[id]`, `medical/hospital/[sigunguCode]/[id]`, `medical/pharmacy/[sigunguCode]/[id]`
- 추가: `guide/[slug]`(`RelatedGuidesView` 직접 사용), `board/[id]`(`BoardBriefingSection heading="다른 브리핑 글"`)

`guide/[slug]`와 `board/[id]`는 요청에 없었지만 공용 컴포넌트라 함께 바뀐다. 예외 처리 prop을 추가하는 것보다 일관되게 가는 편이 낫다.

## B. 맞춤전세보증찾기 FAQ 위치

### 대상 파일

`app/(public)/jeonse-guarantee/[grntDvcd]/page.tsx`

### 문제

`<Faq items={jeonseFaq} />`가 2단 그리드의 왼쪽 `<main>` 안(line 188)에 있다. 그 아래에 전폭으로 깔리는 `JeonseDiscoverySection` / `임장ON 브리핑` / `관련 가이드`보다 위에 뜬다.

### 변경

`<Faq>`를 `<main>`에서 제거하고, 하단 `<div className="lg:w-[calc(100%_-_352px)]">` 안 `RelatedGuides` 다음으로 옮긴다.

```
<div grid lg:[1fr 320px]>
  <main>  … 카드들 … <SourceCaption/> </main>
  <aside> … </aside>
</div>
<div className="lg:w-[calc(100%_-_352px)]">
  <JeonseDiscoverySection … />
  <BoardBriefingSection heading="임장ON 브리핑" className="mt-10" />
  <RelatedGuides pageKey="jeonse-guarantee" className="mt-10" />
  {jeonseFaq && <Faq items={jeonseFaq} />}   ← 이동
</div>
```

`SourceCaption`은 `<main>`에 남긴다(왼쪽 본문 내용의 출처이므로).

### 근거

다른 상세 페이지(`apt`, `subscription`, `school` 등)가 이미 `최신소식 → 관련가이드 → FAQ` 순서다. 전세보증만 예외였다.

`FAQPage` JSON-LD는 `Faq` 컴포넌트 내부에서 함께 렌더되므로 이동해도 따라간다. SEO 영향 없음.

`FaqList`가 자체적으로 `mt-12`를 갖고 있어 추가 마진 지정이 필요 없다.

## C. 대출상품 카드 높이 정렬

### 대상 파일

`app/(public)/finance/_components/loan-card.tsx`

### 원인

`loan-explorer.tsx:105`의 `grid grid-cols-1 gap-4 sm:grid-cols-2`에서 그리드 아이템(`<Link>`)은 기본 `align-items: stretch`로 행 높이만큼 늘어난다. 그런데 `<Link className="block">`이고 안의 `<article>`은 높이 지정이 없어 내용 높이에 멈춘다. 결과적으로 짧은 카드 아래에 빈 `Link` 영역이 남는다.

### 변경

1. `<Link>`: `className="block"` → `className="block h-full"`
2. `<article>`: `flex h-full flex-col` 추가
3. 용도 배지 `<div>`: `mt-auto pt-3` 추가 → 카드 높이가 달라도 배지가 항상 바닥 정렬
4. 조건부 마진 정리: 현재 `mb-1`/`mb-3`을 뒤 요소의 존재 여부로 계산하는 삼항 로직이 세 곳에 흩어져 있다. flex-col + 뒤 요소의 `mt-1`로 바꿔 조건부 계산을 제거한다.

결과 구조:

```tsx
<Link href={`/finance/${item.seq}`} className="block h-full">
  <article className="flex h-full flex-col rounded-[22px] border … px-6 py-5 …">
    <div className="mb-2 flex items-start justify-between gap-3">
      <h3>…</h3>
      {item.lnlmt != null && <span>한도 …</span>}
    </div>
    <p className="text-sm text-[var(--color-muted)]">기관 · 분류 · 금리</p>
    {hasSub && <p className="mt-1 text-xs …">대상 …</p>}
    {item.operPeriod && <p className="mt-1 text-xs …">운영기간 …</p>}
    {item.usageTags.length > 0 && (
      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">…</div>
    )}
  </article>
</Link>
```

### 빈 공간에 대한 판단

용도 배지가 없거나 정보 항목이 적은 상품은 카드 아래쪽이 비어 보인다. 이를 `—`나 `상시` 같은 대체 표기로 채우지 않는다. 없는 정보는 없는 대로 두는 것이 "모든 수치에 출처, 과장 금지" 원칙에 맞다.

## 검증

1. `pnpm lint` → 통과. C의 조건부 마진 로직을 제거해도 `hasSub`는 렌더 조건으로 계속 쓰이지만, `targets`/`regions` 같은 파생 변수가 미사용으로 남지 않는지 확인한다 (ESLint `no-unused-vars`가 error라 CI를 막는다)
2. `pnpm typecheck` → 통과
3. 로컬 dev에서 육안 확인:
   - `/apt/[id]` — `최신 소식`·`관련 가이드`가 `근처 지하철역`과 같은 카드 모양인가, 안쪽 타일이 배경에 묻히지 않는가
   - `/jeonse-guarantee/[grntDvcd]` — FAQ가 `관련 가이드` 아래에 오는가
   - `/finance` — 같은 행 카드 높이가 맞고 배지가 바닥 정렬되는가
   - 모바일 폭(375px)에서 1단 그리드로 무너질 때 여백이 과하지 않은가
4. 뉴스 카테고리 배지가 연한 배경 위에서 판독되는가 (흰 배지 / `--color-blue` 텍스트)
