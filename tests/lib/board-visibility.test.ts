import { describe, it, expect, afterEach } from 'vitest';
import { isBoardPublic } from '@/lib/board/visibility';

const original = process.env.NEXT_PUBLIC_BOARD_ENABLED;
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_BOARD_ENABLED;
  else process.env.NEXT_PUBLIC_BOARD_ENABLED = original;
});

describe('isBoardPublic', () => {
  it('기본(미설정)은 비공개', () => {
    delete process.env.NEXT_PUBLIC_BOARD_ENABLED;
    expect(isBoardPublic()).toBe(false);
  });
  it('"true"일 때만 공개', () => {
    process.env.NEXT_PUBLIC_BOARD_ENABLED = 'true';
    expect(isBoardPublic()).toBe(true);
  });
  it('"false"·기타 값은 비공개', () => {
    process.env.NEXT_PUBLIC_BOARD_ENABLED = 'false';
    expect(isBoardPublic()).toBe(false);
    process.env.NEXT_PUBLIC_BOARD_ENABLED = '1';
    expect(isBoardPublic()).toBe(false);
  });
});
