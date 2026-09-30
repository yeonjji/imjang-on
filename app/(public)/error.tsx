'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ErrorState, ERROR_QUICK_LINKS } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { isStaleChunkError, reloadIfStaleChunk } from '@/lib/stale-chunk';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // 배포 직후 옛 청크 에러는 새로고침 한 번이면 풀린다 — 그동안 500 화면을 보이지 않는다.
  const [reloading, setReloading] = useState(() => isStaleChunkError(error));
  useEffect(() => {
    console.error(error);
    if (!reloadIfStaleChunk(error)) setReloading(false);
  }, [error]);

  if (reloading) return null;

  return (
    <ErrorState
      code="500"
      title="문제가 발생했어요"
      description="일시적인 오류일 수 있어요. 잠시 후 다시 시도해주세요."
      digest={error.digest}
      icon={
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      }
      actions={
        <>
          <Button onClick={reset}>다시 시도</Button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--color-line)] bg-white px-5 py-2.5 text-sm font-bold text-[var(--color-blue-dark)] transition hover:bg-[var(--color-soft)]"
          >
            홈으로
          </Link>
        </>
      }
      links={ERROR_QUICK_LINKS}
    />
  );
}
