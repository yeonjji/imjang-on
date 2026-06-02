import { describe, it, expect } from 'vitest';
import { LIFE_GROUPS, LIFE_ITEM_EMOJI } from '@/app/(public)/_components/life-menu';

describe('LIFE_GROUPS', () => {
  it('교육시설·의료시설·상권·편의·도시인프라 4개 그룹을 가진다', () => {
    expect(LIFE_GROUPS.map((g) => g.label)).toEqual([
      '교육시설',
      '의료시설',
      '상권·편의',
      '도시인프라',
    ]);
  });

  it('교육시설 하위는 학교(live, /school)와 어린이집(live, /childcare)이다', () => {
    const edu = LIFE_GROUPS.find((g) => g.label === '교육시설')!;
    expect(edu.items).toEqual([
      { label: '학교', href: '/school', live: true },
      { label: '어린이집', href: '/childcare', live: true },
    ]);
  });

  it('상권·편의 4종(편의점·마트·카페·전통시장)은 /amenity/[category]로 라이브이다', () => {
    const amenity = LIFE_GROUPS.find((g) => g.label === '상권·편의')!;
    expect(amenity.items).toEqual([
      { label: '편의점', href: '/amenity/convenience', live: true },
      { label: '마트', href: '/amenity/mart', live: true },
      { label: '카페', href: '/amenity/cafe', live: true },
      { label: '전통시장', href: '/amenity/market', live: true },
    ]);
  });

  it('의료시설 그룹 — 병원·의원은 라이브, 약국·보건소는 미라이브이다', () => {
    const medical = LIFE_GROUPS.find((g) => g.label === '의료시설')!;
    expect(medical.items.find((i) => i.label === '병원·의원')?.live).toBe(true);
    expect(medical.items.find((i) => i.label === '병원·의원')?.href).toBe('/medical/hospital');
    expect(medical.items.filter((i) => i.label !== '병원·의원').every((i) => !i.live)).toBe(true);
  });

  it('도시인프라 그룹 — 주차장·공원·충전소 모두 라이브이다', () => {
    const urban = LIFE_GROUPS.find((g) => g.label === '도시인프라')!;
    expect(urban.items).toEqual([
      { label: '주차장', href: '/urban/parking', live: true },
      { label: '공원',   href: '/urban/park',    live: true },
      { label: '충전소', href: '/urban/charger', live: true },
    ]);
  });

  it('데이터 없는 항목(보건소)만 soon 배지를 가진다', () => {
    const soon = LIFE_GROUPS.flatMap((g) => g.items).filter((i) => i.soon);
    expect(soon.map((i) => i.label)).toEqual(['보건소']);
  });

  it('모든 그룹은 비어있지 않은 intro(소개 1줄)를 가진다', () => {
    for (const g of LIFE_GROUPS) {
      expect(typeof g.intro).toBe('string');
      expect(g.intro.length).toBeGreaterThan(0);
    }
  });

  it('LIFE_ITEM_EMOJI는 모든 하위 항목 label에 대해 이모지를 가진다', () => {
    const labels = LIFE_GROUPS.flatMap((g) => g.items.map((i) => i.label));
    for (const label of labels) {
      expect(LIFE_ITEM_EMOJI[label], `emoji missing for ${label}`).toBeTruthy();
    }
  });
});
