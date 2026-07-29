# 단지 중복 유니크 제약 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 살아 있는 단지에 부분 유니크 인덱스를 걸어 중복 생성을 DB 차원에서 막고, 그 제약에 걸린 `create`를 재조회로 흡수한다.

**Architecture:** Prisma 스키마는 부분 유니크 인덱스를 표현하지 못하므로 raw SQL 마이그레이션으로 만든다(저장소에 GIN·GiST 선례 있음). 제약이 생기면 경합 시 `create`가 P2002로 실패하는데, 그건 형제가 방금 같은 단지를 만들었다는 뜻이므로 잡아서 다시 조회해 그 행을 반환한다.

**Tech Stack:** Prisma, PostgreSQL, vitest, tsx

**설계 문서:** `docs/superpowers/specs/2026-07-29-property-race-dedupe-design.md` §6, §4.2

## Global Constraints

- 이 계획은 스펙의 **C**만 다룬다. A(태스크 순서 반전)와 B(병합 스크립트)는 PR #264로 이미 배포됐고 운영 병합도 끝났다.
- 인덱스 정의는 스펙 §6에서 그대로 가져온다 — 컬럼 4개 순서와 `WHERE` 절을 바꾸지 않는다.
  ```sql
  CREATE UNIQUE INDEX "Property_dedupe_key"
    ON "Property" ("propertyType", "nameNorm", "regionCode", "address")
    WHERE "redirectToId" IS NULL;
  ```
- **`address`를 반드시 포함한다.** 빼면 주소가 다른 그룹(별개 건물이 섞여 있음)이 제약을 위반해 강제 병합을 유발한다.
- **`WHERE "redirectToId" IS NULL` 부분 인덱스여야 한다.** 병합된 패자 2,080행과 2026-07-01 개편 리다이렉트 행이 제약에 걸리면 안 된다.
- **`CONCURRENTLY`를 쓰지 않는다.** Prisma가 마이그레이션 파일을 트랜잭션으로 감싸 실행하므로 동작하지 않는다.
- `findOrCreateProperty`의 기존 `redirectToId: null` 필터 3곳을 제거하지 않는다 — PR #264에서 데이터 손실을 막으려 넣은 것이다.
- 완료 전 `pnpm lint`를 반드시 통과시킨다. `pnpm typecheck`는 미사용 변수를 잡지 못한다(`noUnusedLocals` 없음).

## 배포 전 반드시 확인할 것

`deploy/remote-deploy.sh`가 web 빌드 전에 `prisma migrate deploy`를 자동 실행한다. **중복이 하나라도 남아 있으면 인덱스 생성이 실패해 배포 전체가 죽는다.**

2026-07-29 운영 병합 직후 중복은 0으로 확인됐다(2,008그룹 전량 병합, 실패 0). 그 사이 ETL이 새 중복을 만들지 않았는지 **머지 직전에 다시 재는 절차가 Task 1 Step 7에 있다.**

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `prisma/migrations/20260729000000_add_property_dedupe_unique/migration.sql` | 부분 유니크 인덱스 생성 | 생성 |
| `prisma/schema.prisma` | `Property` 모델에 인덱스 존재를 알리는 주석 | 수정 |
| `scripts/ingest/property-matcher.ts` | `create`의 P2002를 재조회로 흡수 | 수정 |
| `tests/ingest/property-matcher.test.ts` | P2002 경로 통합 테스트 | 수정 |
| `docs/superpowers/specs/2026-07-29-property-race-dedupe-design.md` | §6 말미의 모순 문장 정리 | 수정 |

Task 1이 마이그레이션을 만들고 Task 2가 그 위에서 P2002를 구현한다. **순서를 바꿀 수 없다** — 인덱스가 없으면 P2002가 발생하지 않아 테스트를 쓸 수 없다.

---

### Task 1: 부분 유니크 인덱스 마이그레이션

**Files:**
- Create: `prisma/migrations/20260729000000_add_property_dedupe_unique/migration.sql`
- Modify: `prisma/schema.prisma` (`Property` 모델의 `@@index` 목록 근처)
- Modify: `docs/superpowers/specs/2026-07-29-property-race-dedupe-design.md` (§6 말미)

**Interfaces:**
- Consumes: 없음
- Produces: 인덱스 `Property_dedupe_key`. Task 2가 이 인덱스 때문에 발생하는 P2002를 잡는다.

- [ ] **Step 1: `.env.test`가 로컬 docker DB를 가리키는지 확인**

다음 단계들이 테스트 DB를 비울 수 있으므로, 운영을 가리키고 있지 않은지 먼저 본다.

Run: `grep DATABASE_URL .env.test`
Expected: `localhost:5433`을 포함한다. 아니면 **중단하고 보고한다.**

별도의 중복 조회 스크립트는 만들지 않는다 — Step 4의 마이그레이션이 실패하는 것 자체가 중복 존재의 증거이고, 그때 대응하면 된다.

- [ ] **Step 2: 마이그레이션 파일 작성**

`prisma/migrations/20260729000000_add_property_dedupe_unique/migration.sql` (신규):

```sql
-- 경합으로 인한 단지 중복 생성을 DB 차원에서 차단한다.
--
-- 부분 인덱스인 이유: 병합된 패자와 2026-07-01 행정구역 개편 때 리다이렉트된 구 레코드는
-- 생존자와 (propertyType, nameNorm, regionCode, address)가 동일한 채로 남는다. 유일성이
-- 필요한 것은 살아 있는 단지뿐이다.
--
-- address를 포함하는 이유: 빼면 같은 시군구 안 동명 별개 건물(예: 동신/금동 vs 동신/수송동)이
-- 제약을 위반해 강제 병합을 유발한다. 그건 데이터 손상이다.
--
-- CONCURRENTLY를 쓰지 않는 이유: Prisma가 마이그레이션 파일을 트랜잭션으로 감싸 실행하는데
-- CREATE INDEX CONCURRENTLY는 트랜잭션 안에서 동작하지 않는다. Property는 27만 행대라
-- 일반 인덱스 생성이 수 초에 끝난다.
CREATE UNIQUE INDEX "Property_dedupe_key"
  ON "Property" ("propertyType", "nameNorm", "regionCode", "address")
  WHERE "redirectToId" IS NULL;
```

- [ ] **Step 3: 스키마에 주석 추가**

Prisma 스키마는 부분 인덱스를 표현하지 못한다. `prisma/schema.prisma`의 `Property` 모델에서 `@@index` 목록이 시작되기 직전에 주석을 넣는다:

```prisma
  // Property_dedupe_key — (propertyType, nameNorm, regionCode, address) WHERE redirectToId IS NULL
  // 부분 유니크 인덱스라 Prisma 스키마로 표현할 수 없다. raw SQL 마이그레이션
  // 20260729000000_add_property_dedupe_unique 참조. 같은 이유로 관리되는 인덱스가
  // 이미 여럿 있다(Property_nameNorm_trgm_idx, Property_location_gix, Property_areaTypes_gin).
  @@index([propertyType, regionCode])
```

기존 `@@index` 줄은 하나도 지우거나 바꾸지 않는다.

- [ ] **Step 4: 로컬 테스트 DB에 적용**

Run: `pnpm test:db:migrate`
Expected: `Applying migration '20260729000000_add_property_dedupe_unique'` 후 성공

**`could not create unique index "Property_dedupe_key"` 로 실패하면** 로컬 테스트 DB에 이전 실행이 남긴 중복 행이 있다는 뜻이다. 테스트는 자체 시드를 쓰므로 비워도 안전하다(Step 1에서 로컬 DB임을 확인했다):

```bash
pnpm dotenv -e .env.test -- tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  await p.transaction.deleteMany();
  await p.property.deleteMany();
  console.log('테스트 DB 단지·거래 비움');
  await p.\$disconnect();
})();
"
```

비운 뒤 `pnpm test:db:migrate`를 다시 돌린다. `Transaction`을 먼저 지워야 FK에 걸리지 않는다.

- [ ] **Step 5: 인덱스가 실제로 걸렸고 의도대로 동작하는지 확인**

Run:
```bash
pnpm dotenv -e .env.test -- tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const idx = await p.\$queryRawUnsafe(\`SELECT indexdef FROM pg_indexes WHERE indexname='Property_dedupe_key'\`);
  console.log('INDEX:', idx[0]?.indexdef ?? '(없음)');
  await p.region.upsert({ where: { code: '1168000000' }, update: {},
    create: { code: '1168000000', sido: '서울특별시', sigungu: '강남구', level: 2,
              isAbolished: false, fullName: '서울특별시 강남구', sourceVersion: 'idxcheck' } });
  const base = { propertyType: 'APARTMENT', name: '인덱스검증', nameNorm: '인덱스검증',
                 regionCode: '1168000000', address: '역삼동 1' };
  const a = await p.property.create({ data: base });
  try {
    await p.property.create({ data: base });
    console.log('2번째 create: 성공 — 제약이 안 걸렸다 (실패)');
  } catch (e) { console.log('2번째 create: 차단됨, code =', e.code); }
  // 리다이렉트된 행은 제약에서 빠져야 한다
  const b = await p.property.create({ data: { ...base, redirectToId: a.id } });
  const c = await p.property.create({ data: { ...base, redirectToId: a.id } });
  console.log('리다이렉트 행 2개 생성: 허용됨', b.id !== c.id);
  // 정리 순서 주의: a를 먼저 지우면 onDelete:SetNull로 b·c의 redirectToId가 NULL이 되어
  // 둘 다 부분 인덱스에 들어가며 같은 키로 충돌한다. 리다이렉트 행부터 지운다.
  await p.property.deleteMany({ where: { id: { in: [b.id, c.id] } } });
  await p.property.delete({ where: { id: a.id } });
  await p.\$disconnect();
})();
"
```
Expected:
```
INDEX: CREATE UNIQUE INDEX "Property_dedupe_key" ON public."Property" ... WHERE ("redirectToId" IS NULL)
2번째 create: 차단됨, code = P2002
리다이렉트 행 2개 생성: 허용됨 true
```

세 줄이 모두 나와야 한다. `2번째 create: 성공`이 나오면 `WHERE` 절이 잘못됐거나 인덱스가 안 만들어진 것이다.

- [ ] **Step 6: 스펙 §6 말미의 모순 문장 정리**

`docs/superpowers/specs/2026-07-29-property-race-dedupe-design.md` §6 마지막 문단이 앞 내용과 어긋난다:

> Prisma 스키마는 부분 유니크 인덱스를 표현하지 못하므로 raw SQL 마이그레이션으로 작성한다. `CONCURRENTLY`는 트랜잭션 밖에서만 동작하므로 마이그레이션 파일 상단에 이를 명시한다.

앞에서 `CONCURRENTLY`를 쓰지 않기로 했으므로 뒷문장은 이전 편집의 잔재다. 뒷문장만 지우고 앞문장은 남긴다.

- [ ] **Step 7: 배포 전 운영 중복 재확인 절차를 계획서에 기록**

이 파일(`docs/superpowers/plans/2026-07-29-property-dedupe-unique-constraint.md`) 맨 아래 `## 머지 전 확인` 절에 아래를 적는다. **머지 직전에 사람이 운영 DB(읽기전용)에서 돌린다.**

```sql
SELECT count(*) AS 남은그룹 FROM (
  SELECT 1 FROM "Property" WHERE "redirectToId" IS NULL
  GROUP BY "propertyType","nameNorm","regionCode",address HAVING count(*)>1) x;
-- 0이 아니면 머지하지 않는다. 배포의 migrate deploy가 실패해 배포 전체가 죽는다.
```

0이 아니면 `pnpm ops:merge-properties --apply`를 먼저 돌려 정리한 뒤 머지한다.

- [ ] **Step 8: typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 무출력 + `✔ No ESLint warnings or errors`

- [ ] **Step 9: 커밋**

```bash
git add prisma/migrations/20260729000000_add_property_dedupe_unique prisma/schema.prisma docs/superpowers
git commit -m "feat(db): 살아있는 단지에 부분 유니크 인덱스 추가"
```

---

### Task 2: `findOrCreateProperty`의 P2002 재조회

**Files:**
- Modify: `scripts/ingest/property-matcher.ts:51-75` (`create` 호출부)
- Test: `tests/ingest/property-matcher.test.ts`

**Interfaces:**
- Consumes: Task 1의 인덱스 `Property_dedupe_key` — 이게 없으면 P2002가 발생하지 않아 이 태스크의 테스트가 성립하지 않는다.
- Produces: 없음

**왜 필요한가.** 제약이 생긴 뒤 두 프로세스가 같은 단지를 동시에 만들려 하면 한쪽의 `create`가 P2002로 실패한다. 그건 오류가 아니라 "형제가 방금 만들었다"는 신호이므로, 잡아서 다시 조회해 그 행을 반환해야 한다. 던지면 그 시군구·월 태스크 전체가 실패한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/ingest/property-matcher.test.ts`에 추가한다. 이 파일은 이미 `@/scripts/ingest/geocoder`를 모킹하고 있고, **`geocode`는 조회 3단계가 끝난 뒤 `create` 직전에 호출된다** — 경합을 결정적으로 재현할 유일한 주입 지점이다.

```ts
  // 유니크 제약(Property_dedupe_key) 하에서 두 프로세스가 같은 단지를 동시에 만들면
  // 한쪽 create가 P2002로 실패한다. 그건 형제가 방금 만들었다는 뜻이므로 그 행을 반환해야 한다.
  // geocode는 조회가 모두 끝난 뒤 create 직전에 호출되므로, 여기서 경쟁 행을 넣으면
  // 실제 경합과 같은 순서를 결정적으로 재현할 수 있다.
  it('create가 P2002로 실패하면 형제가 만든 행을 재조회해 반환한다', async () => {
    await prisma.region.upsert({
      where: { code: '1168000000' },
      create: {
        code: '1168000000', sido: '서울특별시', sigungu: '강남구', level: 2,
        isAbolished: false, fullName: '서울특별시 강남구', sourceVersion: 'test',
      },
      update: {},
    });

    const geocoder = await import('@/scripts/ingest/geocoder');
    // 배열에 담는 이유: `let x: T | null = null`을 클로저 안에서만 대입하면
    // 단언 시점에 타입 좁히기가 꼬인다. 홀더를 쓰면 그 문제가 없다.
    const sibling: Array<{ id: bigint }> = [];
    vi.mocked(geocoder.geocode).mockImplementationOnce(async () => {
      // 형제 프로세스가 먼저 커밋한 상황
      const row = await prisma.property.create({
        data: {
          propertyType: PropertyType.APARTMENT,
          name: '경합단지', nameNorm: '경합단지',
          regionCode: '1168000000', address: '역삼동 5',
        },
      });
      sibling.push(row);
      return { lat: 37.5, lng: 127.0, region1: null, region2: null };
    });

    const found = await findOrCreateProperty({
      propertyType: PropertyType.APARTMENT,
      name: '경합단지',
      sigunguCode: '11680',
      regionCode: '1168000000',
      address: '역삼동 5',
      buildYear: null,
      roadName: null,
    });

    expect(sibling).toHaveLength(1);
    expect(found.id).toBe(sibling[0].id);
    // 두 행이 생기지 않았어야 한다
    expect(await prisma.property.count({ where: { nameNorm: '경합단지' } })).toBe(1);
  });
```

import는 손댈 필요가 없다 — 이 파일 1행에 `vi`가, 4행에 `PropertyType`이 이미 있다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/ingest/property-matcher.test.ts`
Expected: FAIL — `create`가 P2002를 그대로 던져 `PrismaClientKnownRequestError: Unique constraint failed`

이 실패가 안 나면 Task 1의 인덱스가 테스트 DB에 없는 것이다. `pnpm test:db:migrate`를 먼저 돌린다.

- [ ] **Step 3: P2002 재조회 구현**

`scripts/ingest/property-matcher.ts`. 파일 5행에 이미 `import type { PropertyType } from '@prisma/client';`가 있다. **새 줄을 만들지 말고 그 줄에 `Property`를 더하고**, `Prisma`는 값 import라 별도 줄이 필요하다:

```ts
// 5행을 이렇게 바꾼다
import type { Property, PropertyType } from '@prisma/client';
// 그 아래 한 줄 추가 (Prisma는 런타임 값이므로 type import에 넣을 수 없다)
import { Prisma } from '@prisma/client';
```

`const created = await prisma.property.create({...})` 블록을 아래로 교체한다. 그 뒤의 `if (coord) { ... }` 좌표 UPDATE와 `return created;`는 그대로 둔다.

`created`에 명시적 타입을 준다 — `let created;`로 두면 암묵 `any`가 되어 뒤따르는 `created.id` 사용이 타입 검사를 못 받는다.

```ts
  let created: Property;
  try {
    created = await prisma.property.create({
      data: {
        propertyType: input.propertyType,
        name: input.name,
        nameNorm,
        regionCode: input.regionCode,
        address: input.address,
        builtYear: input.buildYear,
      },
    });
  } catch (err) {
    // P2002 = Property_dedupe_key 위반. 조회와 create 사이에 형제 프로세스가 같은 단지를
    // 만들었다는 뜻이다. 던지면 그 시군구·월 태스크 전체가 실패하므로, 그 행을 찾아 돌려준다.
    // 인덱스 키와 정확히 같은 조건으로 조회해야 방금 충돌한 행이 잡힌다
    // (앞의 조회들은 regionCode를 prefix로 보므로 키가 다르다).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.property.findFirst({
        where: {
          propertyType: input.propertyType,
          nameNorm,
          regionCode: input.regionCode,
          address: input.address,
          redirectToId: null,
        },
      });
      if (winner) {
        logger.info(
          { name: input.name, sigungu: input.sigunguCode, id: String(winner.id) },
          'P2002 — 형제가 만든 단지 재사용',
        );
        return winner;
      }
    }
    throw err;
  }
```

`winner`가 없으면 P2002가 이 인덱스 때문이 아니라는 뜻이므로 그대로 던진다.

- [ ] **Step 4: 통과 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/ingest/property-matcher.test.ts`
Expected: PASS (4 tests) — 기존 3개 + 신규 1개

기존 3개가 하나라도 깨지면 `create` 교체가 잘못된 것이다.

- [ ] **Step 5: 전체 스위트 + 게이트**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm dotenv -e .env.test -- vitest run tests/integration`
Expected: 전부 PASS

`tests/integration`은 공유 DB를 쓰고 플레이크 이력이 있으므로 **2회 연속** 돌린다.

- [ ] **Step 6: 빌드**

Run: `pnpm build`
Expected: 성공

CI에 `pnpm build`가 없어 빌드 에러가 배포 시점까지 숨는다.

- [ ] **Step 7: 커밋**

```bash
git add scripts/ingest/property-matcher.ts tests/ingest/property-matcher.test.ts
git commit -m "feat(etl): 유니크 제약 위반(P2002)을 형제 행 재조회로 흡수"
```

---

## 검증

전 태스크 완료 후:

| 항목 | 방법 | 기대 |
|---|---|---|
| 인덱스 생성 | Task 1 Step 5 스크립트 | 3줄 모두 기대값 |
| P2002 흡수 | `tests/ingest/property-matcher.test.ts` | 4개 통과 |
| 기존 매처 동작 | 같은 파일의 기존 3개 | 통과 |
| 전체 | `pnpm test:unit` + `tests/integration` ×2 | 통과 |
| 빌드 | `pnpm build` | 성공 |
| lint | `pnpm lint` | 클린 |

`git diff main -- prisma/` 를 읽어 마이그레이션 외에 스키마 구조 변경이 없는지 눈으로 확인한다. 주석 추가만 있어야 한다.

## 머지 전 확인

**머지 직전에 사람이 운영 DB(읽기전용 터널)에서 아래를 돌린다.**

```sql
SELECT count(*) AS 남은그룹 FROM (
  SELECT 1 FROM "Property" WHERE "redirectToId" IS NULL
  GROUP BY "propertyType","nameNorm","regionCode",address HAVING count(*)>1) x;
```

**0이 아니면 머지하지 않는다.** `deploy/remote-deploy.sh`가 web 빌드 전에 `prisma migrate deploy`를 자동 실행하므로, 중복이 남아 있으면 인덱스 생성이 실패해 배포 전체가 죽는다.

0이 아닐 경우 `pnpm ops:merge-properties --apply`(박스에서 실행 — 터널로는 N+1 왕복 때문에 수십 분 걸린다)로 정리한 뒤 다시 재고 머지한다.

2026-07-29 운영 병합 직후 이 값은 0이었다(2,008그룹 전량 병합, 실패 0, 사후 검증 6종 통과).

## 배포 후

인덱스 생성은 `Property` 27만 행 기준 수 초다. 그동안 `Property`에 쓰기 잠금이 걸리므로 ETL이 도는 시각(KST 00시·04시)을 피해 배포하는 편이 안전하다.

배포 후 인덱스 존재를 확인한다:

```sql
SELECT indexdef FROM pg_indexes WHERE indexname = 'Property_dedupe_key';
```

이후 ETL 로그에서 `'P2002 — 형제가 만든 단지 재사용'`이 나오면 경합이 실제로 발생했고 정상 흡수된 것이다. 이 로그가 반복해서 대량으로 찍히면 A(태스크 순서 반전)가 못 막는 경로가 있다는 신호이므로 그때 조사한다.
