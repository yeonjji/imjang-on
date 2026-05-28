import { describe, it, expect } from 'vitest';
import { getSiblingTabs } from '@/lib/life/sibling-tabs';

describe('getSiblingTabs', () => {
  it('/school은 교육시설 그룹을 반환하고 학교가 활성이다', () => {
    const r = getSiblingTabs('/school');
    expect(r).not.toBeNull();
    expect(r!.group.slug).toBe('education');
    expect(r!.activeLabel).toBe('학교');
    expect(r!.items.map((i) => i.label)).toEqual(['학교', '어린이집']);
  });

  it('/amenity/convenience는 상권·편의 그룹을 반환하고 편의점이 활성이다', () => {
    const r = getSiblingTabs('/amenity/convenience');
    expect(r).not.toBeNull();
    expect(r!.group.slug).toBe('amenity');
    expect(r!.activeLabel).toBe('편의점');
    expect(r!.items).toHaveLength(4);
  });

  it('/amenity/mart, /amenity/cafe, /amenity/market 모두 상권·편의 그룹으로 매칭된다', () => {
    for (const href of ['/amenity/mart', '/amenity/cafe', '/amenity/market']) {
      const r = getSiblingTabs(href);
      expect(r?.group.slug, href).toBe('amenity');
    }
  });

  it('LIFE_GROUPS에 등록되지 않은 path는 null을 반환한다', () => {
    expect(getSiblingTabs('/unknown')).toBeNull();
    expect(getSiblingTabs('/amenity/convenience?sido=서울')).toBeNull();
  });
});
