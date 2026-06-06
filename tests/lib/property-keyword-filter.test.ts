import { describe, it, expect } from 'vitest';
import { buildKeywordCondition } from '@/lib/property';

describe('buildKeywordCondition', () => {
  it('q 미지정/공백이면 undefined', () => {
    expect(buildKeywordCondition(undefined)).toBeUndefined();
    expect(buildKeywordCondition('')).toBeUndefined();
    expect(buildKeywordCondition('   ')).toBeUndefined();
  });

  it('단지명(정규화) OR 지역명(원문) 부분일치 조건 반환', () => {
    expect(buildKeywordCondition('래미안 ')).toEqual({
      OR: [
        { nameNorm: { contains: '래미안' } },
        { region: { is: { fullName: { contains: '래미안' } } } },
      ],
    });
  });

  it('공백·기호가 섞인 단지명은 nameNorm 매칭용으로 정규화된다', () => {
    expect(buildKeywordCondition('강남 자이')).toEqual({
      OR: [
        { nameNorm: { contains: '강남자이' } },
        { region: { is: { fullName: { contains: '강남 자이' } } } },
      ],
    });
  });
});
