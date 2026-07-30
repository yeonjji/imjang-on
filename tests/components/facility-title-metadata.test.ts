import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@/lib/db';
import { __resetRegionCatalogCacheForTests } from '@/lib/region/from-address';
import { generateMetadata as hospitalMeta } from '@/app/(public)/medical/hospital/[sigunguCode]/[id]/page';
import { generateMetadata as amenityMeta } from '@/app/(public)/amenity/[category]/[id]/page';

const HOSPITAL_ID = 990001n;
const STORE_ID = 990002n;

beforeAll(async () => {
  await prisma.region.upsert({
    where: { code: '1168000000' },
    create: {
      code: '1168000000', sido: '서울특별시', sigungu: '강남구',
      level: 2, isAbolished: false, fullName: '서울특별시 강남구', sourceVersion: 'test',
    },
    update: {},
  });
  __resetRegionCatalogCacheForTests();

  await prisma.hospital.upsert({
    where: { id: HOSPITAL_ID },
    create: {
      id: HOSPITAL_ID,
      sourceId: 'test-hosp-990001',
      name: '서울치과의원',
      // typeCode는 non-null (prisma/schema.prisma:494)
      typeCode: '81',
      typeName: '치과의원',
      // sigunguCode는 심평원 코드라 Region과 조인되지 않는다 — 라벨은 주소에서 나와야 한다.
      sigunguCode: '110019',
      sido: '서울',
      sigungu: '강남구',
      address: '서울특별시 강남구 테헤란로 1',
    },
    update: {},
  });

  await prisma.store.upsert({
    where: { id: STORE_ID },
    create: {
      id: STORE_ID,
      sourceId: 'test-store-990002',
      name: '씨유',
      industryCode: 'G20405',
      industryName: '체인화 편의점',
      sigunguCode: '11680',
      address: '서울특별시 강남구 테헤란로 2',
    },
    update: {},
  });
});

const params = <T,>(o: T) => ({ params: Promise.resolve(o) });

describe('시설 상세 generateMetadata title', () => {
  // Hospital.sigunguCode는 Region과 조인이 되지 않으므로(실측 0%),
  // 라벨이 나온다는 것은 주소 파싱 경로가 살아 있다는 뜻이다.
  it('병원 title은 주소에서 뽑은 시군구를 괄호로 단다', async () => {
    const meta = await hospitalMeta(params({ sigunguCode: '110019', id: String(HOSPITAL_ID) }));
    expect(meta.title).toBe('서울치과의원 (강남구) — 치과의원');
  });

  it('편의점 title은 카테고리 라벨과 시군구를 함께 단다', async () => {
    const meta = await amenityMeta(params({ category: 'convenience', id: String(STORE_ID) }));
    expect(meta.title).toBe('씨유 (강남구) — 편의점 정보·주변 아파트');
  });

  // 지역 해석 실패가 제목을 깨뜨리지 않는다는 계약
  it('주소가 매칭되지 않으면 접미사 없이 기존 형식을 낸다', async () => {
    await prisma.hospital.update({
      where: { id: HOSPITAL_ID },
      data: { address: '미상지역 어딘가 1' },
    });
    try {
      const meta = await hospitalMeta(params({ sigunguCode: '110019', id: String(HOSPITAL_ID) }));
      expect(meta.title).toBe('서울치과의원 — 치과의원');
    } finally {
      // assert 실패 시에도 픽스처를 복원한다 — .env.test는 영속 로컬 DB라
      // 복원이 스킵되면 다음 실행까지 이 행이 오염된 채로 남는다.
      await prisma.hospital.update({
        where: { id: HOSPITAL_ID },
        data: { address: '서울특별시 강남구 테헤란로 1' },
      });
    }
  });
});
