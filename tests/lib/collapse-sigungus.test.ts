import { describe, it, expect } from 'vitest';
import { collapseSigungus } from '@/lib/region';

describe('collapseSigungus', () => {
  it('일반 시군구는 코드당 1행 그대로 유지한다', () => {
    const out = collapseSigungus([
      { sido: '서울특별시', sigungu: '강남구', sigunguCode: '11680' },
      { sido: '서울특별시', sigungu: '송파구', sigunguCode: '11710' },
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.sigunguCode === '11680')?.sigungu).toBe('강남구');
  });

  it('세종처럼 여러 동이 한 sigunguCode를 공유하면 1건으로 접고 라벨은 시 이름을 쓴다', () => {
    const out = collapseSigungus([
      { sido: '세종특별자치시', sigungu: '한솔동', sigunguCode: '36110' },
      { sido: '세종특별자치시', sigungu: '도담동', sigunguCode: '36110' },
      { sido: '세종특별자치시', sigungu: '아름동', sigunguCode: '36110' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ sido: '세종특별자치시', sigungu: '세종특별자치시', sigunguCode: '36110' });
  });

  it('sigunguCode가 null인 행은 제외한다', () => {
    const out = collapseSigungus([
      { sido: '서울특별시', sigungu: '강남구', sigunguCode: '11680' },
      { sido: '어딘가', sigungu: '무명', sigunguCode: null },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].sigunguCode).toBe('11680');
  });

  it('sigungu 이름이 null인 단일 행은 시 이름으로 폴백한다', () => {
    const out = collapseSigungus([
      { sido: '세종특별자치시', sigungu: null, sigunguCode: '36110' },
    ]);
    expect(out).toEqual([{ sido: '세종특별자치시', sigungu: '세종특별자치시', sigunguCode: '36110' }]);
  });
});
