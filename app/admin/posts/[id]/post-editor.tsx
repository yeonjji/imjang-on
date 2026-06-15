'use client';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PostType, PostCategory } from '@prisma/client';
import { BOARD_CATEGORIES } from '@/lib/board/labels';
import { savePostAction, publishPostAction, rejectPostAction, deletePostAction } from '../actions';

const TYPES: { value: PostType; label: string }[] = [
  { value: 'PROGRAM', label: '제도·상품' },
  { value: 'TREND', label: '이슈·동향' },
];

interface Props {
  id: string;
  title: string;
  summary: string;
  body: string;
  type: PostType;
  category: PostCategory;
}

export function PostEditor({ id, title, summary, body: initialBody, type, category }: Props) {
  const [body, setBody] = useState(initialBody);

  return (
    <form className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />

      <label className="text-sm font-semibold text-[var(--color-muted)]">
        제목
        <input name="title" defaultValue={title} className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-base text-[var(--color-text)]" />
      </label>

      <label className="text-sm font-semibold text-[var(--color-muted)]">
        요약
        <input name="summary" defaultValue={summary} className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-base text-[var(--color-text)]" />
      </label>

      <div className="flex gap-4">
        <label className="text-sm font-semibold text-[var(--color-muted)]">
          유형
          <select name="type" defaultValue={type} className="mt-1 block rounded-lg border border-[var(--color-line)] px-3 py-2 text-base">
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-[var(--color-muted)]">
          카테고리
          <select name="category" defaultValue={category} className="mt-1 block rounded-lg border border-[var(--color-line)] px-3 py-2 text-base">
            {BOARD_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <label className="text-sm font-semibold text-[var(--color-muted)]">
          본문 (마크다운)
          <textarea
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={24}
            className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 font-mono text-sm text-[var(--color-text)]"
          />
        </label>
        <div className="text-sm font-semibold text-[var(--color-muted)]">
          미리보기
          <div className="board-prose mt-1 rounded-lg border border-[var(--color-line)] bg-white px-4 py-3 text-[15px] leading-relaxed text-[var(--color-text)]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button formAction={savePostAction} className="rounded-lg border border-[var(--color-line)] px-4 py-2 font-semibold text-[var(--color-text)]">저장</button>
        <button formAction={publishPostAction} className="rounded-lg bg-[var(--color-blue)] px-4 py-2 font-semibold text-white">게시</button>
        <button formAction={rejectPostAction} className="rounded-lg border border-[var(--color-line)] px-4 py-2 font-semibold text-[var(--color-muted)]">반려</button>
        <button formAction={deletePostAction} className="rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-600">삭제</button>
      </div>
    </form>
  );
}
