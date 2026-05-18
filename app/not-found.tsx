import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container mx-auto max-w-xl py-24 text-center">
      <h1 className="text-3xl font-bold text-[var(--color-blue-dark)]">페이지를 찾을 수 없어요</h1>
      <p className="mt-3 text-[var(--color-muted)]">요청하신 페이지가 존재하지 않습니다.</p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-full bg-[var(--color-blue)] px-5 py-2.5 font-bold text-white"
      >
        홈으로 돌아가기
      </Link>
    </main>
  );
}
