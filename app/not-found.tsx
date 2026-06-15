import Link from 'next/link';
import { ErrorState, ERROR_QUICK_LINKS } from '@/components/error-state';

export default function NotFound() {
  return (
    <ErrorState
      code="404"
      title="페이지를 찾을 수 없어요"
      description="요청하신 페이지가 존재하지 않거나 주소가 변경되었어요."
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
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      }
      actions={
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--color-blue)] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[var(--color-blue-dark)]"
        >
          홈으로
        </Link>
      }
      links={ERROR_QUICK_LINKS}
    />
  );
}
