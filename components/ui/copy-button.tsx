'use client';

import { useEffect, useRef, useState } from 'react';

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setSupported(typeof navigator !== 'undefined' && !!navigator.clipboard);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!supported) return null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        aria-label={label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            // 이전 타이머가 있으면 먼저 취소한다 (빠른 클릭 대응).
            if (timerRef.current) clearTimeout(timerRef.current);
            setCopied(true);
            timerRef.current = setTimeout(() => setCopied(false), 2000);
          } catch {
            // 클립보드 API 실패 (권한 거부, 비보안 컨텍스트 등).
            // 복사 상태를 설정하지 않는다 — 실패한 복사를 성공으로 표시하지 않는다.
          }
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
