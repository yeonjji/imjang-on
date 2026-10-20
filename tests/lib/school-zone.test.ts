import { describe, it, expect } from 'vitest';
import { buildSchoolZoneView, formatDistance, type SchoolZoneRow } from '@/lib/insights/school-zone';

const base: Omit<SchoolZoneRow, 'schoolName' | 'isPrimary' | 'schoolId' | 'schoolSigunguCode' | 'distanceM'> = {
  hakgudoId: 'Z1', zoneName: '가남초광역통학구역', kind: 'wide', eduName: '경상남도양산교육지원청', baseDate: new Date('2025-09-22T00:00:00Z'),
};
const row = (schoolName: string, isPrimary: boolean, distanceM: number | null, schoolId: bigint | null = 1n): SchoolZoneRow =>
  ({ ...base, schoolName, isPrimary, distanceM, schoolId, schoolSigunguCode: schoolId ? '48330' : null });

describe('formatDistance', () => {
  it('1km 미만은 10m 단위, 이상은 소수 첫째 km', () => {
    expect(formatDistance(285)).toBe('약 290m');
    expect(formatDistance(4)).toBe('약 10m');
    expect(formatDistance(1358)).toBe('약 1.4km');
  });
});

describe('buildSchoolZoneView', () => {
  it('행이 없으면 null', () => expect(buildSchoolZoneView([])).toBeNull());
  it('광역: 기본 학교와 함께 지정된 학교를 나누고 거리순', () => {
    const v = buildSchoolZoneView([row('양산초등학교', false, 5769), row('가남초등학교', true, 575), row('물금초등학교', false, 1358)])!;
    expect(v.kindLabel).toBe('광역통학구역');
    expect(v.primary.map((s) => s.name)).toEqual(['가남초등학교']);
    expect(v.others.map((s) => s.name)).toEqual(['물금초등학교', '양산초등학교']);
    expect(v.primary[0].href).toBe('/school/48330/1');
    expect(v.baseDateLabel).toBe('2025-09-22');
  });
  it('매칭 안 된 학교는 링크·거리 없음, 목록 끝', () => {
    const v = buildSchoolZoneView([
      { ...row('나래초등학교', true, null, null), kind: 'shared', zoneName: '가람초나래초공동통학구역' },
      { ...row('가람초등학교', true, 300), kind: 'shared', zoneName: '가람초나래초공동통학구역' },
    ])!;
    expect(v.kindLabel).toBe('공동통학구역');
    expect(v.primary.map((s) => s.name)).toEqual(['가람초등학교', '나래초등학교']);
    expect(v.primary[1]).toEqual({ name: '나래초등학교', href: null, distanceLabel: null });
  });
  it('일반은 배지 없음, 공동(일방) 라벨', () => {
    expect(buildSchoolZoneView([{ ...row('서울대청초등학교', true, 285), kind: 'general' }])!.kindLabel).toBeNull();
    expect(buildSchoolZoneView([{ ...row('a초등학교', true, 1), kind: 'shared_oneway' }])!.kindLabel).toBe('공동(일방)통학구역');
  });
});
