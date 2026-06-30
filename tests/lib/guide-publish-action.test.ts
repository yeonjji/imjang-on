import { describe, it, expect, vi, beforeEach } from 'vitest';

// next/cache·navigation·admin row 함수를 모킹해 서버 액션을 순수 호출한다.
// vi.mock 팩토리는 호이스팅되므로 vi.hoisted로 모킹 함수를 함께 끌어올린다.
const { revalidatePath, redirect, publishGuideRow, updateGuideRow } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT'); // 실제 redirect와 동일하게 실행 흐름을 끊는다.
  }),
  publishGuideRow: vi.fn(async () => ({ slug: '학교알리미로학교정보쉽게확인하는방법' })),
  updateGuideRow: vi.fn(async () => {}),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('next/navigation', () => ({ redirect, notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }) }));
vi.mock('@/lib/guide/admin', () => ({
  publishGuideRow,
  updateGuideRow,
  rejectGuideRow: vi.fn(),
  deleteGuideRow: vi.fn(),
}));

import { publishGuideAction } from '@/app/admin/guides/actions';

function fd(): FormData {
  const f = new FormData();
  f.set('id', '13');
  f.set('title', '학교알리미로 학교 정보 쉽게 확인하는 방법');
  f.set('summary', '학교알리미에서 학교 정보를 확인하는 방법을 설명합니다.');
  f.set('body', '## 핵심 요약\n- 본문');
  f.set('category', 'SCHOOL');
  return f;
}

describe('publishGuideAction revalidatePath', () => {
  beforeEach(() => revalidatePath.mockClear());

  it('한글 slug를 revalidatePath 인자로 넘기지 않는다(헤더 ByteString 오류 회귀 방지)', async () => {
    await expect(publishGuideAction(fd())).rejects.toThrow('NEXT_REDIRECT');
    // 모든 revalidatePath 인자는 Latin-1(charCode < 256)이어야 한다 — 비ASCII면 Vercel에서 500.
    for (const call of revalidatePath.mock.calls) {
      for (const arg of call) {
        if (typeof arg !== 'string') continue;
        for (const ch of arg) {
          expect(ch.charCodeAt(0)).toBeLessThan(256);
        }
      }
    }
  });

  it('가이드 상세는 동적 라우트 형태로 무효화한다', async () => {
    await expect(publishGuideAction(fd())).rejects.toThrow('NEXT_REDIRECT');
    expect(revalidatePath).toHaveBeenCalledWith('/guide/[slug]', 'page');
    expect(revalidatePath).toHaveBeenCalledWith('/guide');
  });
});
