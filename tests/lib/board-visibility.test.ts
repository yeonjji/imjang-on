import { describe, it, expect, afterEach } from 'vitest';
import { isBoardPublic, isBoardPreview, canViewBoard } from '@/lib/board/visibility';

const origEnabled = process.env.NEXT_PUBLIC_BOARD_ENABLED;
const origToken = process.env.BOARD_PREVIEW_TOKEN;
afterEach(() => {
  if (origEnabled === undefined) delete process.env.NEXT_PUBLIC_BOARD_ENABLED;
  else process.env.NEXT_PUBLIC_BOARD_ENABLED = origEnabled;
  if (origToken === undefined) delete process.env.BOARD_PREVIEW_TOKEN;
  else process.env.BOARD_PREVIEW_TOKEN = origToken;
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

describe('isBoardPreview', () => {
  it('토큰 미설정이면 항상 false', () => {
    delete process.env.BOARD_PREVIEW_TOKEN;
    expect(isBoardPreview('anything')).toBe(false);
  });
  it('토큰 일치해야 true', () => {
    process.env.BOARD_PREVIEW_TOKEN = 'secret123';
    expect(isBoardPreview('secret123')).toBe(true);
    expect(isBoardPreview('wrong')).toBe(false);
    expect(isBoardPreview(undefined)).toBe(false);
  });
});

describe('canViewBoard', () => {
  it('공개 OFF + 토큰 일치면 미리보기 허용', () => {
    delete process.env.NEXT_PUBLIC_BOARD_ENABLED;
    process.env.BOARD_PREVIEW_TOKEN = 'secret123';
    expect(canViewBoard('secret123')).toBe(true);
    expect(canViewBoard('nope')).toBe(false);
    expect(canViewBoard(undefined)).toBe(false);
  });
  it('공개 ON이면 토큰 없이도 허용', () => {
    process.env.NEXT_PUBLIC_BOARD_ENABLED = 'true';
    expect(canViewBoard(undefined)).toBe(true);
  });
});
