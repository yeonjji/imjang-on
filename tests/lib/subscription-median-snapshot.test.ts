import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { PropertyType, DealType } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  computeSigunguMedians,
  writeSigunguMedianSnapshot,
  readSigunguMedianSnapshot,
  MIN_SAMPLE,
  SIGUNGU_MEDIAN_KEY,
  type SigunguMedian,
} from '@/lib/subscription/median-snapshot';

describe('시군구 중위가 스냅샷', () => {
  it('스냅샷 키는 DashboardSnapshot.key 길이 제한(40) 안이다', () => {
    expect(SIGUNGU_MEDIAN_KEY.length).toBeLessThanOrEqual(40);
  });

  it('표본 하한은 30이다', () => {
    expect(MIN_SAMPLE).toBe(30);
  });

  describe('computeSigunguMedians — 표본 하한과 제외 조건 (시드 데이터)', () => {
    // 실제 시군구 코드는 5자리 행정코드라 88881/88882와 겹칠 수 없고, 로컬 테스트 DB는 항상 비어
    // 있어(project memory: env별 DB 타깃) 운영 데이터와 섞일 걱정 없이 sentinel로 쓴다.
    const REGION = '8888888888'; // VarChar(10), Property.regionCode용 — level 3이라 그룹 조인 대상은 아님
    const SIGUNGU_A = '88881'; // MIN_SAMPLE(30) 충족 — 결과에 포함돼야 함
    const SIGUNGU_B = '88882'; // MIN_SAMPLE 미만(29) — 결과에서 빠져야 함
    // computeSigunguMedians가 이제 Region의 (sido, sigungu) 그룹을 거쳐야 sigunguCode에 도달하므로,
    // Region 행이 없으면 조인이 아무것도 못 찾아 결과가 통째로 비어버린다. A/B는 서로 다른 sigungu
    // 이름을 줘서 롤업 없이 예전처럼 독립된 그룹으로 계산되게 한다(롤업 자체는 별도 describe에서 검증).
    // Region.sigunguCode는 LEFT(code, 5)로 계산되는 생성 컬럼이라 직접 넣을 수 없다 — code 앞 5자리를
    // 원하는 sigunguCode로 맞춰서 만든다.
    const REGION_LV2_A = `${SIGUNGU_A}00000`; // Region.code, VarChar(10) → sigunguCode = SIGUNGU_A
    const REGION_LV2_B = `${SIGUNGU_B}00000`;
    let propId: bigint;
    let result: Record<string, SigunguMedian>;

    const hash = (label: string) => createHash('sha256').update(`median-snapshot-${label}`).digest('hex');
    const recentDate = (i: number) => new Date(Date.now() - i * 24 * 60 * 60 * 1000);

    beforeAll(async () => {
      await prisma.region.upsert({
        where: { code: REGION },
        update: {},
        create: { code: REGION, sido: '테스트', fullName: '테스트', level: 3, sourceVersion: 'test' },
      });
      await prisma.region.upsert({
        where: { code: REGION_LV2_A },
        update: {},
        create: {
          code: REGION_LV2_A, sido: '테스트', sigungu: '테스트A구', fullName: '테스트 테스트A구',
          level: 2, sourceVersion: 'test',
        },
      });
      await prisma.region.upsert({
        where: { code: REGION_LV2_B },
        update: {},
        create: {
          code: REGION_LV2_B, sido: '테스트', sigungu: '테스트B구', fullName: '테스트 테스트B구',
          level: 2, sourceVersion: 'test',
        },
      });
      const prop = await prisma.property.create({
        data: {
          propertyType: PropertyType.APARTMENT,
          name: '중위가스냅샷테스트',
          nameNorm: '중위가스냅샷테스트',
          regionCode: REGION,
          address: '테스트 주소',
        },
      });
      propId = prop.id;

      // SIGUNGU_A: 유효 SALE·APARTMENT 30건. dealAmount를 1000부터 10씩 증가하는 등차수열로 만들어
      // percentile_cont(0.5)를 손으로 검산할 수 있게 한다 — 중위값 = (x[14]+x[15])/2 = 1145.
      const validA = Array.from({ length: 30 }, (_, i) => ({
        propertyId: propId,
        propertyType: PropertyType.APARTMENT,
        regionCode: REGION,
        sigunguCode: SIGUNGU_A,
        dealType: DealType.SALE,
        contractDate: recentDate(i),
        exclusiveArea: 59.99,
        floor: 5,
        dealAmount: 1000 + i * 10,
        source: 'test',
        rawHash: hash(`a-valid-${i}`),
      }));

      // SIGUNGU_A에 섞어 넣는, 표본에 잡히면 안 되는 6건. dealAmount를 999999로 크게 잡아서(0원 건
      // 제외) 필터가 하나라도 새면 count(30→31)와 median(1145→다른 값)이 즉시 어긋나게 만든다. 각
      // 행은 정확히 하나의 WHERE 절에만 걸리도록 설계했다 — JEONSE/WOLSE·오피스텔도 dealAmount를
      // 채워 "dealAmount>0" 필터를 우회시킴으로써 dealType/propertyType 필터 자체가 일하는지
      // 검증하고, 기간외 건도 dealAmount를 채워 12개월 창 필터만으로 걸러지는지 검증한다.
      const distractorsA = [
        {
          propertyId: propId,
          propertyType: PropertyType.APARTMENT,
          regionCode: REGION,
          sigunguCode: SIGUNGU_A,
          dealType: DealType.JEONSE,
          contractDate: recentDate(30),
          exclusiveArea: 59.99,
          floor: 5,
          dealAmount: 999_999,
          deposit: 50_000,
          source: 'test',
          rawHash: hash('a-jeonse'),
        },
        {
          propertyId: propId,
          propertyType: PropertyType.APARTMENT,
          regionCode: REGION,
          sigunguCode: SIGUNGU_A,
          dealType: DealType.WOLSE,
          contractDate: recentDate(31),
          exclusiveArea: 59.99,
          floor: 5,
          dealAmount: 999_999,
          deposit: 50_000,
          monthlyRent: 80,
          source: 'test',
          rawHash: hash('a-wolse'),
        },
        {
          propertyId: propId,
          propertyType: PropertyType.OFFICETEL,
          regionCode: REGION,
          sigunguCode: SIGUNGU_A,
          dealType: DealType.SALE,
          contractDate: recentDate(32),
          exclusiveArea: 59.99,
          floor: 5,
          dealAmount: 999_999,
          source: 'test',
          rawHash: hash('a-officetel'),
        },
        {
          propertyId: propId,
          propertyType: PropertyType.APARTMENT,
          regionCode: REGION,
          sigunguCode: SIGUNGU_A,
          dealType: DealType.SALE,
          contractDate: recentDate(33),
          exclusiveArea: 59.99,
          floor: 5,
          dealAmount: 999_999,
          cancelDate: recentDate(1),
          source: 'test',
          rawHash: hash('a-cancelled'),
        },
        {
          propertyId: propId,
          propertyType: PropertyType.APARTMENT,
          regionCode: REGION,
          sigunguCode: SIGUNGU_A,
          dealType: DealType.SALE,
          contractDate: recentDate(34),
          exclusiveArea: 59.99,
          floor: 5,
          dealAmount: 0,
          source: 'test',
          rawHash: hash('a-zero'),
        },
        {
          propertyId: propId,
          propertyType: PropertyType.APARTMENT,
          regionCode: REGION,
          sigunguCode: SIGUNGU_A,
          dealType: DealType.SALE,
          contractDate: recentDate(550), // 약 18개월 전 — 12개월 창(365일) 밖
          exclusiveArea: 59.99,
          floor: 5,
          dealAmount: 999_999,
          source: 'test',
          rawHash: hash('a-outside-window'),
        },
      ];

      // SIGUNGU_B: 유효 SALE·APARTMENT 29건 — MIN_SAMPLE 미달로 통째로 빠져야 한다.
      const validB = Array.from({ length: 29 }, (_, i) => ({
        propertyId: propId,
        propertyType: PropertyType.APARTMENT,
        regionCode: REGION,
        sigunguCode: SIGUNGU_B,
        dealType: DealType.SALE,
        contractDate: recentDate(i),
        exclusiveArea: 59.99,
        floor: 5,
        dealAmount: 2000 + i * 10,
        source: 'test',
        rawHash: hash(`b-valid-${i}`),
      }));

      await prisma.transaction.createMany({ data: [...validA, ...distractorsA, ...validB] });
      result = await computeSigunguMedians();
    });

    afterAll(async () => {
      // propId는 beforeAll 중간(Region upsert 이후, Property create 이후)에 할당된다. beforeAll이
      // 그 사이 어디서든 던지면 propId는 undefined로 남는데, Prisma는 deleteMany의 where 필드가
      // undefined면 "그 조건을 생략"으로 취급한다 — { propertyId: undefined }는 조건 없는
      // deleteMany({})로 무너져 Transaction 테이블 전체(다른 테스트 파일이 병렬로 쓰고 있는 행까지)를
      // 지울 수 있다. 그래서 beforeAll에서만 할당되는 propId 대신, 이 describe 스코프에 상수로 있는
      // sentinel sigunguCode로 지운다 — beforeAll이 어디까지 진행됐든 안전하다.
      await prisma.transaction.deleteMany({ where: { sigunguCode: { in: [SIGUNGU_A, SIGUNGU_B] } } });
      if (propId) await prisma.property.delete({ where: { id: propId } });
      await prisma.region.delete({ where: { code: REGION } });
      await prisma.region.delete({ where: { code: REGION_LV2_A } });
      await prisma.region.delete({ where: { code: REGION_LV2_B } });
    });

    it('MIN_SAMPLE 이상(30건)인 시군구는 결과에 포함된다', () => {
      expect(result[SIGUNGU_A]).toBeDefined();
    });

    it('MIN_SAMPLE 미만(29건)인 시군구는 결과에서 빠진다', () => {
      expect(result[SIGUNGU_B]).toBeUndefined();
    });

    it('JEONSE/WOLSE/오피스텔·취소·0원·12개월 창외 거래는 표본 수에 잡히지 않는다', () => {
      expect(result[SIGUNGU_A].count).toBe(30);
    });

    it('중위값은 섞여 들어간 6건을 빼고 유효 30건만으로 계산된다', () => {
      expect(result[SIGUNGU_A].median).toBe(1145);
    });
  });

  describe('computeSigunguMedians — 일반구 롤업 (같은 Region 그룹의 다른 sigunguCode로 값이 펼쳐진다)', () => {
    // 수원시 같은 일반구 도시 버그의 최소 재현: Region에 (sido, sigungu)는 같고 sigunguCode만 다른
    // 두 행을 만든다. 거래는 한쪽 코드(구 코드 역할)에만 넣고, 다른 쪽(시 코드 역할)은 거래가 전혀
    // 없다 — resolveSigunguFromAddress가 실제로 city 코드를 돌려주는 상황과 같다. 롤업이 되면 거래가
    // 없는 코드도 같은 그룹이라 결과에 나타나야 한다.
    const SIGUNGU_WITH_TX = '88883'; // 거래를 넣는 쪽 — district 코드 역할
    const SIGUNGU_WITHOUT_TX = '88884'; // 거래가 없는 쪽 — city 코드 역할, 롤업으로만 값을 받아야 함
    // Region.sigunguCode는 LEFT(code, 5) 생성 컬럼이라 code 앞 5자리로 값을 맞춘다.
    const REGION_WITH_TX = `${SIGUNGU_WITH_TX}00000`; // Region.code, VarChar(10)
    const REGION_WITHOUT_TX = `${SIGUNGU_WITHOUT_TX}00000`;
    let propId: bigint;
    let result: Record<string, SigunguMedian>;

    const hash = (label: string) => createHash('sha256').update(`median-snapshot-rollup-${label}`).digest('hex');
    const recentDate = (i: number) => new Date(Date.now() - i * 24 * 60 * 60 * 1000);

    beforeAll(async () => {
      await prisma.region.upsert({
        where: { code: REGION_WITH_TX },
        update: {},
        create: {
          code: REGION_WITH_TX, sido: '테스트', sigungu: '테스트공유구', fullName: '테스트 테스트공유구',
          level: 2, sourceVersion: 'test',
        },
      });
      await prisma.region.upsert({
        where: { code: REGION_WITHOUT_TX },
        update: {},
        create: {
          code: REGION_WITHOUT_TX, sido: '테스트', sigungu: '테스트공유구', fullName: '테스트 테스트공유구',
          level: 2, sourceVersion: 'test',
        },
      });
      const prop = await prisma.property.create({
        data: {
          propertyType: PropertyType.APARTMENT,
          name: '중위가롤업테스트',
          nameNorm: '중위가롤업테스트',
          regionCode: REGION_WITH_TX,
          address: '테스트 주소',
        },
      });
      propId = prop.id;

      const valid = Array.from({ length: 30 }, (_, i) => ({
        propertyId: propId,
        propertyType: PropertyType.APARTMENT,
        regionCode: REGION_WITH_TX,
        sigunguCode: SIGUNGU_WITH_TX,
        dealType: DealType.SALE,
        contractDate: recentDate(i),
        exclusiveArea: 59.99,
        floor: 5,
        dealAmount: 3000 + i * 10,
        source: 'test',
        rawHash: hash(`valid-${i}`),
      }));

      await prisma.transaction.createMany({ data: valid });
      result = await computeSigunguMedians();
    });

    afterAll(async () => {
      await prisma.transaction.deleteMany({ where: { sigunguCode: { in: [SIGUNGU_WITH_TX, SIGUNGU_WITHOUT_TX] } } });
      if (propId) await prisma.property.delete({ where: { id: propId } });
      await prisma.region.delete({ where: { code: REGION_WITH_TX } });
      await prisma.region.delete({ where: { code: REGION_WITHOUT_TX } });
    });

    it('거래가 없는 코드도 같은 Region 그룹이면 결과에 나타난다', () => {
      expect(result[SIGUNGU_WITHOUT_TX]).toBeDefined();
    });

    it('거래가 있는 코드와 없는 코드가 같은 값(median, count)을 받는다', () => {
      expect(result[SIGUNGU_WITHOUT_TX]).toEqual(result[SIGUNGU_WITH_TX]);
    });

    it('label은 그룹의 Region.sigungu 값으로 채워진다', () => {
      expect(result[SIGUNGU_WITH_TX].label).toBe('테스트공유구');
      expect(result[SIGUNGU_WITHOUT_TX].label).toBe('테스트공유구');
    });
  });

  describe('computeSigunguMedians — region_map은 level을 가리지 않는다 (수원 회귀 재현)', () => {
    // 1차 수정에서 region_map을 level=2로 좁혔다가 운영에서 회귀를 냈다(스냅샷 249→210). 원인:
    // resolveSigunguFromAddress가 돌려주는 코드는 시 단위(level 2)인데, 일반구 도시의 구 코드
    // (장안·권선·팔달·영통 등)는 level 3에만 존재한다. Transaction.sigunguCode는 그 구 코드를
    // 담으므로, level=2로 좁히면 그 구 코드 자체가 region_map에서 빠져 조인이 아무 것도 못 찾는다.
    // 이 테스트는 그 정확한 모양을 재현한다 — 같은 (sido, sigungu) 아래 level 2 행(거래 없음, 해석기가
    // 돌려주는 시 코드 역할)과 level 3 행(거래 30건, Transaction이 실제로 담는 구 코드 역할)을 만든다.
    // level=2 필터가 살아있으면 level 3 행이 region_map에서 빠져 그룹 자체가 사라지고, 둘 다
    // undefined가 되어 이 테스트가 실패한다.
    const SIGUNGU_LV2_CODE = '88887'; // 해석기가 돌려줄 시 코드 역할 — 거래 없음
    const SIGUNGU_LV3_CODE = '88888'; // Transaction이 담는 구 코드 역할 — 거래 30건
    const REGION_LV2 = `${SIGUNGU_LV2_CODE}00000`; // Region.code, VarChar(10)
    const REGION_LV3 = `${SIGUNGU_LV3_CODE}00000`;
    let propId: bigint;
    let result: Record<string, SigunguMedian>;

    const hash = (label: string) => createHash('sha256').update(`median-snapshot-levelmix-${label}`).digest('hex');
    const recentDate = (i: number) => new Date(Date.now() - i * 24 * 60 * 60 * 1000);

    beforeAll(async () => {
      await prisma.region.upsert({
        where: { code: REGION_LV2 },
        update: {},
        create: {
          code: REGION_LV2, sido: '테스트', sigungu: '테스트레벨구', fullName: '테스트 테스트레벨구',
          level: 2, sourceVersion: 'test',
        },
      });
      await prisma.region.upsert({
        where: { code: REGION_LV3 },
        update: {},
        create: {
          code: REGION_LV3, sido: '테스트', sigungu: '테스트레벨구', fullName: '테스트 테스트레벨구',
          level: 3, sourceVersion: 'test',
        },
      });
      const prop = await prisma.property.create({
        data: {
          propertyType: PropertyType.APARTMENT,
          name: '중위가레벨혼합테스트',
          nameNorm: '중위가레벨혼합테스트',
          regionCode: REGION_LV3,
          address: '테스트 주소',
        },
      });
      propId = prop.id;

      const valid = Array.from({ length: 30 }, (_, i) => ({
        propertyId: propId,
        propertyType: PropertyType.APARTMENT,
        regionCode: REGION_LV3,
        sigunguCode: SIGUNGU_LV3_CODE,
        dealType: DealType.SALE,
        contractDate: recentDate(i),
        exclusiveArea: 59.99,
        floor: 5,
        dealAmount: 4000 + i * 10,
        source: 'test',
        rawHash: hash(`valid-${i}`),
      }));

      await prisma.transaction.createMany({ data: valid });
      result = await computeSigunguMedians();
    });

    afterAll(async () => {
      await prisma.transaction.deleteMany({ where: { sigunguCode: { in: [SIGUNGU_LV2_CODE, SIGUNGU_LV3_CODE] } } });
      if (propId) await prisma.property.delete({ where: { id: propId } });
      await prisma.region.delete({ where: { code: REGION_LV2 } });
      await prisma.region.delete({ where: { code: REGION_LV3 } });
    });

    it('level 3 행에만 거래가 있어도 같은 그룹의 level 2 코드가 결과에 나타난다', () => {
      expect(result[SIGUNGU_LV2_CODE]).toBeDefined();
    });

    it('거래를 담은 level 3 코드도 결과에 나타나고 값이 같다', () => {
      expect(result[SIGUNGU_LV3_CODE]).toBeDefined();
      expect(result[SIGUNGU_LV2_CODE]).toEqual(result[SIGUNGU_LV3_CODE]);
    });
  });

  describe('computeSigunguMedians — 폐지된 행정구역(isAbolished)은 매핑에서 뺀다', () => {
    // level 필터는 걷어냈지만 isAbolished=false는 그대로 남겨뒀다 — Region을 읽는 다른 모든
    // 소비처와 같은 규칙이고, 폐지된 행정구역이 매핑에 섞일 이유가 없다. 이 필터가 실수로
    // 같이 빠지면 폐지된 코드도 region_map에 들어와 거래가 그대로 집계돼버리는데, 이 테스트가
    // 그걸 잡는다 — isAbolished 행에 거래를 30건 넣고 결과에서 빠지는지 본다.
    const SIGUNGU_ABOLISHED = '88889'; // 거래 30건을 담지만 Region이 폐지 처리된 코드
    const REGION_ABOLISHED = `${SIGUNGU_ABOLISHED}00000`; // Region.code, VarChar(10)
    let propId: bigint;
    let result: Record<string, SigunguMedian>;

    const hash = (label: string) => createHash('sha256').update(`median-snapshot-abolished-${label}`).digest('hex');
    const recentDate = (i: number) => new Date(Date.now() - i * 24 * 60 * 60 * 1000);

    beforeAll(async () => {
      await prisma.region.upsert({
        where: { code: REGION_ABOLISHED },
        update: {},
        create: {
          code: REGION_ABOLISHED, sido: '테스트', sigungu: '테스트폐지구', fullName: '테스트 테스트폐지구',
          level: 2, isAbolished: true, sourceVersion: 'test',
        },
      });
      const prop = await prisma.property.create({
        data: {
          propertyType: PropertyType.APARTMENT,
          name: '중위가폐지구테스트',
          nameNorm: '중위가폐지구테스트',
          regionCode: REGION_ABOLISHED,
          address: '테스트 주소',
        },
      });
      propId = prop.id;

      const valid = Array.from({ length: 30 }, (_, i) => ({
        propertyId: propId,
        propertyType: PropertyType.APARTMENT,
        regionCode: REGION_ABOLISHED,
        sigunguCode: SIGUNGU_ABOLISHED,
        dealType: DealType.SALE,
        contractDate: recentDate(i),
        exclusiveArea: 59.99,
        floor: 5,
        dealAmount: 5000 + i * 10,
        source: 'test',
        rawHash: hash(`valid-${i}`),
      }));

      await prisma.transaction.createMany({ data: valid });
      result = await computeSigunguMedians();
    });

    afterAll(async () => {
      await prisma.transaction.deleteMany({ where: { sigunguCode: SIGUNGU_ABOLISHED } });
      if (propId) await prisma.property.delete({ where: { id: propId } });
      await prisma.region.delete({ where: { code: REGION_ABOLISHED } });
    });

    it('MIN_SAMPLE을 채워도 폐지된 Region의 코드는 결과에서 빠진다', () => {
      expect(result[SIGUNGU_ABOLISHED]).toBeUndefined();
    });
  });

  describe('writeSigunguMedianSnapshot — 빈 집계 결과는 기존 스냅샷을 덮어쓰지 않는다', () => {
    // 위 describe의 afterAll이 이미 시드 행을 지웠고, 로컬 테스트 DB는 원래 Transaction이 비어
    // 있다(project memory: env별 DB 타깃). test:unit 안의 다른 파일이 만드는 표본은 전부
    // MIN_SAMPLE(30) 미만이라(가장 많은 것도 수 건 수준) 전역 집계에 섞여 들어올 수 없다 —
    // computeSigunguMedians()가 실제로 {}를 돌려주는 상태를 안전하게 재현할 수 있다.
    beforeAll(async () => {
      // "이미 정상 스냅샷이 있다"를 흉내낸다 — 빈 집계가 이 값을 지우면 안 된다.
      const placeholder = { '11110': { median: 999_999, count: 40 } };
      await prisma.dashboardSnapshot.upsert({
        where: { key: SIGUNGU_MEDIAN_KEY },
        create: { key: SIGUNGU_MEDIAN_KEY, payload: placeholder },
        update: { payload: placeholder },
      });
    });

    afterAll(async () => {
      await prisma.dashboardSnapshot.delete({ where: { key: SIGUNGU_MEDIAN_KEY } }).catch(() => {});
      await prisma.$disconnect();
    });

    it('빈 결과는 쓰지 않고 0을 반환하며, 기존 스냅샷이 그대로 남는다', async () => {
      const before = await readSigunguMedianSnapshot();
      const count = await writeSigunguMedianSnapshot();
      expect(count).toBe(0);
      const after = await readSigunguMedianSnapshot();
      expect(after).toEqual(before);
    });
  });
});
