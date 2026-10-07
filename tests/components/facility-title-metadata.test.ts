import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@/lib/db';
import { __resetRegionCatalogCacheForTests } from '@/lib/region/from-address';
import { generateMetadata as hospitalMeta } from '@/app/(public)/medical/hospital/[sigunguCode]/[id]/page';
import { generateMetadata as amenityMeta } from '@/app/(public)/amenity/[category]/[id]/page';
import { generateMetadata as chargerMeta } from '@/app/(public)/urban/charger/[id]/page';

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
    expect(meta.title).toBe('씨유 (강남구) — 편의점');
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

describe('시설 상세 generateMetadata description', () => {
  // 네이버 서치어드바이저 '동일 description' 경고(2026-10): 지역 없는 템플릿이라 동명 시설
  // (체인 매장·'서울치과의원' 등)의 description이 글자까지 같았다. 주소로 갈라야 한다.
  it('이름이 같은 병원이라도 주소가 다르면 description이 다르다', async () => {
    const TWIN_ID = 990003n;
    await prisma.hospital.upsert({
      where: { id: TWIN_ID },
      create: {
        id: TWIN_ID, sourceId: 'test-hosp-990003', name: '서울치과의원', typeCode: '81', typeName: '치과의원',
        sigunguCode: '110019', sido: '서울', sigungu: '강남구', address: '서울특별시 강남구 테헤란로 9',
      },
      update: {},
    });
    try {
      const a = await hospitalMeta(params({ sigunguCode: '110019', id: String(HOSPITAL_ID) }));
      const b = await hospitalMeta(params({ sigunguCode: '110019', id: String(TWIN_ID) }));
      expect(a.description).toContain('테헤란로 1');
      expect(a.description).not.toBe(b.description);
    } finally {
      await prisma.hospital.delete({ where: { id: TWIN_ID } }).catch(() => {});
    }
  });

  // 아파트 단지 하나가 동·출입구별 충전소로 따로 등록돼 이름·주소가 같다(운영 실측 6,994건).
  it('이름·주소가 같은 충전소도 설치 위치가 다르면 description이 다르다', async () => {
    const ids = [990004n, 990005n];
    const base = { name: '테스트아파트', address: '서울특별시 강남구 테헤란로 3', chargeSpeed: '완속', chargerCount: 2 };
    await prisma.evCharger.upsert({ where: { id: ids[0] }, create: { id: ids[0], sourceId: 'test-ev-990004', ...base, locationDetail: '주출입구 지상주차장1' }, update: {} });
    await prisma.evCharger.upsert({ where: { id: ids[1] }, create: { id: ids[1], sourceId: 'test-ev-990005', ...base, locationDetail: '부출입구 지상주차장2' }, update: {} });
    try {
      const a = await chargerMeta(params({ id: String(ids[0]) }));
      const b = await chargerMeta(params({ id: String(ids[1]) }));
      expect(a.description).toContain('주출입구 지상주차장1');
      expect(a.description).not.toBe(b.description);
    } finally {
      await prisma.evCharger.deleteMany({ where: { id: { in: ids } } });
    }
  });
});

