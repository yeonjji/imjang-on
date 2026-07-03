# 허브 페이지 UI 다듬기 — 카드 높이 통일 + HubIntro 구분선 제거 (Design)

**작성일:** 2026-07-03
**배경:** `/apt`·`/officetel`·`/villa` 허브 화면 검토 중 두 가지 시각적 어색함이 지적됨 — (1) 목록 카드가 담긴 거래유형(매매·전세·월세) 수에 따라 높이가 제각각이라 그리드가 들쭉날쭉하고, (2) 페이지 요약(`HubIntro`)이 요약 문장 뒤에 가로 구분선을 긋고 그 아래 안내 문단을 붙여 흐름이 끊긴다. 시안(현재 vs 제안)을 시각적으로 비교해 각 이슈의 방향을 사용자가 확정했다.

## 0. 목표 & 성공기준

- **목표:** 두 컴포넌트의 표현만 다듬어(로직·데이터 무변경) 허브 화면의 시각적 정돈감을 높인다.
- **성공기준:**
  - `/apt`·`/officetel`·`/villa` 목록에서 카드 높이가 **같은 줄에서 일치**하고, 거래유형이 적은 카드도 최소 높이로 통일된다(내용은 그대로, 여백만 채움).
  - `HubIntro`를 쓰는 모든 허브에서 요약과 안내 사이의 **가로 구분선이 사라지고** 여백으로만 분리된다.
  - `pnpm typecheck` · `pnpm lint` 통과. 시각 스모크로 세 허브 + 대표 카테고리 허브 1개 확인.

## 1. 이슈 1 — 목록 카드 높이 통일 (`PropertyCard`)

- **결정 (시안 A):** 카드가 그리드 셀 높이를 채우도록 하고(같은 줄 높이 일치) + 최소 높이 floor로 전역 통일. 내용은 정직하게 유지(없는 거래유형은 표시하지 않음), 짧은 카드는 **아래 여백**으로 높이를 맞춘다.
- **구현 (`app/(public)/_components/property-card.tsx`):**
  - `<Link href={href}>` → `<Link href={href} className="block h-full">` (그리드 아이템이 행 높이를 채움).
  - `<Card className="transition hover:shadow-lg">` → `<Card className="h-full min-h-[186px] transition hover:shadow-lg">`.
    - `h-full`: 같은 줄에 더 큰 카드가 있으면 그 높이까지 채워 **줄 내 높이 일치**.
    - `min-h-[186px]`: 매매·전세·월세 3줄이 모두 있는 표준 카드 높이(p-6 24px×2 + 헤더 ~42px + 딜 3줄 ~94px ≈ 184px)에 맞춘 floor → 거래유형이 적은 카드도 전역적으로 같은 높이. **매직넘버이므로 근거 주석을 단다.**
  - 카드 내부 구조(헤더·딜 블록)는 무변경 → 딜 정보는 헤더 바로 아래(상단 정렬), 남는 높이는 카드 하단 여백.
- **그리드는 무변경:** 세 페이지 모두 `grid gap-4 md:grid-cols-3` 그대로.
- **영향 범위:** `PropertyCard`는 `/apt`·`/officetel`·`/villa` 세 허브에서만 사용(finance는 별도 `DiscoveryPropertyCard`). → 세 페이지에만 적용, 타 화면 무영향.

## 2. 이슈 2 — HubIntro 구분선 제거 (전역)

- **결정 (시안 A, 전역 적용):** 요약 문단과 안내 문단 사이의 가로 구분선을 없애고 **여백(`gap-3`)으로만 분리**. DESIGN.md의 "위계는 여백으로" 원칙과 정합.
- **구현 (`app/(public)/_components/hub-intro.tsx`):** guide `<p>`의 className에서 `border-t border-[var(--color-line)] pt-3`를 제거.
  - 변경 전: `<p className="break-keep border-t border-[var(--color-line)] pt-3 text-sm leading-relaxed text-[var(--color-muted)]">`
  - 변경 후: `<p className="break-keep text-sm leading-relaxed text-[var(--color-muted)]">`
  - 래퍼 `<div className="mt-3 flex flex-col gap-3">`는 무변경 → 두 문단이 12px 여백으로 분리.
- **영향 범위 (전역, 사용자 승인):** `HubIntro`를 쓰는 **11개 허브 전부** — `/apt`·`/officetel`·`/villa`·`/school`·`/childcare`·`/medical/hospital`·`/medical/pharmacy`·`/subscription`·`/amenity/[category]`·`/urban/[category]`. 공유 컴포넌트 취지대로 모든 허브가 동일 톤으로 정돈됨.

## 3. 파일

- `app/(public)/_components/property-card.tsx` (이슈 1)
- `app/(public)/_components/hub-intro.tsx` (이슈 2)

두 파일 모두 표현(className)만 변경. 데이터·쿼리·JSON-LD·SEO 무변경.

## 4. 테스트 & 검증

- **회귀:** `pnpm typecheck` + `pnpm lint`(미사용 변수·no-unused-vars 게이트).
- **시각 스모크(수동/프리뷰):** `/apt` 목록 카드가 줄 내 높이 일치 + 거래유형 적은 카드도 통일, `HubIntro`에 구분선 없음. 카테고리 허브(예 `/school`)에서도 구분선 제거 확인(전역 적용 검증).
- 순수 프레젠테이션 변경이라 단위 테스트는 추가하지 않음.

## 5. 범위 밖 (YAGNI)

- 카드 내부 정보 구성·색·배지·문구 변경, 딜 정보 하단 앵커(정렬 방식) 변경.
- `HubIntro`의 요약/안내 문구 자체(prose·guides) 변경.
- `apt` 페이지에만 있는 부가 태그라인(`공공데이터 기반 · 매일 갱신 …`)의 3페이지 통일 — 이번 범위 아님(원하면 별도).
- 시안 B/C(3슬롯 고정·틴트 박스·한 문단 통합)는 미채택.
