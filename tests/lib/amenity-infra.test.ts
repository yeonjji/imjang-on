import { describe, it, expect } from 'vitest';
import { classifyStore, buildInfraCategories, type RawInfra } from '@/lib/amenity/infra';

describe('classifyStore', () => {
  it('편의점·마트·슈퍼 prefix는 mart', () => {
    for (const c of ['G20405', 'G20404', 'G20402', 'G2040501']) {
      expect(classifyStore(c)).toBe('mart');
    }
  });
  it('카페·기타·null은 etc', () => {
    for (const c of ['I21201', 'Z999', null]) {
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

  it('Store를 편의·마트(store)와 기타(etc)로 분리한다', () => {
    const cats = buildInfraCategories({
      ...empty,
      stores: [
        { id: 1n, name: 'GS25', address: '', industryCode: 'G20405', industryName: '편의점', distanceMeters: 80 },
        { id: 2n, name: '스타벅스', address: '', industryCode: 'I21201', industryName: '카페', distanceMeters: 120 },
      ],
    });
    const store = cats.find((c) => c.key === 'store');
    const etc = cats.find((c) => c.key === 'etc');
    expect(store?.items.map((i) => i.name)).toEqual(['GS25']);
    expect(etc?.items.map((i) => i.name)).toEqual(['스타벅스']);
    expect(store?.items[0]).toMatchObject({ id: '1', sub: '편의점', distanceMeters: 80 });
  });

  it('의료·약국 Store는 기타(etc)에서 제외한다', () => {
    const cats = buildInfraCategories({
      ...empty,
      stores: [
        { id: 1n, name: '커피빈', address: '', industryCode: 'I21201', industryName: '카페', distanceMeters: 100 },
        { id: 2n, name: '수서가정의학과의원', address: '', industryCode: 'Q10209', industryName: '기타 의원', distanceMeters: 120 },
        { id: 3n, name: '국송약국', address: '', industryCode: 'G21501', industryName: '약국', distanceMeters: 130 },
      ],
    });
    const etc = cats.find((c) => c.key === 'etc');
    expect(etc?.items.map((i) => i.name)).toEqual(['커피빈']);
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
});
