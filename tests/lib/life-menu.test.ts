import { describe, it, expect } from 'vitest';
import { LIFE_GROUPS } from '@/app/(public)/_components/life-menu';

describe('LIFE_GROUPS', () => {
  it('교육시설·의료시설·상권·편의·도시인프라 4개 그룹을 가진다', () => {
    expect(LIFE_GROUPS.map((g) => g.label)).toEqual([
      '교육시설',
      '의료시설',
      '상권·편의',
      '도시인프라',
    ]);
  });

  it('교육시설 하위는 학교(live, /school)와 어린이집(soon, /childcare)이다', () => {
    const edu = LIFE_GROUPS.find((g) => g.label === '교육시설')!;
    expect(edu.items).toEqual([
      { label: '학교', href: '/school', live: true },
      { label: '어린이집', href: '/childcare', live: false, soon: true },
    ]);
  });

  it('교육시설 외 그룹 하위는 아직 라이브가 아니다', () => {
    const others = LIFE_GROUPS.filter((g) => g.label !== '교육시설');
    expect(others.flatMap((g) => g.items).every((i) => !i.live)).toBe(true);
  });

  it('데이터 없는 항목(어린이집·보건소·주차장)만 soon 배지를 가진다', () => {
    const soon = LIFE_GROUPS.flatMap((g) => g.items).filter((i) => i.soon);
    expect(soon.map((i) => i.label)).toEqual(['어린이집', '보건소', '주차장']);
  });
});
