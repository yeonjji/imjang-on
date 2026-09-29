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
  it('AdSense 검증 기간 비공개 — env와 무관하게 항상 false', () => {
    delete process.env.NEXT_PUBLIC_BOARD_ENABLED;
    expect(isBoardPublic()).toBe(false);
    process.env.NEXT_PUBLIC_BOARD_ENABLED = 'true';
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
  it('비공개 동안 토큰 없으면 거부, 관리자 토큰이면 허용', () => {
    delete process.env.NEXT_PUBLIC_BOARD_ENABLED;
    delete process.env.BOARD_PREVIEW_TOKEN;
    expect(canViewBoard(undefined)).toBe(false);
    expect(canViewBoard('anything')).toBe(false);
    process.env.BOARD_PREVIEW_TOKEN = 'secret123';
    expect(canViewBoard('secret123')).toBe(true);
  });
});
