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

  it('의료시설·도시인프라 그룹 하위는 아직 라이브가 아니다', () => {
    const others = LIFE_GROUPS.filter(
      (g) => g.label !== '교육시설' && g.label !== '상권·편의',
    );
    expect(others.flatMap((g) => g.items).every((i) => !i.live)).toBe(true);
  });

  it('데이터 없는 항목(보건소·주차장)만 soon 배지를 가진다', () => {
    const soon = LIFE_GROUPS.flatMap((g) => g.items).filter((i) => i.soon);
    expect(soon.map((i) => i.label)).toEqual(['보건소', '주차장']);
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
