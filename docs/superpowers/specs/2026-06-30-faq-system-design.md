# FAQ 시스템 설계

- 작성일: 2026-06-30
- 상태: 승인 대기 → 구현 예정
- 관련: `docs/adsense/thin-content-remediation-design.md` (L3 FAQ), AdSense thin-content 개선

## 배경 / 목표

경쟁사 [ilsangkit.co.kr](https://ilsangkit.co.kr/)와 동일하게, 섹션별 "자주 묻는 질문(FAQ)"을
사이트 전반에 제공한다. 목적은 두 가지다.

1. **콘텐츠 보강** — 텍스트가 얕은 랜딩 페이지에 실속 있는 Q&A를 더해 thin-content를 개선(AdSense 승인에 유리).
2. **사용자 안내** — 진입 검토자에게 부동산·청약·생활시설 이용 관련 실질 질문에 답한다.

## 경쟁사(ilsangkit) 실측 패턴

재검증 결과, FAQ는 **각 섹션의 랜딩/허브 페이지**에만 노출되고 깊은 상세에는 없다.

| 페이지 | FAQ 섹션 | 비고 |
|---|---|---|
| `/real-estate` (부동산 허브) | ✅ 5개 | 부동산 일반 |
| `/real-estate/apt-sale` (유형 랜딩) | ✅ 12개 | 매매/전세/빌라/오피스텔 |
| `/subscription` (청약 허브) | ✅ 6개 | 청약 |
| `/hospital`·`/pharmacy` 등 (시설 랜딩) | ✅ 5~6개 | 시설별 |
| 자치구 목록 / 단지 상세 / 지역 허브 | ❌ | footer 링크만 |

- 구현: 네이티브 `<details>/<summary>` 아코디언 + `FAQPage` JSON-LD.
- 답변: 짧고 실속 있게, 관련 시 데이터 출처 포함(예: "국토교통부 실거래가 공개시스템").
- footer "정보·지원" 칼럼에 `자주 묻는 질문 → /faq` 링크.
- 별도 통합 `/faq` 페이지에 전체 FAQ를 카테고리→시설→Q&A로 묶어 노출(+ FAQPage JSON-LD).

## 핵심 설계 결정

- **배치는 랜딩 페이지에만.** 동일 FAQ를 수천 개 상세 페이지에 복제하면 중복 콘텐츠로
  thin-content 리스크가 커진다. 기존 L3 설계는 "상세 페이지 통합"이라 적혀 있었으나,
  ilsangkit 실측·SEO 안전성 모두 랜딩 페이지 방식이 우월하므로 이 방향으로 진행한다.
- **저장은 정적 TS 데이터 파일.** FAQ는 변경 빈도가 낮고 쿼리가 필요해 정적이 가장 단순하다.
  렌더링되는 HTML은 DB 방식과 동일하므로 AdSense 관점에서 차이가 없고, 어드민/마이그레이션
  오버헤드만 제거된다.
- **AdSense 유리 요소는 콘텐츠 품질로 확보.** 카테고리별 고유·원본 답변 + 출처 표기 +
  FAQPage 스키마 유효성. (참고: Google은 2023년부터 FAQ 리치결과를 정부·보건 사이트로
  제한 — 검색결과 아코디언 노출은 기대하지 않되, 온페이지 콘텐츠 보강과 스키마 유효성은 유효.)

## 구성 요소

### 1. 데이터 — `lib/faq/data.ts`

타입드 정적 레지스트리. 카테고리 키별 Q&A 배열.

```ts
export interface FaqItem {
  q: string;
  a: string;          // 2~4문장 원본 답변
  source?: string;    // 관련 시 데이터 출처 라벨 (lib/data-sources.ts 연계 가능)
}

export type FaqCategory =
  | "apt" | "officetel" | "villa"
  | "subscription"
  | "finance" | "jeonse-guarantee"
  | "hospital" | "pharmacy" | "school" | "childcare" | "life"
  | "region";

export const FAQ: Record<FaqCategory, FaqItem[]> = { /* ... */ };
```

- 카테고리 키는 imjang-on 랜딩 라우트와 매핑된다.
- 보일러플레이트 금지: 카테고리마다 실제로 다른, 해당 도메인에 특화된 질문.

### 2. JSON-LD — `lib/seo/json-ld.tsx`

기존 패턴을 따라 `faqSchema()` 함수 추가.

```ts
export function faqSchema(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}
```

기존 `JsonLd` 컴포넌트로 렌더한다.

### 3. 재사용 컴포넌트 — `app/(public)/_components/faq.tsx`

서버 컴포넌트.

- props: `items: FaqItem[]`, `title?: string` (기본 "자주 묻는 질문").
- 네이티브 `<details>/<summary>` 아코디언으로 렌더 → 키보드 접근성 = WCAG 2.1 AA 자동 충족.
- 같은 `items`로 `faqSchema` JSON-LD를 함께 방출.
- DESIGN.md 준수: 그림자는 `--shadow-soft` 하나, 한글 본문 14px 이상, 색은 정보 전달용.
- 답변에 `source`가 있으면 SourceCaption 스타일로 출처 인라인 표기.

### 4. 랜딩 페이지 통합

다음 랜딩 페이지에 해당 카테고리 `<Faq>` 삽입(페이지 하단, 출처 블록 위/근처):

- `/apt`, `/officetel`, `/villa`
- `/subscription`
- `/finance`, `/jeonse-guarantee`
- `/school`, `/childcare`, `/life` (및 의료 랜딩 — 구현 시 실제 라우트 확인)
- `/region`

깊은 상세(`/apt/[id]`, 자치구 목록, 개별 시설 상세 등)에는 **삽입하지 않는다.**

### 5. 통합 페이지 — `app/(public)/faq/page.tsx` (신규)

- 전체 FAQ를 카테고리(h2) → 필요 시 시설(h3) → 아코디언으로 노출.
- 페이지 메타데이터(title/description) + 전체 항목을 묶은 단일 FAQPage JSON-LD.
- 사이트맵에 포함.

### 6. Footer — `app/(public)/_components/footer.tsx`

- "법적 안내"(또는 적절한 정보) 칼럼에 `자주 묻는 질문 → /faq` 링크 추가.

## 테스트

- `faqSchema()` 출력 형태 단위 테스트(@type, mainEntity 구조).
- 데이터 무결성: 모든 항목에 비어 있지 않은 `q`/`a`.
- 렌더: `/faq` 페이지가 전체 카테고리를 렌더, 랜딩 페이지 1곳이 자기 카테고리 FAQ를 렌더.
- (선택) 리치결과 검사 수동 확인.

## 범위 밖 (YAGNI)

- DB 모델 / 어드민 검수 워크플로우.
- 깊은 상세 페이지 FAQ 삽입.
- FAQ 검색/필터 기능.
- 다국어.
