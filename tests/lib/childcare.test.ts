import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import type { Childcare } from '@prisma/client';
import {
  getChildcareTypeFromDB,
  getChildcareTypeLabel,
  getChildcareList,
  buildChildcareWhere,
  childcareCount,
} from '@/lib/childcare';

const SEED_SIGUNGU = '99999';
const seedIds: bigint[] = [];

beforeAll(async () => {
  await prisma.childcare.deleteMany({ where: { sigunguCode: SEED_SIGUNGU } });
  const rows = [
    { sourceId: '99999000001', name: '국공A', crType: '국공립', status: '정상', capacity: 60 },
    { sourceId: '99999000002', name: '민간A',  crType: '민간',   status: '정상', capacity: 40 },
    { sourceId: '99999000003', name: '가정A',  crType: '가정',   status: '정상', capacity: 18 },
    { sourceId: '99999000004', name: '협동A',  crType: '협동',   status: '정상', capacity: 20 },
    { sourceId: '99999000005', name: '폐원A',  crType: '민간',   status: '휴지', capacity: 20 },
  ];
  for (const r of rows) {
    const created = await prisma.childcare.create({
      data: { ...r, sigunguCode: SEED_SIGUNGU, address: `서울특별시 테스트구 ${r.name}로 1` },
    });
    seedIds.push(created.id);
  }
});

afterAll(async () => {
  await prisma.childcare.deleteMany({ where: { sigunguCode: SEED_SIGUNGU } });
  await prisma.$disconnect();
});

describe('childcareCount', () => {
  const item = { emRoleDirector: 1, childCnt00: 0, classCnt00: null } as unknown as Childcare;
  it('존재하는 숫자 키 → 값', () => {
    expect(childcareCount(item, 'emRoleDirector')).toBe(1);
  });
  it('0 값 → 0 (null 아님)', () => {
    expect(childcareCount(item, 'childCnt00')).toBe(0);
  });
  it('null 컬럼 → null', () => {
    expect(childcareCount(item, 'classCnt00')).toBeNull();
  });
  it('없는 키 → null', () => {
    expect(childcareCount(item, 'waitCntZZ')).toBeNull();
  });
});

describe('getChildcareTypeFromDB', () => {
  it('각 한국어 crType을 정확한 슬러그로 매핑', () => {
    expect(getChildcareTypeFromDB('국공립')).toBe('public');
    expect(getChildcareTypeFromDB('사회복지법인')).toBe('legalwelfare');
    expect(getChildcareTypeFromDB('법인·단체등')).toBe('legalorg');
    expect(getChildcareTypeFromDB('민간')).toBe('private');
    expect(getChildcareTypeFromDB('가정')).toBe('home');
    expect(getChildcareTypeFromDB('협동')).toBe('coop');
    expect(getChildcareTypeFromDB('직장')).toBe('workplace');
    expect(getChildcareTypeFromDB(null)).toBe('all');
    expect(getChildcareTypeFromDB('알수없음')).toBe('all');
  });
});

describe('getChildcareTypeLabel', () => {
  it('슬러그 → 한국어 라벨', () => {
    expect(getChildcareTypeLabel('public')).toBe('국공립');
    expect(getChildcareTypeLabel('coop')).toBe('협동');
    expect(getChildcareTypeLabel('all')).toBe('전체');
  });
});

describe('buildChildcareWhere', () => {
  it('운영중지 토글이 없으면 정상·재개만', () => {
    const w = buildChildcareWhere({ sigunguCode: SEED_SIGUNGU });
    expect(w.OR).toEqual([{ status: { in: ['정상', '재개'] } }, { status: null }]);
  });
  it('includeInactive=true면 status 필터 제거', () => {
    const w = buildChildcareWhere({ sigunguCode: SEED_SIGUNGU, includeInactive: 'true' });
    expect(w.status).toBeUndefined();
  });
  it('type=public이면 crType=국공립', () => {
    const w = buildChildcareWhere({ sigunguCode: SEED_SIGUNGU, type: 'public' });
    expect(w.crType).toBe('국공립');
  });
});

describe('getChildcareList', () => {
  it('운영중지 기본 제외 — 휴지 row가 결과에 없음', async () => {
    const { rows, total } = await getChildcareList({ sigunguCode: SEED_SIGUNGU }, 1);
    expect(total).toBe(4);
    expect(rows.find((r) => r.name === '폐원A')).toBeUndefined();
  });
  it('includeInactive=true면 휴지 포함', async () => {
    const { total } = await getChildcareList({ sigunguCode: SEED_SIGUNGU, includeInactive: 'true' }, 1);
    expect(total).toBe(5);
  });
  it('type 필터가 정확 일치', async () => {
    const { rows, total } = await getChildcareList({ sigunguCode: SEED_SIGUNGU, type: 'home' }, 1);
    expect(total).toBe(1);
    expect(rows[0].name).toBe('가정A');
  });
  it('q 검색이 name contains', async () => {
    const { total } = await getChildcareList({ sigunguCode: SEED_SIGUNGU, q: '협동' }, 1);
    expect(total).toBe(1);
  });
});
