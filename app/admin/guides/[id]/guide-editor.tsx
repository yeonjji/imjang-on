'use client';
import { useState, useActionState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { GuideCategory } from '@prisma/client';
import { GUIDE_CATEGORIES } from '@/lib/guide/labels';
import { saveGuideAction, publishGuideAction, rejectGuideAction, deleteGuideAction } from '../actions';

interface Props {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: GuideCategory;
}

export function GuideEditor({ id, title, summary, body: initialBody, category }: Props) {
  const [body, setBody] = useState(initialBody);
  const [saveState, saveAction, saving] = useActionState(saveGuideAction, null);

  return (
    <form action={saveAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />

      <label className="text-sm font-semibold text-[var(--color-muted)]">
        제목
        <input name="title" defaultValue={title} className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-base text-[var(--color-text)]" />
      </label>

      <label className="text-sm font-semibold text-[var(--color-muted)]">
        요약
        <input name="summary" defaultValue={summary} className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-base text-[var(--color-text)]" />
      </label>

      <label className="text-sm font-semibold text-[var(--color-muted)]">
        카테고리
        <select name="category" defaultValue={category} className="mt-1 block rounded-lg border border-[var(--color-line)] px-3 py-2 text-base">
          {GUIDE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </label>

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
            <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{body}</ReactMarkdown>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className="rounded-lg border border-[var(--color-line)] px-4 py-2 font-semibold text-[var(--color-text)] disabled:opacity-50">
          {saving ? '저장 중…' : '저장'}
        </button>
        {saveState?.ok === true && <span className="text-sm font-medium text-green-600">저장됨</span>}
        {saveState?.ok === false && <span className="text-sm font-medium text-red-600">저장 실패</span>}
        <button formAction={publishGuideAction} className="rounded-lg bg-[var(--color-blue)] px-4 py-2 font-semibold text-white">게시</button>
        <button formAction={rejectGuideAction} className="rounded-lg border border-[var(--color-line)] px-4 py-2 font-semibold text-[var(--color-muted)]">반려</button>
        <button formAction={deleteGuideAction} className="rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-600">삭제</button>
      </div>
    </form>
  );
}
