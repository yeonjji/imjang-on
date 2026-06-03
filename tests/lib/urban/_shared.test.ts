import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { fullSidoName, resolveAddrPrefix } from '@/lib/urban/_shared';

describe('urban/_shared — fullSidoName', () => {
  it('약칭을 정식 명칭으로 변환', () => {
    expect(fullSidoName('서울')).toBe('서울특별시');
    expect(fullSidoName('경기')).toBe('경기도');
    expect(fullSidoName('강원')).toBe('강원특별자치도');
    expect(fullSidoName('제주')).toBe('제주특별자치도');
  });

  it('매칭 없으면 입력 그대로 반환 (passthrough)', () => {
    expect(fullSidoName('서울특별시')).toBe('서울특별시');
    expect(fullSidoName('알수없음')).toBe('알수없음');
  });
});

describe('urban/_shared — resolveAddrPrefix', () => {
  const SIGUNGU = '77777';
  const CODE = '7777700000';

  beforeAll(async () => {
    await prisma.region.deleteMany({ where: { sigunguCode: SIGUNGU } });
    // sigunguCode 는 code 에서 파생되는 generated column (LEFT(code,5)=SIGUNGU)
    await prisma.region.create({
      data: {
        code: CODE,
        sido: '테스트도',
        sigungu: '테스트시',
        fullName: '테스트도 테스트시',
        level: 2,
        isAbolished: false,
        sourceVersion: 'test',
      },
    });
  });

  afterAll(async () => {
    await prisma.region.deleteMany({ where: { sigunguCode: SIGUNGU } });
  });

  it('sigunguCode 미지정 → null', async () => {
    expect(await resolveAddrPrefix({})).toBeNull();
    expect(await resolveAddrPrefix({ sido: '서울' })).toBeNull();
  });

  it('매칭되는 region 없음 → __NO_MATCH__', async () => {
    expect(await resolveAddrPrefix({ sigunguCode: '00000' })).toBe('__NO_MATCH__');
  });

  it('정상 매칭 → "시도 시군구"', async () => {
    expect(await resolveAddrPrefix({ sigunguCode: SIGUNGU })).toBe('테스트도 테스트시');
  });
});
