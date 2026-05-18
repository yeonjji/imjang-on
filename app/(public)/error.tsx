'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      <h1 className="text-2xl font-bold text-[var(--color-blue-dark)]">문제가 발생했어요</h1>
      <p className="mt-2 text-[var(--color-muted)]">잠시 후 다시 시도해주세요.</p>
      <button
        onClick={reset}
        className="mt-6 rounded-full bg-[var(--color-blue)] px-5 py-2.5 font-bold text-white"
      >
        다시 시도
      </button>
    </div>
  );
}
