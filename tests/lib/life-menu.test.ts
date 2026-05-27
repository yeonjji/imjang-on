import { describe, it, expect } from 'vitest';
import { LIFE_GROUPS } from '@/app/(public)/_components/life-menu';

describe('LIFE_GROUPS', () => {
  it('학교·의료시설·상권·편의·도시인프라 4개 그룹을 가진다', () => {
    expect(LIFE_GROUPS.map((g) => g.label)).toEqual([
      '학교',
      '의료시설',
      '상권·편의',
      '도시인프라',
    ]);
  });

  it('학교 하위는 모두 라이브이고 /school?kind= 로 이동한다', () => {
    const school = LIFE_GROUPS.find((g) => g.route === '/school')!;
    expect(school.items.length).toBe(4);
    expect(school.items.every((i) => i.live)).toBe(true);
    expect(school.items.every((i) => i.href.startsWith('/school?kind='))).toBe(true);
  });

  it('학교 외 그룹 하위는 아직 라이브가 아니다', () => {
    const others = LIFE_GROUPS.filter((g) => g.route !== '/school');
    expect(others.flatMap((g) => g.items).every((i) => !i.live)).toBe(true);
  });

  it('데이터 없는 항목(보건소·주차장)만 soon 배지를 가진다', () => {
    const soon = LIFE_GROUPS.flatMap((g) => g.items).filter((i) => i.soon);
    expect(soon.map((i) => i.label)).toEqual(['보건소', '주차장']);
  });

  it('모든 하위 href는 자기 그룹 route 로 시작한다', () => {
    for (const g of LIFE_GROUPS) {
      for (const i of g.items) {
        expect(i.href.startsWith(g.route)).toBe(true);
      }
    }
  });
});
