# 공동주택 단지정보 수집·매칭 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 국토교통부 공동주택 단지정보 22,298건을 `AptComplex` 테이블에 적재하고, 아파트 `Property`에 안전하게 매칭한 뒤 `households`·`buildingCount`를 역채움한다.

**Architecture:** 수집(목록·상세)과 매칭을 완전히 분리한다. 원본은 `rawJson`에 보존해 매칭 규칙이 바뀌어도 API 재호출 없이 재매칭한다. 매칭은 시군구로 좁힌 뒤 이름 완전일치(Tier 1) → Dice 유사도 0.85 + 동명 게이트(Tier 2) 계단식으로 판정하고, 애매하면 버린다.

**Tech Stack:** TypeScript, Prisma 5, PostgreSQL, tsx, vitest, GitHub Actions

## Global Constraints

- **이 계획은 화면에 아무것도 노출하지 않는다.** `revalidatePaths`를 호출하지 않고, 컴포넌트·페이지 파일을 건드리지 않는다.
- **`lib/seo/indexable.ts`를 수정하지 않는다.** 측정만 한다. 변경은 후속 스펙이다.
- **`Property`에 컬럼을 추가하지 않는다.** 관계 한 줄만 추가하고, 기존 `households`·`buildingCount`만 역채움한다.
- 유사도 임계값 **0.85**. 동명 일치는 **필수 게이트**다.
- 모호(후보 복수 / 최고점 동점)하면 **미매칭으로 버린다.** 첫 번째를 고르지 않는다.
- API 값이 `null`이면 기존 DB 값을 **덮어쓰지 않는다.**
- 일일 트래픽 한도를 코드에 하드코딩하지 않는다. 한도 초과 응답을 감지해 중단·재개한다.
- Property 후보 조회는 항상 `propertyType = APARTMENT AND redirectToId IS NULL`로 좁힌다.
- 테스트는 공유 로컬 DB에 병렬로 붙는다. **무필터 `deleteMany` 금지** — 이 계획이 쓰는 코드로 좁힌다.
- 스펙: `docs/superpowers/specs/2026-09-07-apt-complex-ingest-design.md`

## File Structure

| 파일 | 책임 |
|---|---|
| `prisma/schema.prisma` | `AptComplex` 모델 + `Property.aptComplex` 관계 |
| `scripts/ingest/apt-complex/types.ts` | 행 타입·상수. DB와 1:1 |
| `scripts/ingest/apt-complex/http.ts` | API 호출·재시도·백오프·한도 감지 |
| `scripts/ingest/apt-complex/adapter.ts` | JSON 응답 → 정규화 행. 순수 함수 |
| `scripts/ingest/apt-complex/match.ts` | 정규화·유사도·동명게이트·판정. **DB 접근 없는 순수 함수** |
| `scripts/ingest/apt-complex/runner.ts` | `--mode=list\|detail\|match\|audit` |
| `scripts/ops/measure-narrative-index.ts` | 측정 게이트 (읽기 전용) |
| `.github/workflows/ingest-apt-complex.yml` | `workflow_dispatch` 전용 |

`match.ts`가 DB를 모르게 두는 것이 핵심이다. 매칭 규칙은 앞으로 계속 바뀌는데, 순수 함수라야 픽스처만으로 회귀를 잡는다.

---

## Task 1: `AptComplex` 스키마와 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_apt_complex/migration.sql` (generate로 생성)

**Interfaces:**
- Produces: Prisma 클라이언트의 `prisma.aptComplex`, `AptComplex` 타입

- [ ] **Step 1: `prisma/schema.prisma`에 모델 추가**

`model Property { ... }` 블록 안, `transactions Transaction[]` 줄 바로 아래에 관계를 추가한다.

```prisma
  transactions Transaction[]
  aptComplex   AptComplex?
```

그리고 `model Property` 블록이 끝난 뒤(`enum DealType` 앞)에 모델을 추가한다.

```prisma
/// 공동주택 단지정보(국토교통부 AptBasisInfoServiceV5). 의무관리대상 공동주택만 대상이라
/// 우리 Property 아파트의 약 절반만 대응된다. 미매칭 행도 그대로 보관한다 —
/// 매칭 규칙을 개선하면 API 재호출 없이 커버리지가 올라간다.
model AptComplex {
  kaptCode    String  @id @db.VarChar(20)
  kaptName    String  @db.VarChar(120)
  nameNorm    String  @db.VarChar(120)
  bjdCode     String  @db.VarChar(10)
  sigunguCode String  @db.VarChar(5)
  as3         String? @db.VarChar(40)

  households    Int?
  buildingCount Int?
  usedate       DateTime? @db.Date
  hallType      String?   @db.VarChar(20)
  heatType      String?   @db.VarChar(20)
  aptKind       String?   @db.VarChar(20)
  topFloor      Int?
  baseFloor     Int?
  area60        Int?
  area85        Int?
  area135       Int?
  area136       Int?

  parkingGround Int?
  parkingUnder  Int?
  subwayLine    String? @db.VarChar(60)
  subwayStation String? @db.VarChar(60)
  walkSubway    String? @db.VarChar(40)
  walkBus       String? @db.VarChar(40)
  evGround      Int?
  evUnder       Int?
  elevator      Int?
  cctv          Int?
  builder       String? @db.VarChar(200)
  welfareFacility    String? @db.Text
  convenientFacility String? @db.Text
  educationFacility  String? @db.Text

  /// useYn. 사용중이 아닌 단지는 적재하되 매칭 대상에서 제외한다.
  inUse Boolean @default(true)

  /// 두 엔드포인트 응답 원본(관리 운영 정보 포함). 정규화 컬럼은 여기서 파생된다.
  /// 목록만 적재된 중간 상태에서는 null이다.
  rawJson Json?

  propertyId BigInt?   @unique
  property   Property? @relation(fields: [propertyId], references: [id], onDelete: SetNull)
  matchTier  Int?
  matchedAt  DateTime?

  /// 상세 수집 시각. NULL이면 목록만 적재된 상태 — 상세 수집의 재개 기준이다.
  fetchedAt DateTime?
  updatedAt DateTime  @updatedAt

  @@index([sigunguCode, nameNorm])
  @@index([propertyId])
  @@index([matchTier])
}
```

- [ ] **Step 2: 마이그레이션 생성**

```bash
pnpm exec dotenv -e .env.local -- prisma migrate dev --name add_apt_complex --create-only
```

`--create-only`를 반드시 붙인다. 로컬 docker DB에 남은 잔여 마이그레이션을 쓸어담는 사고가 이 저장소에서 있었다.

- [ ] **Step 3: 생성된 SQL 확인**

`prisma/migrations/<timestamp>_add_apt_complex/migration.sql`을 열어 `CREATE TABLE "AptComplex"`와 인덱스 3개, `ALTER TABLE ... ADD CONSTRAINT` 외래키만 있는지 확인한다. **다른 테이블에 대한 DROP·ALTER가 섞여 있으면 그 줄을 지운다.**

- [ ] **Step 4: 로컬 적용 + 클라이언트 생성**

```bash
pnpm exec dotenv -e .env.local -- prisma migrate deploy
pnpm exec dotenv -e .env.local -- prisma generate
pnpm typecheck
```
Expected: 모두 성공. `prisma.aptComplex`가 타입에 존재.

- [ ] **Step 5: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(apt-complex): AptComplex 테이블 추가

공동주택 단지정보 적재용. Property에는 관계 한 줄만 추가하고 컬럼은 늘리지 않는다.
propertyId @unique로 1:1을 DB가 강제한다."
```

---

## Task 2: 매칭 순수 함수

**Files:**
- Create: `scripts/ingest/apt-complex/match.ts`
- Test: `tests/ingest/apt-complex/match.test.ts`

**Interfaces:**
- Consumes: `normalizeName` from `@/lib/slug`
- Produces:
  - `complexKey(kaptName: string, as3: string | null): string`
  - `propertyKey(nameNorm: string): string`
  - `dongOfAddress(address: string): string | null`
  - `dongMatches(as3: string | null, addressDong: string | null): boolean`
  - `diceSimilarity(a: string, b: string): number`
  - `decideMatch(complex: { kaptName: string; as3: string | null }, candidates: MatchCandidate[]): MatchResult | null`
  - `interface MatchCandidate { id: bigint; nameNorm: string; address: string }`
  - `interface MatchResult { propertyId: bigint; tier: 1 | 2 }`
  - `const SIMILARITY_THRESHOLD = 0.85`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/ingest/apt-complex/match.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  complexKey,
  propertyKey,
  dongOfAddress,
  dongMatches,
  diceSimilarity,
  decideMatch,
} from '@/scripts/ingest/apt-complex/match';

describe('정규화', () => {
  it('"아파트" 접미사를 제거한다', () => {
    expect(complexKey('월드메르디앙주상복합아파트', '잠실동')).toBe('월드메르디앙주상복합');
    expect(propertyKey('범어센트럴푸르지오아파트')).toBe('범어센트럴푸르지오');
  });
  it('앞에 붙은 동명을 제거한다', () => {
    expect(complexKey('잠실동트리지움', '잠실동')).toBe('트리지움');
  });
  it('동명 어간만 겹쳐도 제거한다', () => {
    expect(complexKey('잠실레이크팰리스', '잠실동')).toBe('레이크팰리스');
  });
  it('단지명이 동명으로만 이루어지면 그대로 둔다', () => {
    expect(complexKey('잠실동', '잠실동')).toBe('잠실동');
  });
  it('as3가 없으면 접두 제거를 건너뛴다', () => {
    expect(complexKey('트리지움', null)).toBe('트리지움');
  });
});

describe('dongOfAddress', () => {
  it('주소 선두의 동명을 뽑는다', () => {
    expect(dongOfAddress('범어동 2305')).toBe('범어동');
    expect(dongOfAddress('가락동 164-1')).toBe('가락동');
    expect(dongOfAddress('수성동1가 15')).toBe('수성동1가');
  });
  it('읍·면·리도 인식한다', () => {
    expect(dongOfAddress('고촌읍 신곡리 100')).toBe('고촌읍');
  });
  it('동명이 없으면 null', () => {
    expect(dongOfAddress('123-4')).toBeNull();
  });
});

describe('dongMatches', () => {
  it('같으면 통과', () => {
    expect(dongMatches('범어동', '범어동')).toBe(true);
  });
  it('표기 깊이만 다르면 통과', () => {
    expect(dongMatches('수성동1가', '수성동')).toBe(true);
    expect(dongMatches('수성동', '수성동1가')).toBe(true);
  });
  it('다른 동이면 차단', () => {
    expect(dongMatches('범어동', '파동')).toBe(false);
    expect(dongMatches('범어동', '중동')).toBe(false);
  });
  it('한쪽이 null이면 차단', () => {
    expect(dongMatches(null, '범어동')).toBe(false);
    expect(dongMatches('범어동', null)).toBe(false);
  });
});

describe('diceSimilarity', () => {
  it('같은 문자열은 1', () => {
    expect(diceSimilarity('범어아이파크', '범어아이파크')).toBe(1);
  });
  it('겹치는 게 없으면 0', () => {
    expect(diceSimilarity('가나다', '라마바')).toBe(0);
  });
  it('한 글자짜리는 0 (bigram 없음)', () => {
    expect(diceSimilarity('가', '가')).toBe(0);
  });
});

// audit 실측(2026-09-07)에서 나온 실제 사례를 그대로 고정한다.
describe('decideMatch — 실측 사례', () => {
  const P = (id: number, nameNorm: string, address: string) => ({
    id: BigInt(id),
    nameNorm,
    address,
  });

  it('Tier 1: 완전일치 + 유일', () => {
    const r = decideMatch({ kaptName: '범어에일린의뜰', as3: '범어동' }, [
      P(1, '범어에일린의뜰', '범어동 2272'),
    ]);
    expect(r).toEqual({ propertyId: BigInt(1), tier: 1 });
  });

  it('Tier 1: 완전일치 후보가 복수면 버린다', () => {
    const r = decideMatch({ kaptName: '삼성래미안', as3: '범어동' }, [
      P(1, '삼성래미안', '범어동 100'),
      P(2, '삼성래미안', '범어동 200'),
    ]);
    expect(r).toBeNull();
  });

  it('Tier 2: 접미사 차이를 유사도로 흡수한다', () => {
    const r = decideMatch({ kaptName: '범어센트럴푸르지오 아파트', as3: '범어동' }, [
      P(7, '범어센트럴푸르지오', '범어동 2257'),
    ]);
    expect(r).toEqual({ propertyId: BigInt(7), tier: 2 });
  });

  it('Tier 2: 접두 차이도 흡수한다', () => {
    const r = decideMatch({ kaptName: '월드메르디앙이스턴카운티', as3: '범어동' }, [
      P(8, '범어월드메르디앙이스턴카운티', '범어동 500'),
    ]);
    expect(r).toEqual({ propertyId: BigInt(8), tier: 2 });
  });

  it('동명이 다르면 유사도가 높아도 차단한다 — 프라지움 1차 vs 11차', () => {
    const r = decideMatch({ kaptName: '프라지움1차', as3: '두정동' }, [
      P(9, '프라지움11차아파트', '성정동 300'),
    ]);
    expect(r).toBeNull();
  });

  it('동명이 다르면 차단 — 쌍용동일하이빌 vs 동일하이빌', () => {
    const r = decideMatch({ kaptName: '쌍용동일하이빌', as3: '쌍용동' }, [
      P(10, '동일하이빌', '불당동 12'),
    ]);
    expect(r).toBeNull();
  });

  it('동명이 다르면 차단 — 범어아이파크 vs 수성아이파크', () => {
    const r = decideMatch({ kaptName: '범어아이파크', as3: '범어동' }, [
      P(11, '수성아이파크', '파동 1000'),
    ]);
    expect(r).toBeNull();
  });

  it('임계값 미만이면 매칭하지 않는다', () => {
    const r = decideMatch({ kaptName: '가나다라마바', as3: '범어동' }, [
      P(12, '사아자차카타', '범어동 1'),
    ]);
    expect(r).toBeNull();
  });

  it('최고점이 동점이면 버린다', () => {
    const r = decideMatch({ kaptName: '삼성래미안1차', as3: '범어동' }, [
      P(13, '삼성래미안2차', '범어동 1'),
      P(14, '삼성래미안3차', '범어동 2'),
    ]);
    expect(r).toBeNull();
  });

  it('후보가 없으면 null', () => {
    expect(decideMatch({ kaptName: '범어에일린의뜰', as3: '범어동' }, [])).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/ingest/apt-complex/match.test.ts
```
Expected: FAIL — `Cannot find module '@/scripts/ingest/apt-complex/match'`

- [ ] **Step 3: `scripts/ingest/apt-complex/match.ts` 구현**

```ts
/**
 * 공동주택 단지(AptComplex) ↔ Property 매칭 판정. **DB를 모른다.**
 *
 * 매칭 규칙은 앞으로 계속 손볼 부분이라 순수 함수로 떼어 둔다. 픽스처만으로 회귀를 잡는다.
 * 임계값·게이트의 근거는 스펙 §5(2026-09-07 실측)에 있다.
 */
import { normalizeName } from '@/lib/slug';

/** 이름 완전일치가 32%에 그치는 첫 번째 이유 — API가 "…아파트"를 달고 온다. */
function stripAptSuffix(nameNorm: string): string {
  return nameNorm.replace(/(아파트|apt)$/, '');
}

/**
 * 두 번째 이유 — API가 읍면동명을 이름 앞에 붙인다("잠실동트리지움").
 * 어간까지 벗기되("잠실동" → "잠실"), 벗기고 나면 빈 문자열이 되는 경우는 원본을 지킨다.
 */
function stripDongPrefix(nameNorm: string, as3: string | null): string {
  if (!as3) return nameNorm;
  const full = normalizeName(as3);
  if (full && nameNorm.startsWith(full) && nameNorm.length > full.length) {
    return nameNorm.slice(full.length);
  }
  const stem = full.replace(/(동|읍|면|리|가)$/, '');
  if (stem && nameNorm.startsWith(stem) && nameNorm.length > stem.length) {
    return nameNorm.slice(stem.length);
  }
  return nameNorm;
}

/** API 단지명 → 매칭 키. */
export function complexKey(kaptName: string, as3: string | null): string {
  return stripDongPrefix(stripAptSuffix(normalizeName(kaptName)), as3);
}

/** Property.nameNorm → 매칭 키. 동명 접두는 우리 이름에 거의 없어 접미사만 벗긴다. */
export function propertyKey(nameNorm: string): string {
  return stripAptSuffix(nameNorm);
}

/**
 * Property.address 선두의 동명. "범어동 2305" → "범어동".
 * 한글 뒤 `\b`는 JS에서 동작하지 않는다(ASCII 단어경계) — 전방탐색으로 경계를 만든다.
 */
export function dongOfAddress(address: string): string | null {
  const m = address.trim().match(/^([가-힣]+[0-9]*(?:동|읍|면|리|가))(?=[\s0-9-]|$)/);
  return m ? m[1] : null;
}

/** "수성동1가" ↔ "수성동" 같은 표기 깊이 차이는 같은 동으로 본다. */
export function dongMatches(as3: string | null, addressDong: string | null): boolean {
  if (!as3 || !addressDong) return false;
  if (as3 === addressDong) return true;
  const trim = (s: string) => s.replace(/[0-9]+가$/, '');
  if (trim(as3) === trim(addressDong)) return true;
  return as3.startsWith(addressDong) || addressDong.startsWith(as3);
}

/** Dice 계수(bigram 기반). 한 글자 문자열은 bigram이 없어 0이다. */
export function diceSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const g = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
    return g;
  };
  const A = grams(a);
  const B = grams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

export const SIMILARITY_THRESHOLD = 0.85;

export interface MatchCandidate {
  id: bigint;
  nameNorm: string;
  address: string;
}

export interface MatchResult {
  propertyId: bigint;
  tier: 1 | 2;
}

/**
 * 계단식 판정. 애매하면 **버린다** — 부가정보라 놓치면 빈칸이지만 틀리면 거짓말이다.
 * (거래 적재의 findOrCreateProperty가 모호할 때 첫 번째를 고르는 것과 판단 기준이 반대다.)
 */
export function decideMatch(
  complex: { kaptName: string; as3: string | null },
  candidates: MatchCandidate[],
): MatchResult | null {
  const key = complexKey(complex.kaptName, complex.as3);
  if (!key) return null;

  const exact = candidates.filter((c) => propertyKey(c.nameNorm) === key);
  if (exact.length === 1) return { propertyId: exact[0].id, tier: 1 };
  if (exact.length > 1) return null;

  let best: MatchCandidate | null = null;
  let bestScore = 0;
  let tied = false;
  for (const c of candidates) {
    const s = diceSimilarity(key, propertyKey(c.nameNorm));
    if (s > bestScore) {
      bestScore = s;
      best = c;
      tied = false;
    } else if (s === bestScore && s > 0) {
      tied = true;
    }
  }
  if (!best || tied || bestScore < SIMILARITY_THRESHOLD) return null;
  if (!dongMatches(complex.as3, dongOfAddress(best.address))) return null;
  return { propertyId: best.id, tier: 2 };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/ingest/apt-complex/match.test.ts
```
Expected: PASS, 22개 전부.

- [ ] **Step 5: 커밋**

```bash
git add scripts/ingest/apt-complex/match.ts tests/ingest/apt-complex/match.test.ts
git commit -m "feat(apt-complex): 매칭 순수 함수

이름 완전일치는 32%에 그친다 — API가 동명 접두와 '아파트' 접미사를 붙이기 때문이다.
접두·접미 제거로 48%, Dice 0.85로 55%까지 오른다. 동명 게이트가 없으면
'범어아이파크(범어동) ≈ 수성아이파크(파동)' 같은 오매칭이 섞여 필수 조건으로 둔다.
테스트는 실측 audit에서 나온 실제 사례를 픽스처로 쓴다."
```

---

## Task 3: HTTP 계층

**Files:**
- Create: `scripts/ingest/apt-complex/http.ts`
- Create: `scripts/ingest/apt-complex/types.ts`
- Test: `tests/ingest/apt-complex/http.test.ts`

**Interfaces:**
- Produces (`http.ts`):
  - `class QuotaExceededError extends Error`
  - `fetchAptListPage(pageNo: number, numOfRows: number): Promise<unknown>`
  - `fetchAptBasis(kaptCode: string): Promise<unknown>`
  - `fetchAptDetail(kaptCode: string): Promise<unknown>`
  - `assertNotQuotaExceeded(payload: unknown): void`
- Produces (`types.ts`):
  - `const APT_COMPLEX_SOURCE = 'apt-complex'`
  - `interface AptListRow`, `interface AptDetailRow`

- [ ] **Step 1: `types.ts`를 만든다**

```ts
/** IngestionRun.source 값. */
export const APT_COMPLEX_SOURCE = 'apt-complex';

/** 목록 API 1행 → AptComplex 목록 필드. */
export interface AptListRow {
  kaptCode: string;
  kaptName: string;
  nameNorm: string;
  bjdCode: string;
  sigunguCode: string;
  as3: string | null;
}

/** 기본정보+상세정보 병합 → AptComplex 상세 필드. */
export interface AptDetailRow {
  kaptCode: string;
  households: number | null;
  buildingCount: number | null;
  usedate: Date | null;
  hallType: string | null;
  heatType: string | null;
  aptKind: string | null;
  topFloor: number | null;
  baseFloor: number | null;
  area60: number | null;
  area85: number | null;
  area135: number | null;
  area136: number | null;
  parkingGround: number | null;
  parkingUnder: number | null;
  subwayLine: string | null;
  subwayStation: string | null;
  walkSubway: string | null;
  walkBus: string | null;
  evGround: number | null;
  evUnder: number | null;
  elevator: number | null;
  cctv: number | null;
  builder: string | null;
  welfareFacility: string | null;
  convenientFacility: string | null;
  educationFacility: string | null;
  inUse: boolean;
  rawJson: Record<string, unknown>;
}
```

- [ ] **Step 2: 한도 감지 테스트를 쓴다**

`tests/ingest/apt-complex/http.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { assertNotQuotaExceeded, QuotaExceededError } from '@/scripts/ingest/apt-complex/http';

describe('assertNotQuotaExceeded', () => {
  it('정상 응답은 통과시킨다', () => {
    expect(() =>
      assertNotQuotaExceeded({ response: { header: { resultCode: '00', resultMsg: 'NORMAL SERVICE' } } }),
    ).not.toThrow();
  });
  it('한도 초과 응답이면 QuotaExceededError', () => {
    expect(() =>
      assertNotQuotaExceeded({
        OpenAPI_ServiceResponse: {
          cmmMsgHeader: { errMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR' },
        },
      }),
    ).toThrow(QuotaExceededError);
  });
  it('본문 어디에 있든 문자열로 감지한다', () => {
    expect(() =>
      assertNotQuotaExceeded({ response: { header: { resultMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR' } } }),
    ).toThrow(QuotaExceededError);
  });
});
```

- [ ] **Step 3: 실패 확인**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/ingest/apt-complex/http.test.ts
```
Expected: FAIL — 모듈 없음

- [ ] **Step 4: `http.ts` 구현**

```ts
/**
 * 공동주택 단지정보 API 호출.
 *
 * 엔드포인트 경로는 추측으로 찾을 수 없다(모든 변형이 NO_OPENAPI_SERVICE_ERROR).
 * 아래는 2026-09-07 실호출로 확인한 값이다. 응답은 JSON이 기본이다.
 * 시군구 30개 조회 중 13개가 타임아웃한 실측이 있어 재시도를 반드시 건다.
 */
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

const LIST_BASE = 'https://apis.data.go.kr/1613000/AptListService4';
const INFO_BASE = 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV5';
const TIMEOUT_MS = 25_000;
const SLEEP_MS = 80;
const MAX_RETRIES = 3;

/** 일일 트래픽 한도 초과. 재시도하지 않고 즉시 중단해야 한다. */
export class QuotaExceededError extends Error {
  constructor() {
    super('daily traffic quota exceeded');
    this.name = 'QuotaExceededError';
  }
}

/** 응답 본문 어디에 있든 한도 초과 문구를 감지한다(래핑 구조가 오류마다 다르다). */
export function assertNotQuotaExceeded(payload: unknown): void {
  if (JSON.stringify(payload ?? '').includes('LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS')) {
    throw new QuotaExceededError();
  }
}

async function getJson(url: URL, label: string): Promise<unknown> {
  if (!env.PUBLIC_DATA_KEY) throw new Error('PUBLIC_DATA_KEY is required');
  url.searchParams.set('serviceKey', env.PUBLIC_DATA_KEY);

  let attempt = 0;
  while (true) {
    attempt++;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), {
        signal: ctrl.signal,
        headers: {
          // data.go.kr WAF가 빈 UA 요청을 차단한다.
          'User-Agent': 'imjang-on/1.0 (+https://imjang-on.com)',
          Accept: 'application/json',
        },
      });
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      assertNotQuotaExceeded(parsed); // 한도 초과는 재시도 대상이 아니다
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          const backoff = SLEEP_MS * Math.pow(3, attempt);
          logger.warn({ status: res.status, attempt, backoff, label }, 'apt-complex http retry');
          await sleep(backoff);
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${label}`);
      }
      await sleep(SLEEP_MS);
      return parsed;
    } catch (err) {
      if (err instanceof QuotaExceededError) throw err;
      if (attempt < MAX_RETRIES) {
        const backoff = SLEEP_MS * Math.pow(3, attempt);
        logger.warn({ err, attempt, backoff, label }, 'apt-complex http error retry');
        await sleep(backoff);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(t);
    }
  }
}

export async function fetchAptListPage(pageNo: number, numOfRows = 1000): Promise<unknown> {
  const url = new URL(`${LIST_BASE}/getTotalAptList4`);
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('numOfRows', String(numOfRows));
  return getJson(url, `list p${pageNo}`);
}

export async function fetchAptBasis(kaptCode: string): Promise<unknown> {
  const url = new URL(`${INFO_BASE}/getAphusBassInfoV5`);
  url.searchParams.set('kaptCode', kaptCode);
  return getJson(url, `basis ${kaptCode}`);
}

export async function fetchAptDetail(kaptCode: string): Promise<unknown> {
  const url = new URL(`${INFO_BASE}/getAphusDtlInfoV5`);
  url.searchParams.set('kaptCode', kaptCode);
  return getJson(url, `detail ${kaptCode}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
```

- [ ] **Step 5: 통과 확인 + 커밋**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/ingest/apt-complex/http.test.ts
```
Expected: PASS

```bash
git add scripts/ingest/apt-complex/http.ts scripts/ingest/apt-complex/types.ts tests/ingest/apt-complex/http.test.ts
git commit -m "feat(apt-complex): API 호출 계층

엔드포인트 경로는 추측 불가라 실호출로 확인한 값을 주석에 남긴다.
한도 초과는 재시도 대상이 아니라 즉시 중단이다 — 계속 두드리면 차단당한다."
```

---

## Task 4: 어댑터 (JSON → 행)

**Files:**
- Create: `scripts/ingest/apt-complex/adapter.ts`
- Create: `tests/ingest/apt-complex/fixtures/apt-list.json`
- Create: `tests/ingest/apt-complex/fixtures/apt-basis.json`
- Create: `tests/ingest/apt-complex/fixtures/apt-dtl.json`
- Test: `tests/ingest/apt-complex/adapter.test.ts`

**Interfaces:**
- Consumes: `AptListRow`, `AptDetailRow` from `./types`
- Produces:
  - `parseAptList(payload: unknown): { rows: AptListRow[]; totalCount: number }`
  - `parseAptDetail(kaptCode: string, basis: unknown, dtl: unknown): AptDetailRow`
  - `areaSumMatches(row: Pick<AptDetailRow, 'area60'|'area85'|'area135'|'area136'|'households'>): boolean`

- [ ] **Step 1: 픽스처를 만든다**

`tests/ingest/apt-complex/fixtures/apt-list.json` — 실호출 응답 구조 그대로:

```json
{
  "response": {
    "header": { "resultCode": "00", "resultMsg": "NORMAL SERVICE" },
    "body": {
      "items": {
        "item": [
          { "kaptCode": "A10023070", "kaptName": "잠실 센트럴파크", "bjdCode": "1171010100", "as1": "서울특별시", "as2": "송파구", "as3": "잠실동", "as4": null },
          { "kaptCode": "A13822002", "kaptName": "잠실동트리지움", "bjdCode": "1171010100", "as1": "서울특별시", "as2": "송파구", "as3": "잠실동", "as4": null }
        ]
      },
      "numOfRows": 1000,
      "pageNo": 1,
      "totalCount": 22298
    }
  }
}
```

`tests/ingest/apt-complex/fixtures/apt-basis.json`:

```json
{
  "response": {
    "header": { "resultCode": "00", "resultMsg": "NORMAL SERVICE" },
    "body": {
      "item": {
        "kaptCode": "A10025850",
        "kaptName": "헬리오시티",
        "kaptAddr": "서울특별시 송파구 가락동 99 헬리오시티",
        "codeAptNm": "아파트",
        "codeHeatNm": "지역난방",
        "codeHallNm": "혼합식",
        "kaptDongCnt": "84",
        "kaptdaCnt": 9510,
        "kaptUsedate": "20181228",
        "kaptBcompany": "현대건설,삼성물산,현대산업개발",
        "kaptTel": "024038330",
        "kaptUrl": "heliocity.com",
        "zipcode": "05698",
        "kaptMparea60": 2854,
        "kaptMparea85": 5132,
        "kaptMparea135": 1500,
        "kaptMparea136": 24,
        "kaptTopFloor": "35",
        "kaptBaseFloor": "3",
        "bjdCode": "1171010200"
      }
    }
  }
}
```

`tests/ingest/apt-complex/fixtures/apt-dtl.json`:

```json
{
  "response": {
    "header": { "resultCode": "00", "resultMsg": "NORMAL SERVICE" },
    "body": {
      "item": {
        "kaptCode": "A10025850",
        "kaptName": "헬리오시티",
        "codeMgr": "위탁관리",
        "kaptMgrCnt": "71",
        "codeStr": "철근콘크리트",
        "kaptdPcnt": "0",
        "kaptdPcntu": "12096",
        "kaptdEcnt": "384",
        "kaptdCccnt": "2685",
        "subwayLine": "3호선,8호선,9호선",
        "subwayStation": "송파역",
        "kaptdWtimesub": "5분이내",
        "kaptdWtimebus": "5분이내",
        "groundElChargerCnt": "0",
        "undergroundElChargerCnt": "256",
        "welfareFacility": "관리사무소,노인정,문고,주민공동시설",
        "convenientFacility": "어린이놀이터,휴게시설",
        "educationFacility": "유치원",
        "useYn": "Y"
      }
    }
  }
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`tests/ingest/apt-complex/adapter.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseAptList, parseAptDetail, areaSumMatches } from '@/scripts/ingest/apt-complex/adapter';

const load = (f: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', f), 'utf-8'));
const list = load('apt-list.json');
const basis = load('apt-basis.json');
const dtl = load('apt-dtl.json');

describe('parseAptList', () => {
  it('item을 AptListRow로 매핑하고 totalCount를 반환한다', () => {
    const { rows, totalCount } = parseAptList(list);
    expect(totalCount).toBe(22298);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      kaptCode: 'A10023070',
      kaptName: '잠실 센트럴파크',
      nameNorm: '잠실센트럴파크',
      bjdCode: '1171010100',
      sigunguCode: '11710',
      as3: '잠실동',
    });
  });
  it('sigunguCode는 bjdCode 앞 5자리다', () => {
    expect(parseAptList(list).rows[1].sigunguCode).toBe('11710');
  });
  it('items가 비어 있으면 빈 배열', () => {
    const empty = { response: { body: { items: '', totalCount: 0 } } };
    expect(parseAptList(empty)).toEqual({ rows: [], totalCount: 0 });
  });
  it('item이 객체 하나로 와도 배열로 만든다', () => {
    const one = {
      response: {
        body: {
          items: { item: { kaptCode: 'A1', kaptName: '가나', bjdCode: '1171010100', as3: '잠실동' } },
          totalCount: 1,
        },
      },
    };
    expect(parseAptList(one).rows).toHaveLength(1);
  });
});

describe('parseAptDetail', () => {
  const row = parseAptDetail('A10025850', basis, dtl);

  it('숫자 필드를 Int로 바꾼다(문자열로 오는 것 포함)', () => {
    expect(row.households).toBe(9510);
    expect(row.buildingCount).toBe(84);
    expect(row.topFloor).toBe(35);
    expect(row.parkingUnder).toBe(12096);
    expect(row.elevator).toBe(384);
    expect(row.cctv).toBe(2685);
  });
  it('지상주차 0을 null이 아니라 0으로 둔다', () => {
    expect(row.parkingGround).toBe(0);
    expect(row.evGround).toBe(0);
  });
  it('kaptUsedate(YYYYMMDD)를 Date로 바꾼다', () => {
    expect(row.usedate?.toISOString().slice(0, 10)).toBe('2018-12-28');
  });
  it('면적별 세대수를 담는다', () => {
    expect([row.area60, row.area85, row.area135, row.area136]).toEqual([2854, 5132, 1500, 24]);
  });
  it('useYn을 inUse로 바꾼다', () => {
    expect(row.inUse).toBe(true);
  });
  it('rawJson에 두 응답을 병합해 원본을 보존한다', () => {
    expect(row.rawJson.kaptTel).toBe('024038330');
    expect(row.rawJson.codeMgr).toBe('위탁관리');
  });
  it('빈 문자열·공백은 null로 만든다', () => {
    const blank = { response: { body: { item: { kaptCode: 'A1', kaptUrl: ' ', codeHallNm: '' } } } };
    const r = parseAptDetail('A1', blank, { response: { body: { item: {} } } });
    expect(r.hallType).toBeNull();
    expect(r.households).toBeNull();
  });
  it('useYn이 N이면 inUse=false', () => {
    const off = { response: { body: { item: { kaptCode: 'A1', useYn: 'N' } } } };
    expect(parseAptDetail('A1', { response: { body: { item: {} } } }, off).inUse).toBe(false);
  });
});

describe('areaSumMatches', () => {
  it('네 칸이 다 있고 합이 households와 같으면 true', () => {
    expect(areaSumMatches({ area60: 2854, area85: 5132, area135: 1500, area136: 24, households: 9510 })).toBe(true);
  });
  it('한 칸이라도 null이면 false', () => {
    expect(areaSumMatches({ area60: 2854, area85: 5132, area135: null, area136: 24, households: 9510 })).toBe(false);
  });
  it('합이 1이라도 어긋나면 false — 허용오차 없음', () => {
    expect(areaSumMatches({ area60: 2854, area85: 5132, area135: 1500, area136: 24, households: 9511 })).toBe(false);
  });
  it('households가 null이면 false', () => {
    expect(areaSumMatches({ area60: 1, area85: 1, area135: 1, area136: 1, households: null })).toBe(false);
  });
});
```

- [ ] **Step 3: 실패 확인**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/ingest/apt-complex/adapter.test.ts
```
Expected: FAIL — 모듈 없음

- [ ] **Step 4: `adapter.ts` 구현**

```ts
/**
 * 공동주택 단지정보 API 응답 → 정규화 행. 순수 함수.
 *
 * 숫자 필드가 문자열로 오는 경우가 섞여 있고(kaptDongCnt="84" vs kaptdaCnt=9510),
 * 빈 값이 null·""·" " 세 가지로 온다. 여기서 한 번에 정리한다.
 */
import { normalizeName } from '@/lib/slug';
import type { AptListRow, AptDetailRow } from './types';

type Rec = Record<string, unknown>;

function body(payload: unknown): Rec {
  const p = payload as Rec | undefined;
  const res = p?.response as Rec | undefined;
  return (res?.body as Rec) ?? {};
}

/** null·""·" " 를 전부 null로. 0은 살린다. */
function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function int(v: unknown): number | null {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** "20181228" → Date. 형식이 아니면 null. */
function ymd(v: unknown): Date | null {
  const s = str(v);
  if (!s || !/^\d{8}$/.test(s)) return null;
  const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseAptList(payload: unknown): { rows: AptListRow[]; totalCount: number } {
  const b = body(payload);
  const items = b.items as Rec | string | undefined;
  let raw = typeof items === 'object' && items !== null ? (items as Rec).item : undefined;
  if (raw == null) raw = [];
  const arr = (Array.isArray(raw) ? raw : [raw]) as Rec[];

  const rows: AptListRow[] = [];
  for (const it of arr) {
    const kaptCode = str(it.kaptCode);
    const kaptName = str(it.kaptName);
    const bjdCode = str(it.bjdCode);
    if (!kaptCode || !kaptName || !bjdCode) continue;
    rows.push({
      kaptCode,
      kaptName,
      nameNorm: normalizeName(kaptName),
      bjdCode,
      sigunguCode: bjdCode.slice(0, 5),
      as3: str(it.as3),
    });
  }
  return { rows, totalCount: int(b.totalCount) ?? 0 };
}

export function parseAptDetail(kaptCode: string, basis: unknown, dtl: unknown): AptDetailRow {
  const b = (body(basis).item as Rec) ?? {};
  const d = (body(dtl).item as Rec) ?? {};
  const merged: Rec = { ...b, ...d };

  return {
    kaptCode,
    households: int(b.kaptdaCnt),
    buildingCount: int(b.kaptDongCnt),
    usedate: ymd(b.kaptUsedate),
    hallType: str(b.codeHallNm),
    heatType: str(b.codeHeatNm),
    aptKind: str(b.codeAptNm),
    topFloor: int(b.kaptTopFloor),
    baseFloor: int(b.kaptBaseFloor),
    area60: int(b.kaptMparea60),
    area85: int(b.kaptMparea85),
    area135: int(b.kaptMparea135),
    area136: int(b.kaptMparea136),
    parkingGround: int(d.kaptdPcnt),
    parkingUnder: int(d.kaptdPcntu),
    subwayLine: str(d.subwayLine),
    subwayStation: str(d.subwayStation),
    walkSubway: str(d.kaptdWtimesub),
    walkBus: str(d.kaptdWtimebus),
    evGround: int(d.groundElChargerCnt),
    evUnder: int(d.undergroundElChargerCnt),
    elevator: int(d.kaptdEcnt),
    cctv: int(d.kaptdCccnt),
    builder: str(b.kaptBcompany),
    welfareFacility: str(d.welfareFacility),
    convenientFacility: str(d.convenientFacility),
    educationFacility: str(d.educationFacility),
    // useYn이 없으면 사용중으로 본다(대다수 응답에 필드가 없다).
    inUse: str(d.useYn) !== 'N',
    rawJson: merged,
  };
}

/**
 * 면적별 세대수를 비율로 쓸 수 있는지. **허용오차 없음.**
 * 완화(±1 또는 ≤0.1%)는 audit 리포트의 분포를 본 뒤 별도로 결정한다.
 */
export function areaSumMatches(
  row: Pick<AptDetailRow, 'area60' | 'area85' | 'area135' | 'area136' | 'households'>,
): boolean {
  const parts = [row.area60, row.area85, row.area135, row.area136];
  if (parts.some((p) => p == null) || row.households == null) return false;
  return parts.reduce((a, b) => a! + b!, 0) === row.households;
}
```

- [ ] **Step 5: 통과 확인 + 커밋**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/ingest/apt-complex/adapter.test.ts
```
Expected: PASS

```bash
git add scripts/ingest/apt-complex/adapter.ts tests/ingest/apt-complex/
git commit -m "feat(apt-complex): 응답 어댑터

숫자가 문자열로 오는 필드가 섞여 있고 빈 값이 세 형태(null/''/' ')로 온다.
지상주차 0은 null이 아니라 0으로 살린다 — '전면 지하주차'라는 정보다.
면적 합 검산은 허용오차 없이 시작한다."
```

---

## Task 5: 목록 수집 (`--mode=list`)

**Files:**
- Create: `scripts/ingest/apt-complex/runner.ts`

**Interfaces:**
- Consumes: `fetchAptListPage`, `parseAptList`, `APT_COMPLEX_SOURCE`
- Produces: `runList(): Promise<number>` — upsert한 행 수

- [ ] **Step 1: `runner.ts`에 목록 모드를 만든다**

```ts
/**
 * 공동주택 단지정보 수집·매칭 러너.
 *
 *   pnpm exec dotenv -e .env.local -- tsx scripts/ingest/apt-complex/runner.ts --mode=list
 *   pnpm exec dotenv -e .env.local -- tsx scripts/ingest/apt-complex/runner.ts --mode=detail [--limit=N]
 *   pnpm exec dotenv -e .env.local -- tsx scripts/ingest/apt-complex/runner.ts --mode=audit
 *   pnpm exec dotenv -e .env.local -- tsx scripts/ingest/apt-complex/runner.ts --mode=match
 *
 * audit은 읽기 전용이다. match 전에 반드시 audit을 눈으로 확인한다.
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { fetchAptListPage } from './http';
import { parseAptList } from './adapter';
import { APT_COMPLEX_SOURCE } from './types';

const LIST_PAGE_SIZE = 1000;
const MAX_LIST_PAGES = 50; // 22,298건 기준 23페이지. 안전장치.

/**
 * 목록 upsert. 스냅샷 교체(deleteMany+createMany)를 쓰지 않는다 —
 * 목록 재수집이 이미 채운 상세 필드를 날려버린다.
 */
export async function runList(): Promise<number> {
  let pageNo = 1;
  let upserted = 0;
  let totalCount = 0;

  while (pageNo <= MAX_LIST_PAGES) {
    const payload = await fetchAptListPage(pageNo, LIST_PAGE_SIZE);
    const { rows, totalCount: tc } = parseAptList(payload);
    if (tc > 0) totalCount = tc;
    if (rows.length === 0) break;

    for (const r of rows) {
      await prisma.aptComplex.upsert({
        where: { kaptCode: r.kaptCode },
        create: r,
        update: {
          kaptName: r.kaptName,
          nameNorm: r.nameNorm,
          bjdCode: r.bjdCode,
          sigunguCode: r.sigunguCode,
          as3: r.as3,
        },
      });
      upserted++;
    }
    logger.info({ pageNo, rows: rows.length, upserted, totalCount }, 'apt-complex list page');
    if (upserted >= totalCount) break;
    pageNo++;
  }

  // API 일시 오류로 목록이 통째로 비는 사고를 막는다.
  if (upserted === 0) throw new Error('parsed 0 rows — refusing to proceed');
  return upserted;
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=')[1];
}

async function main(): Promise<void> {
  const mode = arg('mode') ?? 'audit';
  const run = await prisma.ingestionRun.create({
    data: { source: APT_COMPLEX_SOURCE, targetKey: mode, status: 'RUNNING' },
  });
  try {
    let rows = 0;
    if (mode === 'list') {
      rows = await runList();
    } else {
      throw new Error(`unknown or not-yet-implemented mode: ${mode}`);
    }
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: rows, finishedAt: new Date() },
    });
    logger.info({ mode, rows }, 'apt-complex done');
    await notify('info', `apt-complex ${mode} complete`, { rows });
  } catch (err) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
    });
    logger.error({ err, mode }, 'apt-complex failed');
    await notify('error', `apt-complex ${mode} failed`, { err: String(err) });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// 직접 실행될 때만 main() (테스트 import 시 실행 방지)
if (process.argv[1] && process.argv[1].includes('apt-complex/runner')) {
  main().catch((err) => {
    logger.error({ err }, 'apt-complex runner fatal');
    process.exit(1);
  });
}
```

- [ ] **Step 2: 타입체크**

```bash
pnpm typecheck && pnpm lint
```
Expected: 둘 다 통과

- [ ] **Step 3: 로컬에서 1페이지만 실전 실행**

`MAX_LIST_PAGES`를 임시로 `1`로 바꾸고 실행한다.

```bash
pnpm exec dotenv -e .env.local -- tsx scripts/ingest/apt-complex/runner.ts --mode=list
```
Expected: 로그에 `rows: 1000`, DB `AptComplex` 1,000행. 확인 후 `MAX_LIST_PAGES`를 `50`으로 되돌린다.

```bash
docker exec -i imjang-on-db psql -U imjang -d imjang_on -c 'SELECT count(*), count(DISTINCT "sigunguCode") FROM "AptComplex";'
```

- [ ] **Step 4: 커밋**

```bash
git add scripts/ingest/apt-complex/runner.ts
git commit -m "feat(apt-complex): 목록 수집 모드

스냅샷 교체가 아니라 upsert다 — 목록 재수집이 이미 채운 상세를 날리면 안 된다.
0건이면 거부해 API 일시 오류로 테이블이 비는 사고를 막는다."
```

---

## Task 6: 상세 수집 (`--mode=detail`)

**Files:**
- Modify: `scripts/ingest/apt-complex/runner.ts`

**Interfaces:**
- Consumes: `fetchAptBasis`, `fetchAptDetail`, `parseAptDetail`, `QuotaExceededError`
- Produces: `runDetail(limit?: number): Promise<number>`

- [ ] **Step 1: `runDetail`을 추가한다**

`runner.ts`의 import에 추가:

```ts
import { fetchAptListPage, fetchAptBasis, fetchAptDetail, QuotaExceededError } from './http';
import { parseAptList, parseAptDetail } from './adapter';
```

`runList` 아래에 함수를 추가:

```ts
/**
 * 상세 수집. 대상은 `fetchedAt IS NULL`(미수집분)이라 며칠에 걸쳐 나눠 돌려도 수렴한다.
 * 한도 초과를 만나면 즉시 중단한다 — 계속 두드리면 차단당한다.
 */
export async function runDetail(limit?: number): Promise<number> {
  const targets = await prisma.aptComplex.findMany({
    where: { fetchedAt: null },
    select: { kaptCode: true },
    orderBy: { kaptCode: 'asc' },
    ...(limit ? { take: limit } : {}),
  });
  logger.info({ targets: targets.length }, 'apt-complex detail targets');

  let done = 0;
  for (const { kaptCode } of targets) {
    try {
      const [basis, dtl] = [await fetchAptBasis(kaptCode), await fetchAptDetail(kaptCode)];
      const row = parseAptDetail(kaptCode, basis, dtl);
      const { kaptCode: _omit, rawJson, ...fields } = row;
      await prisma.aptComplex.update({
        where: { kaptCode },
        data: { ...fields, rawJson: rawJson as object, fetchedAt: new Date() },
      });
      done++;
      if (done % 500 === 0) logger.info({ done, of: targets.length }, 'apt-complex detail progress');
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        logger.warn({ done, remaining: targets.length - done }, 'quota exceeded — stopping');
        await notify('warn', 'apt-complex detail 한도 초과로 중단', {
          done,
          remaining: targets.length - done,
        });
        break;
      }
      // 단건 실패는 건너뛴다. fetchedAt이 그대로 NULL이라 다음 회차에 재시도된다.
      logger.warn({ err, kaptCode }, 'apt-complex detail skip');
    }
  }
  return done;
}
```

`main()`의 분기에 추가:

```ts
    if (mode === 'list') {
      rows = await runList();
    } else if (mode === 'detail') {
      const limit = arg('limit') ? Number(arg('limit')) : undefined;
      rows = await runDetail(Number.isFinite(limit) ? limit : undefined);
    } else {
```

- [ ] **Step 2: 타입체크·린트**

```bash
pnpm typecheck && pnpm lint
```
Expected: 통과

- [ ] **Step 3: 소량 실전 실행**

```bash
pnpm exec dotenv -e .env.local -- tsx scripts/ingest/apt-complex/runner.ts --mode=detail --limit=20
```
Expected: 20건 채워짐. 확인:

```bash
docker exec -i imjang-on-db psql -U imjang -d imjang_on -c \
 'SELECT "kaptCode", "kaptName", households, "buildingCount", "topFloor", "parkingUnder", "inUse" FROM "AptComplex" WHERE "fetchedAt" IS NOT NULL LIMIT 10;'
```

값이 비어 있으면 어댑터의 필드명을 실제 응답과 대조한다(`rawJson`을 열어 확인).

- [ ] **Step 4: 재개가 되는지 확인**

같은 명령을 한 번 더 돌린다. 이미 채운 20건은 대상에서 빠지고 **다음 20건**이 채워져야 한다.

```bash
pnpm exec dotenv -e .env.local -- tsx scripts/ingest/apt-complex/runner.ts --mode=detail --limit=20
docker exec -i imjang-on-db psql -U imjang -d imjang_on -c 'SELECT count(*) FROM "AptComplex" WHERE "fetchedAt" IS NOT NULL;'
```
Expected: 40

- [ ] **Step 5: 커밋**

```bash
git add scripts/ingest/apt-complex/runner.ts
git commit -m "feat(apt-complex): 상세 수집 모드

대상이 fetchedAt IS NULL이라 며칠에 걸쳐 나눠 돌려도 수렴한다.
일일 한도를 하드코딩하지 않고 API의 한도 초과 응답을 감지해 중단한다."
```

---

## Task 7: 매칭 audit (`--mode=audit`, 읽기 전용)

**Files:**
- Modify: `scripts/ingest/apt-complex/runner.ts`

**Interfaces:**
- Consumes: `decideMatch`, `MatchCandidate` from `./match`, `areaSumMatches` from `./adapter`
- Produces: `runMatch(opts: { apply: boolean }): Promise<number>` — 확정 매칭 수

- [ ] **Step 1: 매칭 로직을 추가한다 (audit과 apply가 같은 코드를 쓴다)**

import에 추가:

```ts
import { decideMatch, type MatchCandidate } from './match';
import { areaSumMatches } from './adapter';
```

함수 추가:

```ts
/**
 * 매칭. `apply=false`면 아무것도 쓰지 않고 리포트만 낸다.
 * audit과 실행이 **같은 코드 경로**를 쓰는 것이 핵심이다 — 리포트에서 본 것이 곧 반영된다.
 */
export async function runMatch(opts: { apply: boolean }): Promise<number> {
  // 재실행 시 unique 충돌을 막는다. 이전 회차에서 단지 B가 잡고 있던 propertyId를
  // 이번 회차에 단지 A가 가져가는 경우, A를 먼저 쓰면 B의 기존 값과 부딪힌다.
  // 전량 해제 후 다시 배정한다. 해제 전에 이전 매칭을 기록해 둔다 —
  // 이번에 떨어진 Property의 역채움 값을 되돌리기 위해서다(§5.4 stale 정리).
  let previouslyMatched: bigint[] = [];
  if (opts.apply) {
    previouslyMatched = (
      await prisma.aptComplex.findMany({
        where: { propertyId: { not: null } },
        select: { propertyId: true },
      })
    ).map((r) => r.propertyId!);
    await prisma.aptComplex.updateMany({
      where: { propertyId: { not: null } },
      data: { propertyId: null, matchTier: null, matchedAt: null },
    });
  }

  const complexes = await prisma.aptComplex.findMany({
    where: { inUse: true },
    select: { kaptCode: true, kaptName: true, as3: true, sigunguCode: true, households: true,
              buildingCount: true, area60: true, area85: true, area135: true, area136: true,
              fetchedAt: true, hallType: true, topFloor: true, parkingUnder: true,
              evUnder: true, elevator: true, cctv: true, subwayLine: true },
    orderBy: { kaptCode: 'asc' },
  });

  // 시군구별 Property 후보를 한 번에 올린다(단지마다 쿼리하면 22,298회다).
  const props = await prisma.property.findMany({
    where: { propertyType: 'APARTMENT', redirectToId: null },
    select: { id: true, nameNorm: true, address: true, sigunguCode: true },
  });
  const bySgg = new Map<string, MatchCandidate[]>();
  for (const p of props) {
    if (!p.sigunguCode) continue;
    const list = bySgg.get(p.sigunguCode) ?? [];
    list.push({ id: p.id, nameNorm: p.nameNorm, address: p.address });
    bySgg.set(p.sigunguCode, list);
  }

  let tier1 = 0, tier2 = 0, unmatched = 0, areaOk = 0, fetched = 0;
  const tier2Samples: string[] = [];
  const unmatchedSamples: string[] = [];
  const taken = new Set<string>(); // propertyId — @unique 위반을 쓰기 전에 막는다

  // 스펙 §6.3 — 표본 36개로 재던 채움률을 전수로 대체한다.
  const FILL_FIELDS = ['households', 'buildingCount', 'hallType', 'topFloor',
                       'parkingUnder', 'evUnder', 'elevator', 'cctv', 'subwayLine'] as const;
  const fill = new Map<string, number>(FILL_FIELDS.map((f) => [f, 0]));

  for (const c of complexes) {
    if (areaSumMatches(c)) areaOk++;
    if (c.fetchedAt) {
      fetched++;
      for (const f of FILL_FIELDS) {
        if (c[f] != null) fill.set(f, (fill.get(f) ?? 0) + 1);
      }
    }
    const candidates = bySgg.get(c.sigunguCode) ?? [];
    const r = decideMatch({ kaptName: c.kaptName, as3: c.as3 }, candidates);

    // 미매칭은 쓸 것이 없다 — 위에서 전량 해제했으므로 그대로 두면 null이다.
    if (!r || taken.has(String(r.propertyId))) {
      unmatched++;
      if (unmatchedSamples.length < 20) unmatchedSamples.push(`${c.kaptName}(${c.as3 ?? '-'}) [${c.sigunguCode}]`);
      continue;
    }

    taken.add(String(r.propertyId));
    if (r.tier === 1) tier1++;
    else {
      tier2++;
      if (tier2Samples.length < 40) {
        const p = candidates.find((x) => x.id === r.propertyId)!;
        tier2Samples.push(`${c.kaptName}(${c.as3 ?? '-'}) → ${p.nameNorm} / ${p.address}`);
      }
    }

    if (opts.apply) {
      await prisma.aptComplex.update({
        where: { kaptCode: c.kaptCode },
        data: { propertyId: r.propertyId, matchTier: r.tier, matchedAt: new Date() },
      });
      // 역채움 — API 값이 null이면 기존 값을 덮어쓰지 않는다.
      const data: { households?: number; buildingCount?: number } = {};
      if (c.households != null) data.households = c.households;
      if (c.buildingCount != null) data.buildingCount = c.buildingCount;
      if (Object.keys(data).length > 0) {
        await prisma.property.update({ where: { id: r.propertyId }, data });
      }
    }
  }

  // 이번에 매칭이 떨어진 Property의 역채움 값을 되돌린다.
  // households의 유일한 출처가 이 ETL이므로, 매칭이 사라지면 근거도 사라진다.
  // 안 지우면 잘못된 매칭으로 들어간 값이 조용히 남는다.
  if (opts.apply) {
    const stale = previouslyMatched.filter((id) => !taken.has(String(id)));
    if (stale.length > 0) {
      await prisma.property.updateMany({
        where: { id: { in: stale } },
        data: { households: null, buildingCount: null },
      });
      logger.info({ stale: stale.length }, 'apt-complex 역채움 되돌림');
    }
  }

  const matched = tier1 + tier2;
  console.log(`\n=== apt-complex ${opts.apply ? 'MATCH (적용)' : 'AUDIT (읽기 전용)'} ===`);
  console.log(`단지 ${complexes.length} / 아파트 Property ${props.length}`);
  console.log(`확정 ${matched} (${pct(matched, complexes.length)}) — Tier1 ${tier1} · Tier2 ${tier2}`);
  console.log(`미매칭 ${unmatched} (${pct(unmatched, complexes.length)})`);
  console.log(`면적 4칸 완비 + 합 일치: ${areaOk} (${pct(areaOk, complexes.length)})`);
  console.log(`\n--- 필드 채움률 (상세 수집분 ${fetched}건 기준) ---`);
  for (const f of FILL_FIELDS) {
    console.log(`  ${f.padEnd(14)} ${String(fill.get(f) ?? 0).padStart(6)}  ${pct(fill.get(f) ?? 0, fetched)}`);
  }
  console.log(`\n--- Tier2 표본(육안 검수용) ---`);
  tier2Samples.forEach((s) => console.log('  ' + s));
  console.log(`\n--- 미매칭 표본 ---`);
  unmatchedSamples.forEach((s) => console.log('  ' + s));
  return matched;
}

function pct(n: number, d: number): string {
  return d === 0 ? '0%' : `${Math.round((n / d) * 100)}%`;
}
```

`main()` 분기에 추가:

```ts
    } else if (mode === 'audit') {
      rows = await runMatch({ apply: false });
    } else if (mode === 'match') {
      rows = await runMatch({ apply: true });
    } else {
```

- [ ] **Step 2: 타입체크·린트**

```bash
pnpm typecheck && pnpm lint
```
Expected: 통과

- [ ] **Step 3: 로컬 audit 실행**

Task 5·6에서 적재한 소량 데이터로 돈다.

```bash
pnpm exec dotenv -e .env.local -- tsx scripts/ingest/apt-complex/runner.ts --mode=audit
```
Expected: 리포트가 출력되고 **DB는 변하지 않는다.** 확인:

```bash
docker exec -i imjang-on-db psql -U imjang -d imjang_on -c 'SELECT count(*) FROM "AptComplex" WHERE "propertyId" IS NOT NULL;'
```
Expected: 0

- [ ] **Step 4: 커밋**

```bash
git add scripts/ingest/apt-complex/runner.ts
git commit -m "feat(apt-complex): 매칭 audit·실행

audit과 실행이 같은 코드 경로를 쓴다 — 리포트에서 본 것이 그대로 반영된다.
apply=false면 아무것도 쓰지 않는다. propertyId 중복은 쓰기 전에 taken 집합으로 막는다."
```

---

## Task 8: 매칭 통합 테스트

**Files:**
- Test: `tests/ingest/apt-complex/match-db.test.ts`

**Interfaces:**
- Consumes: `runMatch` from `@/scripts/ingest/apt-complex/runner`

- [ ] **Step 1: 통합 테스트를 쓴다**

`Property.sigunguCode`는 생성 컬럼이라 insert할 수 없다. `regionCode`로 유도한다.

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';
import { runMatch } from '@/scripts/ingest/apt-complex/runner';
import { assertLocalDatabase } from '../../_helpers/assert-local-db';

// 공유 로컬 DB에 병렬로 붙으므로 이 파일이 쓰는 코드로만 좁혀 지운다.
const REGION = '2726010100'; // 대구 수성구 범어동
const SGG = '27260';
const KAPT = ['TEST_A1', 'TEST_A2', 'TEST_A3'];

async function seedRegion() {
  await prisma.region.upsert({
    where: { code: REGION },
    create: { code: REGION, sido: '대구광역시', sigungu: '수성구', eupmyeondong: '범어동',
              fullName: '대구광역시 수성구 범어동', level: 3, sourceVersion: 'test' },
    update: {},
  });
}

describe('apt-complex 매칭 (DB)', () => {
  beforeEach(async () => {
    assertLocalDatabase();
    await prisma.aptComplex.deleteMany({ where: { kaptCode: { in: KAPT } } });
    await prisma.property.deleteMany({ where: { regionCode: REGION } });
    await seedRegion();
  });

  it('Tier1 완전일치로 붙고 households를 역채움한다', async () => {
    const p = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '범어에일린의뜰',
              nameNorm: '범어에일린의뜰', regionCode: REGION, address: '범어동 2272' },
    });
    await prisma.aptComplex.create({
      data: { kaptCode: KAPT[0], kaptName: '범어에일린의뜰', nameNorm: '범어에일린의뜰',
              bjdCode: REGION, sigunguCode: SGG, as3: '범어동', households: 400, buildingCount: 5 },
    });

    await runMatch({ apply: true });

    const c = await prisma.aptComplex.findUnique({ where: { kaptCode: KAPT[0] } });
    expect(c?.propertyId).toBe(p.id);
    expect(c?.matchTier).toBe(1);
    const after = await prisma.property.findUnique({ where: { id: p.id } });
    expect(after?.households).toBe(400);
    expect(after?.buildingCount).toBe(5);
  });

  it('동명이 다르면 붙지 않는다', async () => {
    await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '수성아이파크',
              nameNorm: '수성아이파크', regionCode: REGION, address: '파동 1000' },
    });
    await prisma.aptComplex.create({
      data: { kaptCode: KAPT[1], kaptName: '범어아이파크', nameNorm: '범어아이파크',
              bjdCode: REGION, sigunguCode: SGG, as3: '범어동', households: 300 },
    });

    await runMatch({ apply: true });

    const c = await prisma.aptComplex.findUnique({ where: { kaptCode: KAPT[1] } });
    expect(c?.propertyId).toBeNull();
    expect(c?.matchTier).toBeNull();
  });

  it('API households가 null이면 기존 값을 덮어쓰지 않는다', async () => {
    const p = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '범어숲화성파크드림',
              nameNorm: '범어숲화성파크드림', regionCode: REGION, address: '범어동 300',
              households: 999 },
    });
    await prisma.aptComplex.create({
      data: { kaptCode: KAPT[2], kaptName: '범어숲화성파크드림', nameNorm: '범어숲화성파크드림',
              bjdCode: REGION, sigunguCode: SGG, as3: '범어동', households: null },
    });

    await runMatch({ apply: true });

    const after = await prisma.property.findUnique({ where: { id: p.id } });
    expect(after?.households).toBe(999);
  });

  it('매칭이 떨어지면 역채움 값을 되돌린다', async () => {
    const p = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '범어에일린의뜰',
              nameNorm: '범어에일린의뜰', regionCode: REGION, address: '범어동 2272' },
    });
    await prisma.aptComplex.create({
      data: { kaptCode: KAPT[0], kaptName: '범어에일린의뜰', nameNorm: '범어에일린의뜰',
              bjdCode: REGION, sigunguCode: SGG, as3: '범어동', households: 400, buildingCount: 5 },
    });
    await runMatch({ apply: true });
    expect((await prisma.property.findUnique({ where: { id: p.id } }))?.households).toBe(400);

    // 단지명을 바꿔 더는 매칭되지 않게 만든 뒤 다시 돌린다.
    await prisma.aptComplex.update({
      where: { kaptCode: KAPT[0] },
      data: { kaptName: '전혀다른이름단지', nameNorm: '전혀다른이름단지' },
    });
    await runMatch({ apply: true });

    const after = await prisma.property.findUnique({ where: { id: p.id } });
    expect(after?.households).toBeNull();
    expect(after?.buildingCount).toBeNull();
  });

  it('audit 모드는 아무것도 쓰지 않는다', async () => {
    await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '범어에일린의뜰',
              nameNorm: '범어에일린의뜰', regionCode: REGION, address: '범어동 2272' },
    });
    await prisma.aptComplex.create({
      data: { kaptCode: KAPT[0], kaptName: '범어에일린의뜰', nameNorm: '범어에일린의뜰',
              bjdCode: REGION, sigunguCode: SGG, as3: '범어동', households: 400 },
    });

    await runMatch({ apply: false });

    const c = await prisma.aptComplex.findUnique({ where: { kaptCode: KAPT[0] } });
    expect(c?.propertyId).toBeNull();
  });
});
```

- [ ] **Step 2: 실행**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/ingest/apt-complex/match-db.test.ts
```
Expected: PASS 5개.

실패하면 `runMatch`가 `runner.ts`에서 export되고 있는지, `main()` 자동 실행 가드가 테스트 import를 막는지 확인한다.

- [ ] **Step 3: 전체 유닛 스위트 확인**

```bash
pnpm test:unit
```
Expected: 기존 1,349개 + 신규가 모두 통과

- [ ] **Step 4: 커밋**

```bash
git add tests/ingest/apt-complex/match-db.test.ts
git commit -m "test(apt-complex): 매칭 통합 테스트

Property.sigunguCode는 생성 컬럼이라 regionCode로 유도한다.
공유 DB 병렬 실행이라 이 파일이 쓰는 코드로만 좁혀 지운다."
```

---

## Task 9: 측정 게이트

**Files:**
- Create: `scripts/ops/measure-narrative-index.ts`

**Interfaces:**
- Consumes: `loadAptInsight` from `@/lib/insights/apt-loader`, `isNarrativeIndexable` from `@/lib/seo/indexable`
- Produces: 읽기 전용 리포트. 반환값 없음

- [ ] **Step 1: 스크립트를 만든다**

44,479개에 대해 narrative를 전부 돌리면 페이지당 여러 쿼리라 비현실적이다. 두 갈래로 나눈다 — **역채움 영향은 SQL로 증명하고, 화이트리스트 영향은 표본으로 추정한다.**

```ts
/**
 * 색인 영향 측정. **읽기 전용.** 매칭·역채움 전후로 돌려 비교한다.
 *
 *   pnpm exec dotenv -e .env.local -- tsx scripts/ops/measure-narrative-index.ts
 *
 * 두 가지를 잰다.
 *  (1) 역채움이 fired 개수를 늘리는가 — SQL로 증명. 기대값 0.
 *  (2) INDEX_SIGNAL_KEYS 화이트리스트로 바꾸면 몇 개가 색인에서 빠지는가 — 표본 추정.
 */
import { prisma } from '@/lib/db';
import { loadAptInsight } from '@/lib/insights/apt-loader';
import { isNarrativeIndexable } from '@/lib/seo/indexable';

/** 후속 스펙이 쓸 화이트리스트. 실거래 기반 신호만. */
const INDEX_SIGNAL_KEYS = ['trend', 'peer', 'floor', 'flags'];
const SAMPLE_SIZE = 2000;

async function main() {
  // (1) bScale은 builtYear나 households 중 하나만 있어도 발화한다.
  //     builtYear가 없는 아파트가 0이면 역채움으로 새로 발화하는 페이지는 존재할 수 없다.
  const noBuiltYear = await prisma.property.count({
    where: { propertyType: 'APARTMENT', redirectToId: null, builtYear: null },
  });
  console.log('=== (1) 역채움의 색인 영향 ===');
  console.log(`builtYear가 없는 아파트: ${noBuiltYear}`);
  console.log(
    noBuiltYear === 0
      ? '→ bScale은 이미 100% 발화 중. households 역채움으로 fired가 늘어나는 페이지는 0건이다. ✅'
      : `→ ⚠️ ${noBuiltYear}건은 역채움으로 새로 발화할 수 있다. 스펙의 전제가 깨졌으므로 중단하고 재검토할 것.`,
  );

  // (2) 화이트리스트 전환 시뮬레이션 — 표본.
  const sample = await prisma.$queryRaw<{ id: bigint }[]>`
    SELECT id FROM "Property"
    WHERE "propertyType" = 'APARTMENT' AND "redirectToId" IS NULL
    ORDER BY id
    LIMIT ${SAMPLE_SIZE}
  `;
  let nowIndexable = 0;
  let stillIndexable = 0;
  const keyCount = new Map<string, number>();

  for (const { id } of sample) {
    const { narrative } = await loadAptInsight(id).catch(() => ({ narrative: null }));
    if (!narrative) continue;
    for (const k of narrative.fired) keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
    if (!isNarrativeIndexable(narrative, 3)) continue;
    nowIndexable++;
    const signals = narrative.fired.filter((k) => INDEX_SIGNAL_KEYS.includes(k)).length;
    if (signals >= 3) stillIndexable++;
  }

  console.log('\n=== (2) 화이트리스트 전환 영향 (표본 ' + sample.length + ') ===');
  console.log(`현재 색인 대상: ${nowIndexable}`);
  console.log(`전환 후 유지:   ${stillIndexable}`);
  console.log(`색인에서 빠짐: ${nowIndexable - stillIndexable} (표본 대비 ${
    nowIndexable ? Math.round(((nowIndexable - stillIndexable) / nowIndexable) * 100) : 0
  }%)`);
  console.log('\n모듈별 발화 수:');
  for (const [k, v] of [...keyCount].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(8)} ${v}`);
  }
  console.log('\n⚠️ 표본 추정이다. 전수가 아니므로 후속 스펙에서 규모를 다시 확인할 것.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: 타입체크·린트**

```bash
pnpm typecheck && pnpm lint
```
Expected: 통과

- [ ] **Step 3: 커밋**

```bash
git add scripts/ops/measure-narrative-index.ts
git commit -m "feat(ops): 색인 영향 측정 게이트

역채움 영향은 SQL로 증명한다 — builtYear가 전량 있으면 bScale이 이미 100%
발화 중이라 households 역채움으로 fired가 늘 수 없다. 0이 아니면 전제가 깨진 것이다.
화이트리스트 전환 영향은 narrative를 표본으로 돌려 추정한다."
```

---

## Task 10: 워크플로

**Files:**
- Create: `.github/workflows/ingest-apt-complex.yml`

- [ ] **Step 1: 워크플로를 만든다**

```yaml
name: ingest-apt-complex

# cron을 걸지 않는다. 세대수·동수·준공일은 거의 변하지 않고
# 44,596회를 정기적으로 태울 이유가 없다. 갱신은 분기 1회 수동으로 충분하다.
on:
  workflow_dispatch:
    inputs:
      mode:
        description: 'list | detail | audit | match'
        required: true
        default: 'audit'
        type: choice
        options: [list, detail, audit, match]
      limit:
        description: 'detail 모드 1회 처리 건수 (비우면 전량)'
        required: false
        type: string

jobs:
  ingest:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      DIRECT_URL: ${{ secrets.DIRECT_URL }}
      PUBLIC_DATA_KEY: ${{ secrets.PUBLIC_DATA_KEY }}
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
      LOG_LEVEL: info
      PRISMA_INGEST: '1'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma generate
      - name: run
        run: |
          ARGS="--mode=${{ inputs.mode }}"
          if [ -n "${{ inputs.limit }}" ]; then ARGS="$ARGS --limit=${{ inputs.limit }}"; fi
          pnpm tsx scripts/ingest/apt-complex/runner.ts $ARGS
        timeout-minutes: 180
```

`REVALIDATE_TOKEN`을 **넣지 않는다.** 이 계획은 재검증하지 않는다.

- [ ] **Step 2: 커밋**

```bash
git add .github/workflows/ingest-apt-complex.yml
git commit -m "ci(apt-complex): 수집 워크플로

workflow_dispatch 전용. cron 없음.
REVALIDATE_TOKEN을 주지 않는다 — 이 단계는 화면에 아무것도 노출하지 않는다."
```

---

## Task 11: 운영 실행과 검증

코드가 아니라 **운영 절차**다. 각 단계마다 사람이 결과를 보고 다음으로 넘어간다.

- [ ] **Step 1: 마이그레이션을 운영에 적용**

이 저장소는 배포가 마이그레이션을 자동 적용하지 않는다. 머지 **전에** 수동으로 적용한다.

```bash
ssh -f -N -L 55432:127.0.0.1:5432 ubuntu@<box>
# .env.prod.local 에 터널 DATABASE_URL (반드시 .env.*.local — .gitignore 대상)
pnpm exec dotenv -e .env.prod.local -- prisma migrate status
pnpm exec dotenv -e .env.prod.local -- prisma migrate deploy
```

- [ ] **Step 2: 측정 게이트 — 사전값**

```bash
pnpm exec dotenv -e .env.prod.local -- tsx scripts/ops/measure-narrative-index.ts | tee before.txt
```
`builtYear가 없는 아파트: 0`이어야 한다. **0이 아니면 여기서 멈추고 스펙을 재검토한다.**

- [ ] **Step 3: 목록 수집**

Actions에서 `mode=list` 실행. 약 23회 호출.

```sql
SELECT count(*) FROM "AptComplex";  -- 기대: 약 22,298
```

- [ ] **Step 4: 상세 수집**

Actions에서 `mode=detail` (limit 비움). 약 90분.

```sql
SELECT count(*) FILTER (WHERE "fetchedAt" IS NOT NULL) AS fetched, count(*) AS total FROM "AptComplex";
```
한도 초과로 중단됐으면 Discord 알림이 온다. 그때는 같은 명령을 다시 돌린다.

- [ ] **Step 5: audit — 사람이 눈으로 보는 관문**

Actions에서 `mode=audit`. 로그에서 확인할 것:

- 확정 매칭률이 **50% 안팎**인가 (표본 실측 55%)
- **Tier2 표본 40건에 오매칭이 있는가** — 동명이 어긋난 쌍이 하나라도 보이면 중단하고 `match.ts`를 고친다
- 미매칭 표본이 납득되는가 (소규모 단지·표기 차이)
- 면적 4칸 완비율이 60% 안팎인가

**여기가 되돌릴 수 없는 지점 직전이다.** 이상하면 진행하지 않는다.

- [ ] **Step 6: 매칭 실행 + 역채움**

Actions에서 `mode=match`.

```sql
SELECT "matchTier", count(*) FROM "AptComplex" GROUP BY 1 ORDER BY 1;
SELECT count(households) AS filled FROM "Property" WHERE "propertyType"='APARTMENT' AND "redirectToId" IS NULL;
```

- [ ] **Step 7: 측정 게이트 — 사후값**

```bash
pnpm exec dotenv -e .env.prod.local -- tsx scripts/ops/measure-narrative-index.ts | tee after.txt
diff before.txt after.txt
```

**(2)의 `현재 색인 대상` 숫자가 before와 같아야 한다.** 늘었으면 스펙의 전제가 깨진 것이므로 후속 스펙을 짜기 전에 원인을 찾는다.

- [ ] **Step 8: 정리**

터널을 닫고 `.env.prod.local`을 지운다. 결과(매칭률·tier 분포·색인 변화)를 스펙 문서 하단에 실측 기록으로 추가한다.

---

## 다음 스펙 — UI

이 계획은 화면을 만들지 않는다. UI는 별도 브레인스토밍이 필요하고, **아직 안 정해진 것이 있다.**

**정해진 것**

- 노출 필드는 1군(세대수·동수·복도유형·면적별 세대수·최고층/지하층·세대당 주차·사용승인일) + 2군(주차 지상/지하·지하철·버스·EV·승강기·CCTV·시공사·부대복리시설)
- 3군(관리방식·경비·청소·소독·구조)과 연락처류는 노출하지 않는다
- 데이터가 풍부한 단지에만 깊게 보여준다
- 원자료가 아니라 비율·밀도·연차로 가공해 보여준다
- `SourceCaption`에 `AptComplex.fetchedAt` 기준일을 표기한다

**안 정해진 것**

1. **레이아웃** — 2026-09-03 세션에서 A(정의목록)·B(타일 그리드)·C(핵심3+목록) 세 안을 그렸으나 선택 기록이 없다
2. **섹션 구성** — 제안된 A~F 6블록을 그대로 갈지, 기존 섹션(면적별 실거래 비교·층 프리미엄)에 녹일지
3. **해석 문장을 `buildAptNarrative`에 넣을지, 별도 컴포넌트로 둘지**
4. **`isNarrativeIndexable` 화이트리스트 전환** — Task 9의 측정값을 보고 규모를 판단해야 한다
5. **결측 단지의 표시** — 절반 가까이가 단지정보가 없다. 섹션을 통째로 숨길지, 있는 값만 보여줄지

**넘기는 계약(스펙 §7)**

> 단지정보에서 파생된 어떤 해석 모듈도 `isNarrativeIndexable` 판정에 들어가지 않는다.
> 색인 신호는 실거래 기반 키(`trend`·`peer`·`floor`·`flags`)의 화이트리스트로만 센다.
