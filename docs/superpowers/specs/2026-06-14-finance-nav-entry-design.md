# 금융정보(대출) 메뉴 진입점 추가 — 설계

날짜: 2026-06-14
브랜치: `feat/finance-nav-entry`

## 배경 / 문제

대출 리스트(`/finance`)와 상세(`/finance/[seq]`) 페이지는 이미 개발되어 있으나,
앱 어디에서도 `/finance`로 연결되는 링크가 없다. 즉 진입점이 전무하다.

## 목표

`/finance`로 가는 진입점을 다음 두 곳에 추가한다. 라벨은 **"금융정보"**.

1. 데스크톱 상단 메뉴 — `청약` 다음, `생활편의` 앞
2. 모바일 햄버거 메뉴 — `생활편의` 항목 **앞**

페이지 자체(H1 "서민금융 대출상품")는 변경하지 않는다.

## 현재 구조

- 데스크톱 상단 메뉴와 모바일 햄버거 메뉴는 **서로 다른, 각각 하드코딩된** 소스다.
- 데스크톱: `app/(public)/_components/nav.tsx:31-35` — `실거래가` · `청약` · `<LifeDropdown>`(생활편의)
- 모바일: `app/(public)/_components/mobile-drawer.tsx:16-20` — `links` 배열(홈·실거래가·청약)이 생활편의 collapsible 섹션 위에 렌더됨.

## 변경 사항

### 1. `nav.tsx` (데스크톱)
`<LifeDropdown>` 바로 앞에 링크 한 줄 추가. 기존 `실거래가`/`청약` 링크와 동일 스타일.
```tsx
<Link href="/list">실거래가</Link>
<Link href="/subscription">청약</Link>
<Link href="/finance">금융정보</Link>   {/* 추가 */}
<LifeDropdown onSoon={(topic) => setSoonOpen(topic)} />
```

### 2. `mobile-drawer.tsx` (모바일)
`links` 배열에 항목 추가. 이 배열은 생활편의 섹션 위에 렌더되므로 요구사항(생활편의 앞) 자동 충족.
```js
const links = [
  { href: '/', label: '홈' },
  { href: '/list', label: '실거래가' },
  { href: '/subscription', label: '청약' },
  { href: '/finance', label: '금융정보' },   // 추가
];
```

## 범위 밖 (YAGNI)

- 금융정보 드롭다운화(현재 단일 링크 유지; 항목 늘면 추후 생활편의처럼 확장 가능)
- 홈 대시보드 카드 / 푸터 링크 추가
- 데스크톱·모바일 메뉴를 공용 config로 추출하는 리팩터링

## 검증

- `pnpm lint` + 타입체크 통과
- 데스크톱: `청약`과 `생활편의` 사이에 `금융정보` 노출 → 클릭 시 `/finance` 이동
- 모바일 햄버거: `청약` 아래·`생활편의` 위에 `금융정보` 노출 → 클릭 시 `/finance` 이동 후 drawer 닫힘
