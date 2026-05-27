import { describe, it, expect } from 'vitest';
import { buildSchoolWhere } from '@/lib/school';

describe('buildSchoolWhere', () => {
  it('시군구만 있으면 sigunguCode 조건', () => {
    expect(buildSchoolWhere({ sigunguCode: '11680' })).toEqual({ sigunguCode: '11680' });
  });
  it('시도만 있으면 region 조건', () => {
    expect(buildSchoolWhere({ sido: '서울특별시' })).toEqual({ region: '서울특별시' });
  });
  it('아무 지역도 없으면 빈 조건', () => {
    expect(buildSchoolWhere({})).toEqual({});
  });
  it('시군구가 시도보다 우선', () => {
    const w = buildSchoolWhere({ sido: '서울특별시', sigunguCode: '11680' });
    expect(w.sigunguCode).toBe('11680');
    expect(w.region).toBeUndefined();
  });
  it('학교급 필터를 schoolKind로 매핑', () => {
    expect(buildSchoolWhere({ sigunguCode: '11680', kind: 'elem' }).schoolKind).toBe('초등학교');
    expect(buildSchoolWhere({ sigunguCode: '11680', kind: 'mid' }).schoolKind).toBe('중학교');
    expect(buildSchoolWhere({ sigunguCode: '11680', kind: 'high' }).schoolKind).toBe('고등학교');
    expect(buildSchoolWhere({ sigunguCode: '11680', kind: 'special' }).schoolKind).toBe('특수학교');
  });
  it('설립유형: 국공립은 공립+국립, 사립은 사립', () => {
    expect(buildSchoolWhere({ sigunguCode: '11680', found: 'public' }).foundType).toEqual({ in: ['공립', '국립'] });
    expect(buildSchoolWhere({ sigunguCode: '11680', found: 'private' }).foundType).toBe('사립');
  });
  it('남녀공학 필터(DB값 남여공학)', () => {
    expect(buildSchoolWhere({ sigunguCode: '11680', coedu: 'co' }).coeduType).toBe('남여공학');
    expect(buildSchoolWhere({ sigunguCode: '11680', coedu: 'male' }).coeduType).toBe('남');
    expect(buildSchoolWhere({ sigunguCode: '11680', coedu: 'female' }).coeduType).toBe('여');
  });
  it('이름 검색은 contains', () => {
    expect(buildSchoolWhere({ sigunguCode: '11680', q: '대청' }).name).toEqual({ contains: '대청' });
  });
  it('전체(all)는 조건에서 제외', () => {
    const w = buildSchoolWhere({ sigunguCode: '11680', kind: 'all', found: 'all', coedu: 'all' });
    expect(w.schoolKind).toBeUndefined();
    expect(w.foundType).toBeUndefined();
    expect(w.coeduType).toBeUndefined();
  });
});
