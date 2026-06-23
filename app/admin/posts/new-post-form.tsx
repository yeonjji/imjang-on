'use client';
import { useState, useActionState } from 'react';
import Link from 'next/link';
import { generateFromTopicAction, type TopicGenResult } from './actions';

const card = 'mt-6 rounded-xl border border-[var(--color-line)] bg-white p-5';
const input = 'w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-base text-[var(--color-text)]';

export function NewPostForm() {
  const [topic, setTopic] = useState('');
  const [state, action, pending] = useActionState<TopicGenResult | null, FormData>(generateFromTopicAction, null);
  const showFallback = state?.status === 'insufficient';

  return (
    <form action={action} className={card}>
      <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">주제로 새 글 생성</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        주제를 입력하면 공공저작물(공공누리 이용가능)에서 근거를 모아 초안을 만듭니다. 근거를 못 찾으면 직접 붙여넣을 수 있습니다.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          name="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="예: 전세 사기 예방 제도"
          className={`${input} flex-1 min-w-[240px]`}
        />
        <button
          type="submit"
          disabled={pending || !topic.trim()}
          className="rounded-lg bg-[var(--color-blue)] px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {pending ? '검색·생성 중… (최대 1분)' : '생성'}
        </button>
      </div>

      {state?.status === 'created' && (
        <p className="mt-3 text-sm font-medium text-green-600">
          초안 생성됨 —{' '}
          <Link href={`/admin/posts/${state.id}`} className="underline">검수하러 가기 ↗</Link>
        </p>
      )}
      {state?.status === 'duplicate' && (
        <p className="mt-3 text-sm font-medium text-[var(--color-muted)]">오늘 같은 주제의 초안이 이미 있습니다.</p>
      )}
      {state?.status === 'config_error' && (
        <p className="mt-3 text-sm font-medium text-red-600">OPENAI_API_KEY 미설정 — 운영 환경변수를 확인하세요.</p>
      )}
      {state?.status === 'rejected' && (
        <p className="mt-3 text-sm font-medium text-red-600">가드레일 미통과: {state.violations.join(', ')}</p>
      )}
      {state?.status === 'error' && (
        <p className="mt-3 text-sm font-medium text-red-600">오류: {state.message}</p>
      )}

      {state?.status === 'insufficient' && (
        <div className="mt-3">
          <p className="text-sm font-medium text-[var(--color-muted)]">
            공공누리 이용가능 근거를 찾지 못했습니다. 아래에 공식 자료를 직접 붙여넣어 다시 생성하세요.
          </p>
          {state.sources.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-[var(--color-muted)]">
              {state.sources.map((s) => (
                <li key={s.url}>
                  {s.domain} · 공공누리 {s.koglType} · {s.usable ? '사용가능' : '배제'} — {s.url}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showFallback && (
        <div className="mt-3 flex flex-col gap-2">
          <input name="pastedSourceName" placeholder="출처 기관명 (예: 국토교통부)" className={input} />
          <input name="pastedSourceUrl" placeholder="출처 URL" className={input} />
          <textarea
            name="pastedSource"
            rows={10}
            placeholder="공식 자료 본문을 붙여넣으세요"
            className={`${input} font-mono text-sm`}
          />
        </div>
      )}
    </form>
  );
}
