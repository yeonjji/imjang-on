import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  kstDayStartUtc,
  contractDateWindows,
  areaBandLabel,
  regionLabel,
  buildHashtags,
  getMarketBriefing,
} from '@/lib/briefing';
import { prisma } from '@/lib/db';
import { PropertyType, DealType } from '@prisma/client';
import { createHash } from 'node:crypto';

describe('kstDayStartUtc', () => {
  it('KST 자정의 UTC 시각(전날 15:00Z)을 반환', () => {
    // 2026-06-05 02:00 KST = 2026-06-04 17:00Z
    const now = new Date('2026-06-04T17:00:00.000Z');
    expect(kstDayStartUtc(now).toISOString()).toBe('2026-06-04T15:00:00.000Z');
  });
});

describe('contractDateWindows', () => {
  it('최근 30일/직전 30일 경계를 KST 날짜로 반환', () => {
    const now = new Date('2026-06-05T00:00:00.000Z'); // 2026-06-05 09:00 KST
    const w = contractDateWindows(now);
    expect(w.recentStart.toISOString().slice(0, 10)).toBe('2026-05-07');
    expect(w.prevStart.toISOString().slice(0, 10)).toBe('2026-04-07');
    expect(w.recentStart > w.prevStart).toBe(true);
    expect(w.prevEnd.toISOString()).toBe(w.recentStart.toISOString());
  });
});

describe('areaBandLabel', () => {
  it('전용면적 구간을 라벨로 매핑', () => {
    expect(areaBandLabel(45)).toBe('전용 60㎡ 미만');
    expect(areaBandLabel(59.99)).toBe('전용 60㎡ 미만');
    expect(areaBandLabel(84.9)).toBe('전용 60~85㎡');
    expect(areaBandLabel(101)).toBe('전용 85~102㎡');
    expect(areaBandLabel(120)).toBe('전용 102~135㎡');
    expect(areaBandLabel(140)).toBe('전용 135㎡ 초과');
  });
});

describe('regionLabel', () => {
  it('fullName에서 시·도 토큰을 제거해 시군구 라벨 생성', () => {
    expect(regionLabel('경기도 화성시')).toBe('화성시');
    expect(regionLabel('경기도 수원시 영통구')).toBe('수원시 영통구');
    expect(regionLabel('서울특별시 강남구')).toBe('강남구');
    expect(regionLabel('세종특별자치시')).toBe('세종특별자치시'); // 단일 토큰은 그대로
  });
});

describe('buildHashtags', () => {
  it('데이터에서 해시태그 칩 문자열을 생성', () => {
    const tags = buildHashtags({
      txCount: 2431,
      topRegionLabel: '화성시',
      topAreaLabel: '전용 60~85㎡',
      highestRegionLabel: '강남구',
    });
    expect(tags).toEqual([
      '#오늘의실거래',
      '#매매 2,431건',
      '#최고가 강남구',
      '#전용60~85㎡ 최다',
      '#화성시',
    ]);
  });
});

const SGG_HOT = '99901';
const SGG_LOW = '99902';
const RC_HOT = '9990100000';
const RC_LOW = '9990200000';
let hotPropId: bigint;
let lowPropId: bigint;
const NOW = new Date(); // createdAt = now() → '오늘' 창에 잡힘

beforeAll(async () => {
  await prisma.region.upsert({
    where: { code: RC_HOT },
    update: {},
    create: { code: RC_HOT, sido: '경기', sigungu: '시드시', fullName: '경기도 시드시', level: 2, sourceVersion: 'test' },
  });
  await prisma.region.upsert({
    where: { code: RC_LOW },
    update: {},
    create: { code: RC_LOW, sido: '전남', sigungu: '저가군', fullName: '전라남도 저가군', level: 2, sourceVersion: 'test' },
  });
  const hot = await prisma.property.create({ data: { propertyType: PropertyType.APARTMENT, name: '시드아파트', nameNorm: '시드아파트', regionCode: RC_HOT, address: '경기도 시드시 1' } });
  const low = await prisma.property.create({ data: { propertyType: PropertyType.APARTMENT, name: '저가아파트', nameNorm: '저가아파트', regionCode: RC_LOW, address: '전라남도 저가군 1' } });
  hotPropId = hot.id;
  lowPropId = low.id;

  const base = (over: Record<string, unknown>, key: string) => ({
    propertyType: PropertyType.APARTMENT,
    dealType: DealType.SALE,
    contractDate: new Date(),
    exclusiveArea: 84.5, // → '전용 60~85㎡'
    source: 'test',
    rawHash: createHash('sha256').update(`brief-${key}`).digest('hex'),
    ...over,
  });

  await prisma.transaction.createMany({
    data: [
      base({ propertyId: hotPropId, regionCode: RC_HOT, sigunguCode: SGG_HOT, dealAmount: 542_000 }, 'h1') as any,
      base({ propertyId: hotPropId, regionCode: RC_HOT, sigunguCode: SGG_HOT, dealAmount: 100_000 }, 'h2') as any,
      base({ propertyId: hotPropId, regionCode: RC_HOT, sigunguCode: SGG_HOT, dealAmount: 120_000 }, 'h3') as any,
      base({ propertyId: lowPropId, regionCode: RC_LOW, sigunguCode: SGG_LOW, dealAmount: 2_100 }, 'l1') as any,
    ],
  });
});

afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { sigunguCode: { in: [SGG_HOT, SGG_LOW] } } });
  await prisma.property.deleteMany({ where: { id: { in: [hotPropId, lowPropId] } } });
  await prisma.region.deleteMany({ where: { code: { in: [RC_HOT, RC_LOW] } } });
  await prisma.$disconnect();
});

describe('getMarketBriefing 집계', () => {
  it('오늘 수집된 매매를 집계하고 최고가/최저가/최다지역을 반환', async () => {
    const b = await getMarketBriefing(NOW);
    expect(b).not.toBeNull();
    expect(b!.summary.txCount).toBeGreaterThanOrEqual(4);
    expect(b!.summary.highest?.amountManwon).toBe(542_000);
    expect(b!.summary.highest?.regionLabel).toBe('시드시');
    expect(b!.summary.lowest?.amountManwon).toBe(2_100);
    expect(b!.summary.topRegion?.label).toBe('시드시');
    expect(b!.summary.topAreaBand?.label).toBe('전용 60~85㎡');
    expect(b!.popularRegions.some((r) => r.label === '시드시')).toBe(true);
    expect(b!.hashtags).toContain('#오늘의실거래');
  });
});
