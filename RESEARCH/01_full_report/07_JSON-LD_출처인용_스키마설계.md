# B. imjangon JSON-LD 보강 설계 — 출처 인용·신선도(Provenance) 스키마

> 목적: '스크래핑/규모화된 콘텐츠' 의심을 낮추는 **출처·저작권·신선도 신호**를 구조화 데이터로 선언.
> 전제: JSON-LD는 **신뢰·이해 보조 신호**이지 thin-content 자체를 해결하지 않는다. **반드시 P0-1(해석 프로즈)과 함께** 적용.

---

## 0. 현재 상태 (실측)

imjangon 어린이집 상세의 초기 HTML에 이미 존재하는 JSON-LD:
- `Organization`(임장ON), `WebSite`(+SearchAction), `ChildCare`(name·url·address·geo), `BreadcrumbList`

**비어 있는 것 (ayo는 가진 것)** → 이번에 추가:
- `isBasedOn` (원본 공공 Dataset), `sourceOrganization`(제공 기관), `license`(KOGL), `datePublished`/`dateModified`(신선도), `WebPage` 래퍼로 노드 연결, 엔티티에 실제 수치(`additionalProperty`)

→ 전략: **기존 노드는 유지하고, 출처·신선도·수치만 얹는다.** 엔티티 타입(ChildCare)은 이미 잘 되어 있으므로 건드리지 않음.

---

## 1. 어린이집 상세 — 완성형 JSON-LD (드롭인)

> ⚠️ `sameAs`의 data.go.kr 데이터셋 **숫자 ID는 실제 값으로 채워야 함**(추정 금지). 아래는 자리표시자.

```json
[
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://imjangon.co.kr/#org",
    "name": "임장ON",
    "url": "https://imjangon.co.kr",
    "logo": "https://imjangon.co.kr/icon-512.png"
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": "https://imjangon.co.kr/#website",
    "name": "임장ON",
    "url": "https://imjangon.co.kr",
    "publisher": { "@id": "https://imjangon.co.kr/#org" },
    "potentialAction": {
      "@type": "SearchAction",
      "target": { "@type": "EntryPoint", "urlTemplate": "https://imjangon.co.kr/list?keyword={query}" },
      "query-input": "required name=query"
    }
  },
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": "https://imjangon.co.kr/childcare/41110/10120#webpage",
    "url": "https://imjangon.co.kr/childcare/41110/10120",
    "name": "광교샛별어린이집 — 민간 정원 69 | 임장ON",
    "inLanguage": "ko-KR",
    "isPartOf": { "@id": "https://imjangon.co.kr/#website" },
    "primaryImageOfPage": "https://imjangon.co.kr/childcare/41110/10120/opengraph-image-xeyn56",
    "datePublished": "2026-01-01",
    "dateModified": "2026-06-28",
    "mainEntity": { "@id": "https://imjangon.co.kr/childcare/41110/10120#childcare" },
    "isBasedOn": { "@id": "https://imjangon.co.kr/childcare/41110/10120#dataset" },
    "sourceOrganization": { "@id": "https://imjangon.co.kr/#src-mohw" },
    "license": "https://www.kogl.or.kr/info/license.do"
  },
  {
    "@context": "https://schema.org",
    "@type": "GovernmentOrganization",
    "@id": "https://imjangon.co.kr/#src-mohw",
    "name": "보건복지부(한국사회보장정보원)",
    "url": "https://www.childcare.go.kr/"
  },
  {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": "https://imjangon.co.kr/childcare/41110/10120#dataset",
    "name": "전국 어린이집 정보 (어린이집 정보공개포털)",
    "description": "어린이집 인가·정원·현원·교직원·시설 등 보육 통합정보 공공데이터.",
    "url": "https://www.childcare.go.kr/",
    "sameAs": "https://www.data.go.kr/data/{데이터셋ID}/openapi.do",
    "creator": { "@id": "https://imjangon.co.kr/#src-mohw" },
    "license": "https://www.kogl.or.kr/info/license.do"
  },
  {
    "@context": "https://schema.org",
    "@type": "ChildCare",
    "@id": "https://imjangon.co.kr/childcare/41110/10120#childcare",
    "name": "광교샛별어린이집",
    "url": "https://imjangon.co.kr/childcare/41110/10120",
    "telephone": "+82-31-214-4490",
    "foundingDate": "2014-02-03",
    "address": {
      "@type": "PostalAddress",
      "addressCountry": "KR",
      "addressRegion": "경기도",
      "addressLocality": "수원시 영통구",
      "streetAddress": "광교마을로 156 관리동 (하동, 광교마을40단지아파트)"
    },
    "geo": { "@type": "GeoCoordinates", "latitude": 37.2946285769376, "longitude": 127.0805936267299 },
    "numberOfEmployees": { "@type": "QuantitativeValue", "value": 20 },
    "additionalProperty": [
      { "@type": "PropertyValue", "name": "설립유형", "value": "민간" },
      { "@type": "PropertyValue", "name": "정원", "value": 69, "unitText": "명" },
      { "@type": "PropertyValue", "name": "현원", "value": 57, "unitText": "명" },
      { "@type": "PropertyValue", "name": "충원율", "value": 83, "unitText": "%" },
      { "@type": "PropertyValue", "name": "보육교사", "value": 17, "unitText": "명" },
      { "@type": "PropertyValue", "name": "보육실", "value": 6, "unitText": "실" },
      { "@type": "PropertyValue", "name": "CCTV", "value": 8, "unitText": "대" },
      { "@type": "PropertyValue", "name": "통학차량", "value": "운영" }
    ],
    "mainEntityOfPage": { "@id": "https://imjangon.co.kr/childcare/41110/10120#webpage" }
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "홈", "item": "https://imjangon.co.kr/" },
      { "@type": "ListItem", "position": 2, "name": "어린이집", "item": "https://imjangon.co.kr/childcare" },
      { "@type": "ListItem", "position": 3, "name": "광교샛별어린이집" }
    ]
  }
]
```

### 각 추가 필드가 하는 일

| 필드 | 신호 | 효과 |
|---|---|---|
| `isBasedOn` + `Dataset` | "이 페이지는 특정 공공 데이터셋을 근거로 함" | 스크래핑이 아니라 **출처 있는 가공물**임을 선언 |
| `sourceOrganization`(GovernmentOrganization) | 제공 기관 명시 | 신뢰성(E-E-A-T Trust)↑ |
| `license`(KOGL) | 재사용 권리 근거 | 저작권 정당성 |
| `datePublished`/`dateModified` | 신선도 | "관리되는 살아있는 페이지" 신호 |
| `additionalProperty`(수치) | 표의 핵심 값을 기계가 읽게 | 엔티티 정보 밀도↑, 리치결과 후보 |
| `@id` 상호참조 | 노드 그래프 연결 | 파편이 아닌 **하나의 구조화된 문서**로 인식 |

---

## 2. 재사용 헬퍼 (TypeScript / Next.js)

기존에 imjangon이 쓰는 `dangerouslySetInnerHTML` 방식 그대로 유지.

```ts
// lib/jsonld/childcare.ts
type ChildcareLD = {
  id: string; region: string; name: string; url: string; tel?: string;
  foundingDate?: string; lat: number; lng: number; employees?: number;
  type?: string; capacity?: number; current?: number; teachers?: number;
  rooms?: number; cctv?: number; hasBus?: boolean;
  dataModified?: string;                 // 데이터 갱신일(공공데이터 기준일)
  dataPublished?: string;                // 최초/기준일
  ogImage?: string;
  datasetId?: string;                    // data.go.kr 데이터셋 ID (실제 값)
};

const SRC = {
  '@type': 'GovernmentOrganization',
  '@id': 'https://imjangon.co.kr/#src-mohw',
  name: '보건복지부(한국사회보장정보원)',
  url: 'https://www.childcare.go.kr/',
};
const LICENSE = 'https://www.kogl.or.kr/info/license.do';

const prop = (name: string, value: unknown, unitText?: string) =>
  ({ '@type': 'PropertyValue', name, value, ...(unitText ? { unitText } : {}) });

export function childcareJsonLd(d: ChildcareLD) {
  const page = `${d.url}#webpage`, ent = `${d.url}#childcare`, ds = `${d.url}#dataset`;
  const occ = d.capacity && d.current != null ? Math.round((d.current / d.capacity) * 100) : undefined;
  const props = [
    d.type && prop('설립유형', d.type),
    d.capacity && prop('정원', d.capacity, '명'),
    d.current != null && prop('현원', d.current, '명'),
    occ != null && prop('충원율', occ, '%'),
    d.teachers && prop('보육교사', d.teachers, '명'),
    d.rooms && prop('보육실', d.rooms, '실'),
    d.cctv && prop('CCTV', d.cctv, '대'),
    d.hasBus && prop('통학차량', '운영'),
  ].filter(Boolean);

  return [
    { '@context': 'https://schema.org', '@type': 'Organization', '@id': 'https://imjangon.co.kr/#org',
      name: '임장ON', url: 'https://imjangon.co.kr', logo: 'https://imjangon.co.kr/icon-512.png' },
    { '@context': 'https://schema.org', '@type': 'WebSite', '@id': 'https://imjangon.co.kr/#website',
      name: '임장ON', url: 'https://imjangon.co.kr', publisher: { '@id': 'https://imjangon.co.kr/#org' } },
    { '@context': 'https://schema.org', '@type': 'WebPage', '@id': page, url: d.url,
      name: `${d.name} | 임장ON`, inLanguage: 'ko-KR',
      isPartOf: { '@id': 'https://imjangon.co.kr/#website' },
      ...(d.ogImage ? { primaryImageOfPage: d.ogImage } : {}),
      ...(d.dataPublished ? { datePublished: d.dataPublished } : {}),
      ...(d.dataModified ? { dateModified: d.dataModified } : {}),
      mainEntity: { '@id': ent }, isBasedOn: { '@id': ds },
      sourceOrganization: { '@id': SRC['@id'] }, license: LICENSE },
    SRC,
    { '@context': 'https://schema.org', '@type': 'Dataset', '@id': ds,
      name: '전국 어린이집 정보 (어린이집 정보공개포털)',
      description: '어린이집 인가·정원·현원·교직원·시설 등 보육 통합정보 공공데이터.',
      url: 'https://www.childcare.go.kr/', creator: { '@id': SRC['@id'] }, license: LICENSE,
      ...(d.datasetId ? { sameAs: `https://www.data.go.kr/data/${d.datasetId}/openapi.do` } : {}) },
    { '@context': 'https://schema.org', '@type': 'ChildCare', '@id': ent,
      name: d.name, url: d.url, ...(d.tel ? { telephone: d.tel } : {}),
      ...(d.foundingDate ? { foundingDate: d.foundingDate } : {}),
      geo: { '@type': 'GeoCoordinates', latitude: d.lat, longitude: d.lng },
      ...(d.employees ? { numberOfEmployees: { '@type': 'QuantitativeValue', value: d.employees } } : {}),
      ...(props.length ? { additionalProperty: props } : {}),
      // ⚠️ isBasedOn/sourceOrganization/provider 는 CreativeWork 전용 속성 → 엔티티(Place)에 넣지 않는다.
      //    출처 신호는 WebPage 노드에만 두고, 엔티티는 mainEntityOfPage 로 페이지와 연결한다.
      mainEntityOfPage: { '@id': page } },
  ];
}
```

```tsx
// app/childcare/[region]/[id]/page.tsx
<script type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(childcareJsonLd(detail)) }} />
```

---

## 3. 아파트 상세 — 패턴 (요약)

- 엔티티 타입: `ApartmentComplex`(Residence 하위) — name·address·geo, `numberOfAccommodationUnits`(세대수), `yearBuilt`.
- 출처 Dataset: **국토교통부 실거래가**(`sourceOrganization`=국토교통부, url=`https://rt.molit.go.kr/`, license=KOGL).
- 시세는 `additionalProperty`로 최근 실거래 요약(최고가/전세가 등)만 — 과장·허위 금지, 표에 있는 실값만.
- 나머지(WebPage 래퍼·datePublished/Modified·BreadcrumbList) 동일 패턴.

---

## 4. 검증·주의

**출고 전**
- [ ] [Google Rich Results Test](https://search.google.com/test/rich-results) / Schema Markup Validator로 각 유형 1건씩 통과 확인.
- [ ] JSON-LD의 값과 화면 표시 값이 **일치**(불일치는 cloaking·스팸 위험).
- [ ] `data.go.kr` 데이터셋 **실제 ID** 확인 후 삽입(모르면 `sameAs` 생략 — 추정 금지).
- [ ] `dateModified`는 공공데이터 실제 갱신 기준일과 동기화(가짜 최신화 금지).

**절대 주의**
- **JSON-LD만으로 thin content는 해결되지 않는다.** 이건 신뢰·출처 신호일 뿐. 반드시 **P0-1 해석 프로즈**와 병행해야 승인 효과가 난다.
- 화면에 없는 정보를 스키마에만 넣지 말 것(구조화 데이터 스팸 정책 위반).

---

## 5. imjangon 최종 그림 (A+B 종합)

| 축 | 현재 | 조치 후 |
|---|---|---|
| 렌더링(크롤) | ✅ SSR (확인됨) | 유지 — ayo(CSR)보다 우위 |
| 엔티티 스키마 | ✅ ChildCare 등 | 유지 |
| **출처·신선도 스키마** | ❌ 없음 | **B로 추가** (isBasedOn·source·license·date) |
| **본문 해석 프로즈** | ❌ 없음 | **P0-1로 추가** |
| 원본 콘텐츠 총량 | 가이드 14편 | 가이드/허브 확대 |

→ imjangon은 **기술적 토대(SSR·엔티티 스키마)가 ayo보다 좋다.** 비어 있는 두 칸(출처 스키마 + 해석 프로즈)만 채우면, CSR로도 광고가 게재 중인 ayo보다 유리한 조건이 된다.
