import { describe, it, expect } from 'vitest';
import { lineBadge } from '@/lib/subway/line-colors';

describe('lineBadge', () => {
  it('숫자 호선은 번호 라벨 + 지정 색상', () => {
    expect(lineBadge('3호선')).toEqual({ label: '3', color: '#EF7C1C' });
    expect(lineBadge('8호선')).toEqual({ label: '8', color: '#E6186C' });
  });
  it('명칭 노선은 약어 라벨 + 지정 색상', () => {
    expect(lineBadge('신분당선')).toEqual({ label: '신분당', color: '#D4003B' });
  });
  it('미등록 노선은 기본 회색 + 앞 2글자 라벨', () => {
    expect(lineBadge('가상선')).toEqual({ label: '가상', color: '#6B7280' });
  });
});
