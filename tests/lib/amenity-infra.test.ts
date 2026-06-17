import { describe, it, expect } from 'vitest';
import { classifyStore, buildInfraCategories, infraHref, INFRA_FETCH_LIMIT, type RawInfra } from '@/lib/amenity/infra';

describe('classifyStore', () => {
  it('편의점·마트·슈퍼 prefix는 mart', () => {
    for (const c of ['G20405', 'G20404', 'G20402', 'G2040501']) {
      expect(classifyStore(c)).toBe('mart');
    }
  });
  it('카페 prefix는 cafe', () => {
    for (const c of ['I21201', 'I2120101']) {
      expect(classifyStore(c)).toBe('cafe');
    }
  });
  it('기타·null은 etc', () => {
    for (const c of ['Z999', null]) {
      expect(classifyStore(c)).toBe('etc');
    }
  });
  it('병원·의원·한의원·약국 코드는 medical', () => {
    for (const c of ['Q10102', 'Q10211', 'Q10209', 'G21501']) {
      expect(classifyStore(c)).toBe('medical');
    }
  });
});

const empty: RawInfra = {
  stores: [], hospitals: [], pharmacies: [], parks: [], markets: [], chargers: [], parking: [],
};

describe('buildInfraCategories', () => {
  it('빈 카테고리는 결과에서 제외한다', () => {
    expect(buildInfraCategories(empty)).toEqual([]);
  });

  it('Store를 편의·마트(store)·카페(cafe)·기타(etc)로 분리한다', () => {
    const cats = buildInfraCategories({
      ...empty,
      stores: [
        { id: 1n, name: 'GS25', address: '', industryCode: 'G20405', industryName: '편의점', distanceMeters: 80 },
        { id: 2n, name: '스타벅스', address: '', industryCode: 'I21201', industryName: '카페', distanceMeters: 120 },
        { id: 3n, name: '무인문구', address: '', industryCode: 'Z999', industryName: '기타', distanceMeters: 200 },
      ],
    });
    const store = cats.find((c) => c.key === 'store');
    const cafe = cats.find((c) => c.key === 'cafe');
    const etc = cats.find((c) => c.key === 'etc');
    expect(store?.items.map((i) => i.name)).toEqual(['GS25']);
    expect(cafe?.items.map((i) => i.name)).toEqual(['스타벅스']);
    expect(etc?.items.map((i) => i.name)).toEqual(['무인문구']);
    expect(cafe?.items[0]).toMatchObject({ id: '2', sub: '카페', distanceMeters: 120 });
  });

  it('의료·약국 Store는 기타·카페에서 제외한다', () => {
    const cats = buildInfraCategories({
      ...empty,
      stores: [
        { id: 1n, name: '커피빈', address: '', industryCode: 'I21201', industryName: '카페', distanceMeters: 100 },
        { id: 2n, name: '수서가정의학과의원', address: '', industryCode: 'Q10209', industryName: '기타 의원', distanceMeters: 120 },
        { id: 3n, name: '국송약국', address: '', industryCode: 'G21501', industryName: '약국', distanceMeters: 130 },
      ],
    });
    expect(cats.find((c) => c.key === 'cafe')?.items.map((i) => i.name)).toEqual(['커피빈']);
    expect(cats.find((c) => c.key === 'etc')).toBeUndefined();
  });

  it('고정 순서로 반환한다(store→hospital→…→etc)', () => {
    const cats = buildInfraCategories({
      ...empty,
      stores: [
        { id: 1n, name: 'GS25', address: '', industryCode: 'G20405', industryName: '편의점', distanceMeters: 80 },
        { id: 2n, name: '스타벅스', address: '', industryCode: 'I21201', industryName: '카페', distanceMeters: 120 },
      ],
      hospitals: [{ id: 9n, name: '내과', typeName: '의원', address: '', distanceMeters: 100 }],
      parking: [{ id: 7n, name: '공영주차장', address: '', prkplceSe: '공영', prkcmprt: 120, distanceMeters: 150 }],
    });
    expect(cats.map((c) => c.key)).toEqual(['store', 'cafe', 'hospital', 'parking']);
    expect(cats.find((c) => c.key === 'parking')?.items[0].sub).toBe('공영 · 120면');
  });

  it('items가 fetch 한도에 도달하면 capped=true', () => {
    const hospitals = Array.from({ length: INFRA_FETCH_LIMIT }, (_, i) => ({
      id: BigInt(i + 1), name: `병원${i}`, typeName: '의원', address: '', distanceMeters: 100 + i,
    }));
    const cats = buildInfraCategories({ ...empty, hospitals });
    expect(cats.find((c) => c.key === 'hospital')?.capped).toBe(true);
  });

  it('items가 한도 미만이면 capped=false', () => {
    const cats = buildInfraCategories({
      ...empty,
      pharmacies: [{ id: 1n, name: '약국', address: '', tel: null, distanceMeters: 100 }],
    });
    expect(cats.find((c) => c.key === 'pharmacy')?.capped).toBe(false);
  });

  it('childcare가 전달되면 어린이집 카테고리를, 미전달/빈배열이면 카테고리 없음', () => {
    const withCare = buildInfraCategories({
      ...empty,
      childcare: [
        { id: 5n, name: '햇살어린이집', address: '', sigunguCode: null, crType: '국공립', capacity: 60, distanceMeters: 90 },
      ],
    });
    const care = withCare.find((c) => c.key === 'childcare');
    expect(care?.items.map((i) => i.name)).toEqual(['햇살어린이집']);
    expect(care?.items[0]).toMatchObject({ id: '5', sub: '국공립', distanceMeters: 90 });

    expect(buildInfraCategories({ ...empty, childcare: [] }).find((c) => c.key === 'childcare')).toBeUndefined();
    expect(buildInfraCategories(empty).find((c) => c.key === 'childcare')).toBeUndefined();
  });

  it('distanceMeters를 number로 정규화한다(Decimal 등 비원시 입력 방어)', () => {
    // raw 쿼리는 distanceMeters를 Prisma Decimal(객체)로 줄 수 있다. 클라이언트 직렬화를 위해 number여야 한다.
    const decimalLike = { valueOf: () => 80, toString: () => '80' } as unknown as number;
    const cats = buildInfraCategories({
      ...empty,
      stores: [{ id: 1n, name: 'GS25', address: '', industryCode: 'G20405', industryName: '편의점', distanceMeters: decimalLike }],
    });
    const item = cats.find((c) => c.key === 'store')?.items[0];
    expect(typeof item?.distanceMeters).toBe('number');
    expect(item?.distanceMeters).toBe(80);
  });

  it('어린이집은 기타 앞, 마지막 직전에 배치된다', () => {
    const cats = buildInfraCategories({
      ...empty,
      hospitals: [{ id: 9n, name: '내과', typeName: '의원', address: '', distanceMeters: 100 }],
      stores: [{ id: 1n, name: '무인문구', address: '', industryCode: 'Z999', industryName: '기타', distanceMeters: 200 }],
      childcare: [{ id: 5n, name: '햇살어린이집', address: '', sigunguCode: null, crType: '국공립', capacity: 60, distanceMeters: 90 }],
    });
    expect(cats.map((c) => c.key)).toEqual(['hospital', 'childcare', 'etc']);
  });

  it('park/parking/charger 빈 카테고리는 결과에서 제외된다', () => {
    const base = {
      ...empty,
      parks: [{ id: 1n, name: '서울숲', address: '', parkType: '근린공원', area: 1000, distanceMeters: 50 }],
      parking: [{ id: 2n, name: '공영주차장', address: '', prkplceSe: '공영', prkcmprt: 100, distanceMeters: 60 }],
      chargers: [{ id: 3n, name: '급속충전소', address: '', chargeSpeed: '급속', chargerCount: 2, operatorName: null, distanceMeters: 70 }],
    };
    const withAll = buildInfraCategories(base);
    expect(withAll.find((c) => c.key === 'park')?.items.map((i) => i.id)).toEqual(['1']);
    expect(withAll.find((c) => c.key === 'parking')?.items.map((i) => i.id)).toEqual(['2']);
    expect(withAll.find((c) => c.key === 'charger')?.items.map((i) => i.id)).toEqual(['3']);

    const excluded = buildInfraCategories({
      ...base,
      parks: base.parks.filter((p) => p.id !== 1n),
      parking: base.parking.filter((p) => p.id !== 2n),
      chargers: base.chargers.filter((c) => c.id !== 3n),
    });
    expect(excluded.find((c) => c.key === 'park')).toBeUndefined();
    expect(excluded.find((c) => c.key === 'parking')).toBeUndefined();
    expect(excluded.find((c) => c.key === 'charger')).toBeUndefined();
  });
});

describe('infraHref', () => {
  it('id만으로 해석되는 카테고리는 올바른 경로를 만든다', () => {
    expect(infraHref('store', '10')).toBe('/amenity/mart/10');
    expect(infraHref('cafe', '11')).toBe('/amenity/cafe/11');
    expect(infraHref('etc', '12')).toBe('/amenity/convenience/12');
    expect(infraHref('market', '13')).toBe('/amenity/market/13');
    expect(infraHref('park', '14')).toBe('/urban/park/14');
    expect(infraHref('parking', '15')).toBe('/urban/parking/15');
    expect(infraHref('charger', '16')).toBe('/urban/charger/16');
  });

  it('병원·약국·어린이집은 sigunguCode가 있으면 경로, 없으면 null', () => {
    expect(infraHref('hospital', '20', '11680')).toBe('/medical/hospital/11680/20');
    expect(infraHref('pharmacy', '21', '11680')).toBe('/medical/pharmacy/11680/21');
    expect(infraHref('childcare', '22', '11680')).toBe('/childcare/11680/22');

    expect(infraHref('hospital', '20', null)).toBeNull();
    expect(infraHref('pharmacy', '21', undefined)).toBeNull();
    expect(infraHref('childcare', '22', null)).toBeNull();
  });
});
