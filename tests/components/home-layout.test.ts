import { describe, it, expect } from 'vitest';
import { heroRowClass } from '@/app/(public)/_components/home-layout';

describe('heroRowClass', () => {
  // 명시적 31fr 트랙은 콘텐츠가 비어도 자기 몫의 공간을 그대로 차지한다. 패널이
  // 없을 때 그리드를 켜 두면 1280px 이상에서 오른쪽에 약 340px 빈 칸이 남는다.
  it('패널이 없으면 그리드를 켜지 않는다', () => {
    expect(heroRowClass(false)).toBe('');
  });

  it('패널이 있으면 xl부터 69:31 두 칸으로 나눈다', () => {
    const cls = heroRowClass(true);
    expect(cls).toContain('xl:grid');
    expect(cls).toContain('xl:grid-cols-[69fr_31fr]');
    expect(cls).toContain('xl:gap-10');
  });

  // 각 열이 자기 콘텐츠 높이를 갖게 하는 것이 이 작업의 목적이다. stretch(기본값)로
  // 두면 짧은 쪽이 긴 쪽에 맞춰 늘어나 여백 문제가 그대로 남는다.
  it('두 열의 높이를 서로에게 맞추지 않는다', () => {
    expect(heroRowClass(true)).toContain('xl:items-start');
  });

  // lg(1024px)에서 나누면 카드 콘텐츠가 248px인데 필터 1줄이 258px이라 줄바꿈되고
  // 거래 행이 카드 밖으로 넘친다(실측).
  it('lg에서는 나누지 않는다', () => {
    expect(heroRowClass(true)).not.toContain('lg:grid');
  });
});
