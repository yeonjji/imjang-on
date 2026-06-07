# Sitemap 인덱스 분할 설계

- 작성일: 2026-06-07
- 상태: 승인됨 (구현 대기)

## 배경 / 문제

현재 `app/sitemap.ts`는 모든 URL을 단일 `<urlset>`(`/sitemap.xml`) 하나에 담는 flat 구조다. 운영 DB 실측 결과 sitemap 대상 매물(`txCount12m > 0`)만 **74,759건**으로, 여기에 region·school·amenity·정적 페이지까지 더하면 sitemap 프로토콜 한도(파일당 **URL 50,000개 / 비압축 50MB**)를 **이미 초과**한다. 즉 현재 sitemap은 검색엔진이 잘라내거나 거부하는 무효 상태다.

또한 상세 페이지(`/[id]`) 다수가 sitemap에 누락되어 있다. 백킹 테이블 실측:

| 라우트 | 백킹 모델 | 건수 | 현재 sitemap |
|---|---|---:|:---:|
| `/apt·officetel·villa/[id]` 매물 상세 | Property(txCount12m>0) | 74,759 | 포함 |
| `/amenity/[cat]/[id]` 편의점·마트·카페 | Store | 311,857 | 누락 |
| `/urban/charger/[id]` 전기차 충전소 | EvCharger | 99,086 | 누락 |
| `/medical/hospital/.../[id]` 병원 | Hospital | 79,562 | 누락 |
| `/medical/pharmacy/.../[id]` 약국 | Pharmacy | 25,688 | 누락 |
| `/childcare/.../[id]` 어린이집 | Childcare | 25,102 | 누락 |
| `/urban/.../[id]` 주차장 | Parking | 17,739 | 누락 |
| `/urban/.../[id]` 공원 | Park | 17,000 | 누락 |
| `/school/[sgg]/[id]` 학교 상세 | School | 12,561 | 누락 |
| `/subscription/[id]` 청약 공고 | SubscriptionNotice | 5,704 | 누락 |
| `/amenity/market/[id]` 전통시장 | TraditionalMarket | 1,393 | 누락 |

전부 포함 시 약 690,000 URL. 크롤 예산이 유한하므로 thin content를 통째로 넣으면 핵심 페이지 색인이 밀린다 → **티어로 범위를 나눈다.**

## 범위 (Tier 1+2)

이번 작업은 **Tier 1+2**만 sitemap에 포함한다. Tier 3(편의점·충전소·공원·주차장·전통시장 상세)은 제외하되, 레지스트리에 항목만 추가하면 **나중에 무코드 변경으로 확장 가능**하게 설계한다.

- **Tier 1 (핵심 콘텐츠)**: 매물 상세, 청약 공고, 기존 허브·시군구·정적 페이지
- **Tier 2 (의미 있는 랜딩)**: 학교 상세, 병원 상세, 어린이집 상세, 약국 상세

### 샤드 구성 (`CHUNK_SIZE = 40,000`)

소스별 `ceil(count / CHUNK_SIZE)` 개 샤드 생성:

| 소스 key | 대상 | 건수(실측) | 샤드 수 |
|---|---|---:|:---:|
| `core` | 정적 + region + school 허브 + amenity 허브 | ~수백 | 1 |
| `property` | Property `txCount12m>0` | 74,759 | 2 |
| `hospital` | Hospital 전체 | 79,562 | 2 |
| `pharmacy` | Pharmacy 전체 | 25,688 | 1 |
| `childcare` | Childcare 전체 | 25,102 | 1 |
| `school` | School 상세 전체 | 12,561 | 1 |
| `subscription` | SubscriptionNotice 전체 | 5,704 | 1 |

→ 현재 총 **9개 샤드**. 결과물: `/sitemap.xml`(인덱스) + `/sitemap/0.xml` ~ `/sitemap/8.xml`.

## 아키텍처

Next.js 15의 네이티브 `generateSitemaps()`를 사용한다. `app/sitemap.ts`가 `generateSitemaps()`를 export하면 Next가 **인덱스(`/sitemap.xml`)를 자동 생성**하고 각 id를 `/sitemap/{id}.xml`로 만든다. `app/robots.ts`는 이미 `${SITE}/sitemap.xml`을 가리키므로 **수정 불필요**.

소스 정의(DB 의존)와 청킹 로직(순수 함수)을 분리한다 — CLAUDE.md의 "단일 책임 / 독립 테스트 가능 단위" 원칙.

```
lib/sitemap/
  manifest.ts    # 순수 함수 buildManifest(counts, chunkSize) → Shard[] / resolveShard(id)
  sources.ts     # 소스 레지스트리: 각 소스의 { key, count(), page(offset, limit) }
app/sitemap.ts   # generateSitemaps() + sitemap({ id }) 글루 + STATIC_ENTRIES export(기존 유지)
```

### `lib/sitemap/manifest.ts` (순수)

```ts
type SourceCount = { key: string; count: number };
type Shard = { id: number; key: string; offset: number; limit: number };

function buildManifest(counts: SourceCount[], chunkSize: number): Shard[];
```

- 소스를 고정 순서로 순회하며, 각 소스를 `chunkSize` 단위로 끊어 연속된 `id`(0부터)를 부여.
- `count === 0`인 소스도 샤드 1개를 보장할지 여부: **count 0이면 샤드 0개**로 처리(빈 sitemap 노출 방지). 단 `core`는 항상 count ≥ 1.
- DB 없이 단위 테스트 가능.

### `lib/sitemap/sources.ts` (DB 의존)

- 소스 고정 순서: `core`, `property`, `subscription`, `school`, `childcare`, `pharmacy`, `hospital`.
- 각 소스:
  - `count()`: 해당 테이블/필터의 건수.
  - `page(offset, limit)`: `orderBy: { id: 'asc' }` + `skip: offset` + `take: limit`로 안정적 페이지네이션. `MetadataRoute.Sitemap` 배열 반환.
- URL 패턴(코드 확인 완료):
  - 매물: `/apt|officetel|villa/${id}` (propertyType → prefix)
  - 청약: `/subscription/${id}`
  - 학교: `/school/${sigunguCode}/${id}`
  - 어린이집: `/childcare/${sigunguCode}/${id}`
  - 약국: `/medical/pharmacy/${sigunguCode}/${id}`
  - 병원: `/medical/hospital/${sigunguCode}/${id}`
- `lastModified`: 가능하면 `updatedAt`. `changeFrequency`/`priority`는 기존 컨벤션 따름(상세는 `weekly`/`0.6` 수준).
- `core` 소스: 기존 `app/sitemap.ts`의 STATIC_ENTRIES + region/school 허브/amenity 허브 동적 엔트리를 그대로 이관.

### `app/sitemap.ts` (글루)

```ts
export async function generateSitemaps() {
  const counts = await loadCounts();          // sources.map(s => s.count())
  return buildManifest(counts, CHUNK_SIZE).map(s => ({ id: s.id }));
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const counts = await loadCounts();
  const shard = buildManifest(counts, CHUNK_SIZE).find(s => s.id === id);
  if (!shard) return [];
  return SOURCES[shard.key].page(shard.offset, shard.limit);
}
```

`generateSitemaps()`와 `sitemap()`이 각각 count를 조회한다. count는 인덱스 조회로 저렴하며, 두 호출 사이 count가 드리프트해도 `revalidate` 윈도 내에서는 무해(샤드 수는 인덱스 생성 시점 기준 고정). 단순성을 위해 캐싱 없이 매번 조회한다.

## 에러 처리 (기존 철학 계승)

- 각 `page()`는 내부에서 DB 오류를 잡아 `[]` 반환 → 한 소스 장애가 전체 sitemap을 깨뜨리지 않음.
- `core` 소스는 DB 장애 시에도 최소 `STATIC_ENTRIES`를 반환(현재 fallback 계승).
- `revalidate = 86_400` 유지.

## 테스트

- **기존 유지**: `tests/lib/sitemap.test.ts`의 `STATIC_ENTRIES` 단언 (export 보존 필요).
- **신규** `tests/lib/sitemap-manifest.test.ts` (순수 함수, DB 불필요):
  - 모든 샤드 `limit ≤ CHUNK_SIZE`.
  - `id`가 0부터 연속, 중복 없음.
  - 경계값: `count = 0`(샤드 0개), `count`가 `CHUNK_SIZE`의 정확한 배수, `CHUNK_SIZE + 1`.
  - 소스별 샤드 수 = `ceil(count / CHUNK_SIZE)`.
  - 샤드들의 `offset`/`limit`이 해당 소스 범위를 정확히 분할(겹침·누락 없음).

## 검증 (구현 후)

- `pnpm test` 통과.
- 로컬에서 `/sitemap.xml`이 `<sitemapindex>`로 9개 샤드를 가리키는지 확인.
- 임의 샤드(`/sitemap/2.xml` 등)가 유효한 `<urlset>`이고 URL 수 ≤ 40,000인지 확인.
- 매물/청약/병원/약국/어린이집/학교 상세 URL이 올바른 경로 패턴으로 포함되는지 샘플 확인.

## 비범위 (Out of scope)

- Tier 3(Store, EvCharger, Park, Parking, TraditionalMarket) 상세 페이지 — 추후 `sources.ts` 항목 추가로 확장.
- 상세 페이지 자체의 콘텐츠/메타데이터 개선.
- Search Console 제출·모니터링(등록 후 별도 운영 작업).
