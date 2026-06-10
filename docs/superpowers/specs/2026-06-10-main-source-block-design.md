# 상세 페이지 메인 데이터 출처 블록 — 설계

날짜: 2026-06-10
상태: 승인 대기

## 1. 배경 / 문제

데이터 출처 표기 시스템은 이미 존재한다.

- `lib/data-sources.ts` — 출처 레지스트리(SSOT). `provider`, `dataset`, `url`, `category`.
- `components/ui/source-caption.tsx` — 섹션 하단의 작은 회색 인라인 캡션
  (`출처: 국토교통부 · 자세히 보기`). 거의 모든 페이지에 적용됨.
- `/data-source` — 전체 출처 중앙 페이지.

현행 인라인 캡션은 **제공기관명만** 보여준다. 어떤 데이터셋에서 온 값인지,
원본은 어디인지는 드러나지 않는다. 각 상세 페이지에서 그 페이지가 다루는
**핵심(메인) 데이터셋의 출처**를 좀 더 또렷하게 안내하고 싶다.

DESIGN.md North Star "공공기록의 열람실" / "조용한 정보 안내자" 톤을 유지한다.

## 2. 목표 / 비목표

**목표**
- 각 상세 페이지 본문 맨 아래에, 그 페이지의 **메인 데이터 출처 1개**를
  정돈된 한 블록으로 표시한다 (제공기관 · 데이터셋명 · 원본 링크 · 전체 출처 링크).
- 데이터는 기존 레지스트리(SSOT)에서만 끌어온다. 새 컴포넌트 하나로 통일.
- 모든 `[id]` 상세 페이지에 적용.

**비목표 (YAGNI)**
- 갱신 주기 / 최신 갱신일 표시 — **하지 않는다** (레지스트리에 필드 없음, 추가 안 함).
- 한 페이지의 모든 보조 출처를 나열하는 패널 — 하지 않는다. 보조 섹션
  (주변 인프라 등)은 기존 `SourceCaption`을 그대로 둔다.
- 호버 팝오버, 출처 칩, 각주 마커 등 다른 브레인스토밍 후보 — 채택 안 함.

## 3. 디자인

시안: `html/source-attribution-ideas.html` (실제 토큰·레지스트리 데이터로 렌더).

블록 구조 (DESIGN.md 토큰 사용):
- 컨테이너: `--soft` 배경, `--line` 1px 보더, `--radius-field`(12px), `p-4` 내부 패딩.
  카드 중첩 금지 규칙에 맞춰 그림자 없음(상위 카드의 `--shadow-soft`만).
- 좌측: 카테고리 아이콘(작은 사각 `--sky-soft` 배경). 정보 보조용, 장식 최소.
- 우측 메타:
  - 라벨 행: `메인 데이터 출처` (Label, Muted) + `공공데이터` 배지(badge-blue).
  - 제공기관 `provider` — Title 굵기, Deep Archive Blue.
  - 데이터셋 `dataset` — Body, Ink.
  - 링크 행: `원본 {host} ↗`(있을 때, `url`) · `전체 출처 →`(`/data-source`).
- 한글 본문 14px 이상 규칙 준수. 색은 정보 전달용만.

## 4. 컴포넌트

`components/ui/main-source-block.tsx`

```
interface MainSourceBlockProps {
  id: DataSourceId;          // 페이지의 메인 출처
  className?: string;
}
```

- 레지스트리에서 `DATA_SOURCES[id]`를 읽어 렌더한다. 컴포넌트는 "어떤 출처가
  메인인지"를 모른다 — 호출하는 페이지가 결정해서 `id`를 넘긴다(dumb component).
- `url`이 없으면 원본 링크는 생략.
- 아이콘: `category`별 매핑(`lib/data-sources.ts`의 `DataSourceCategory` 기준)
  하나를 컴포넌트 내부에 둔다. 새 출처가 생겨도 카테고리만 있으면 아이콘이 따라온다.

## 5. 페이지별 메인 출처 매핑

대부분 라우트는 정적이고, 일부는 레코드/카테고리에 따라 동적이다.
호출 페이지가 올바른 `id`를 계산해 넘긴다.

| 라우트 | 메인 출처 id |
|---|---|
| `/apt/[id]` | `molit-rtms` |
| `/officetel/[id]` | `molit-rtms` |
| `/villa/[id]` | `molit-rtms` |
| `/subscription/[id]` | 레코드 출처에 따라 `applyhome` 또는 `lh-presub` (동적) |
| `/school/[…]/[id]` | `neis` |
| `/medical/hospital/[…]/[id]` | `hira` |
| `/medical/pharmacy/[…]/[id]` | `hira` |
| `/childcare/[…]/[id]` | `childcare` |
| `/urban/charger/[id]` | `kepco-ev` |
| `/urban/[category]/[id]` | 카테고리별 (`mois-park` / `mois-parking` / `mois-market` 등, 동적) |
| `/amenity/[category]/[id]` | 카테고리별 (`semas-store` 등, 동적) |

`/region/[code]`는 단일 단지가 아닌 집계 페이지이므로 1차 범위에서 제외(후속 검토).

## 6. 검증 기준

- 모든 위 상세 라우트에 블록이 1개씩 노출된다.
- 블록 텍스트는 전부 `DATA_SOURCES[id]`에서 온다(하드코딩 문자열 없음).
- `subscription`/`urban`/`amenity`는 레코드·카테고리에 맞는 출처가 표시된다.
- `pnpm tsc --noEmit` 통과. 기존 `SourceCaption`은 변경 없음.
- DESIGN.md 토큰·규칙 준수(그림자 1개, 14px floor, 정보색).

## 7. 미해결 / 결정 메모

- 아이콘 표현: 카테고리별 단순 마크로 통일(과한 장식·이모지 남발 금지). 구현 시 확정.
- `subscription` 레코드의 출처 판별 필드(청약홈 vs LH)는 구현 단계에서 데이터 모델 확인.
