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
    const REGION = '8888888888'; // VarChar(10)
    const SIGUNGU_A = '88881'; // MIN_SAMPLE(30) 충족 — 결과에 포함돼야 함
    const SIGUNGU_B = '88882'; // MIN_SAMPLE 미만(29) — 결과에서 빠져야 함
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

      // SIGUNGU_A에 섞어 넣는, 표본에 잡히면 안 되는 5건. dealAmount를 999999로 크게 잡아서 필터가
      // 하나라도 새면 count(30→31)와 median(1145→다른 값)이 즉시 어긋나게 만든다. 각 행은 정확히
      // 하나의 WHERE 절에만 걸리도록 설계했다 — JEONSE/WOLSE·오피스텔도 dealAmount를 채워
      // "dealAmount>0" 필터를 우회시킴으로써 dealType/propertyType 필터 자체가 일하는지 검증한다.
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
      await prisma.transaction.deleteMany({ where: { propertyId: propId } });
      await prisma.property.delete({ where: { id: propId } });
      await prisma.region.delete({ where: { code: REGION } });
    });

    it('MIN_SAMPLE 이상(30건)인 시군구는 결과에 포함된다', () => {
      expect(result[SIGUNGU_A]).toBeDefined();
    });

    it('MIN_SAMPLE 미만(29건)인 시군구는 결과에서 빠진다', () => {
      expect(result[SIGUNGU_B]).toBeUndefined();
    });

    it('JEONSE/WOLSE/오피스텔·취소·0원 거래는 표본 수에 잡히지 않는다', () => {
      expect(result[SIGUNGU_A].count).toBe(30);
    });

    it('중위값은 섞여 들어간 5건을 빼고 유효 30건만으로 계산된다', () => {
      expect(result[SIGUNGU_A].median).toBe(1145);
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
