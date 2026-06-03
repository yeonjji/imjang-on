import { describe, it, expect } from 'vitest';
import { classifyStore, buildInfraCategories, INFRA_FETCH_LIMIT, type RawInfra } from '@/lib/amenity/infra';

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
      stores: [{ id: 1n, name: 'GS25', address: '', industryCode: 'G20405', industryName: '편의점', distanceMeters: 80 }],
      hospitals: [{ id: 9n, name: '내과', typeName: '의원', address: '', distanceMeters: 100 }],
      parking: [{ id: 7n, name: '공영주차장', address: '', prkplceSe: '공영', prkcmprt: 120, distanceMeters: 150 }],
    });
    expect(cats.map((c) => c.key)).toEqual(['store', 'hospital', 'parking']);
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
});
