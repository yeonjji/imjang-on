import { describe, it, expect } from 'vitest';
import { buildHubSummaryLines } from '@/lib/hub-summary/prose';
import type { HubSummaryData } from '@/lib/hub-summary/types';

const sidoCase: HubSummaryData = {
  kind: 'amenity', categoryLabel: '카페', scopeLabel: '서울', scopeLevel: 'sido',
  total: 21619,
  topRegions: [
    { name: '강남구', count: 2100 },
    { name: '마포구', count: 1340 },
    { name: '송파구', count: 980 },
  ],
  concentrationPct: 21,
};

const nationCase: HubSummaryData = {
  kind: 'medical', categoryLabel: '병원·의원', scopeLabel: '전국', scopeLevel: 'nation',
  total: 79562,
  topRegions: [
    { name: '경기도', count: 17234 },
    { name: '서울특별시', count: 14012 },
    { name: '부산광역시', count: 5210 },
  ],
  concentrationPct: 46,
};

describe('buildHubSummaryLines', () => {
  it('sido 스코프: 시·군·구 분포 + 상위3 비중', () => {
    const lines = buildHubSummaryLines(sidoCase);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('서울에 등록된 카페는 21,619곳입니다.');
    expect(lines[1]).toContain('시·군·구별 분포');
    expect(lines[1]).toContain('강남구(2,100)·마포구(1,340)·송파구(980)');
    expect(lines[1]).toContain('상위 3개 시·군·구가 전체의 약 21% 비중');
    expect(lines[1]).not.toContain('밀집도');
    expect(lines[1]).not.toContain('수도권');
  });

  it('nation 스코프: 시·도 분포', () => {
    const lines = buildHubSummaryLines(nationCase);
    expect(lines[0]).toBe('전국에 등록된 병원·의원은 79,562곳입니다.');
    expect(lines[1]).toContain('시·도별 분포');
    expect(lines[1]).toContain('상위 3개 시·도가 전체의 약 46% 비중');
  });

  it('조사: 받침 없는 단어는 "는", 있는 단어는 "은"', () => {
    expect(buildHubSummaryLines(sidoCase)[0]).toContain('카페는');
    expect(buildHubSummaryLines(nationCase)[0]).toContain('병원·의원은');
    const offi = { ...nationCase, categoryLabel: '오피스텔' };
    expect(buildHubSummaryLines(offi)[0]).toContain('오피스텔은');
  });

  it('폴백: total 0 → 빈 배열', () => {
    expect(buildHubSummaryLines({ ...sidoCase, total: 0 })).toEqual([]);
  });

  it('폴백: sigungu 스코프 → 사실 문장 1개, 분포·비중 없음', () => {
    const lines = buildHubSummaryLines({
      kind: 'amenity', categoryLabel: '카페', scopeLabel: '서울특별시 강남구',
      scopeLevel: 'sigungu', total: 2100, topRegions: [],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('서울특별시 강남구에 등록된 카페는 2,100곳입니다.');
  });

  it('폴백: total이 임계값 미만 → 사실 문장 1개', () => {
    const lines = buildHubSummaryLines({ ...sidoCase, total: 12, concentrationPct: 90 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('12곳입니다');
  });

  it('폴백: 지역 3개 미만 → 사실 문장 1개', () => {
    const lines = buildHubSummaryLines({ ...sidoCase, topRegions: sidoCase.topRegions.slice(0, 2) });
    expect(lines).toHaveLength(1);
  });

  it('highlights를 정체·분포 뒤에 이어 붙인다', () => {
    const lines = buildHubSummaryLines({
      kind: 'medical', categoryLabel: '병원·의원', scopeLabel: '전국', scopeLevel: 'nation',
      total: 79562,
      topRegions: [
        { name: '경기도', count: 17234 }, { name: '서울특별시', count: 14012 }, { name: '부산광역시', count: 5210 },
      ],
      concentrationPct: 46,
      highlights: ['종합병원 350곳·병원 3,900곳·의원 3.6만곳 등으로 구성됩니다.'],
    });
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('종합병원 350곳·병원 3,900곳·의원 3.6만곳 등으로 구성됩니다.');
  });

  it('폴백(정체만)일 때도 highlights는 이어 붙는다', () => {
    const lines = buildHubSummaryLines({
      kind: 'property', categoryLabel: '오피스텔', scopeLabel: '전국', scopeLevel: 'nation',
      total: 12, topRegions: [], highlights: ['최근 1년 거래는 매매가 가장 많았습니다.'],
    });
    expect(lines).toHaveLength(2); // 정체 + highlight
    expect(lines[1]).toBe('최근 1년 거래는 매매가 가장 많았습니다.');
  });

  it('total 0이면 highlights가 있어도 빈 배열', () => {
    expect(buildHubSummaryLines({
      kind: 'property', categoryLabel: '오피스텔', scopeLabel: '전국', scopeLevel: 'nation',
      total: 0, topRegions: [], highlights: ['x'],
    })).toEqual([]);
  });

  it('근접중복 방지: 서로 다른 입력은 서로 다른 문자열', () => {
    const a = buildHubSummaryLines(sidoCase).join(' ');
    const b = buildHubSummaryLines({ ...sidoCase, scopeLabel: '부산',
      topRegions: [{ name: '해운대구', count: 800 }, { name: '부산진구', count: 720 }, { name: '남구', count: 510 }],
      total: 9800, concentrationPct: 21 }).join(' ');
    expect(a).not.toBe(b);
  });
});
