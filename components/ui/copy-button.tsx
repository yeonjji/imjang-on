'use client';

import { useEffect, useState } from 'react';

interface CopyButtonProps {
  /** 클립보드에 복사할 값 */
  value: string;
  /** 스크린리더용 레이블 (예: "주소 복사") */
  label: string;
}

/**
 * 클립보드 복사 버튼.
 * 클립보드 API를 쓸 수 없는 환경에서는 렌더하지 않는다 — 동작하지 않는 버튼을 보여주지 않는다.
 * 지원 여부는 마운트 후에만 알 수 있으므로 SSR 출력은 항상 비어 있다.
 */
export function CopyButton({ value, label }: CopyButtonProps) {
  const [supported, setSupported] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSupported(typeof navigator !== 'undefined' && !!navigator.clipboard);
  }, []);

  if (!supported) return null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        aria-label={label}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="rounded-full border border-[var(--color-line)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)] transition hover:bg-[var(--color-soft)]"
      >
        복사
      </button>
      <span role="status" className="text-xs text-[var(--color-muted)]">
        {copied ? '복사됨' : ''}
      </span>
    </span>
  );
}
