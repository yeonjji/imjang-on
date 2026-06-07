import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '문의',
  description: '임장온 문의 — 데이터 정정·삭제 요청, 제휴 등 문의 안내.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">문의</h1>

      <p className="mt-5 text-[var(--color-text)]">
        서비스 이용, 데이터 정정·삭제 요청, 제휴 등 모든 문의는 아래 이메일로 보내주세요.
      </p>

      <p className="mt-4 text-lg font-bold text-[var(--color-text)]">
        <a href="mailto:contact@imjang-on.com" className="underline hover:text-[var(--color-blue-dark)]">
          contact@imjang-on.com
        </a>
      </p>

      <p className="mt-6 text-sm text-[var(--color-muted)]">
        데이터의 오류·정정 요청 시 해당 화면 주소와 내용을 함께 적어주시면 빠르게 확인할 수 있습니다.
        접수된 문의는 순차적으로 답변드립니다.
      </p>
    </article>
  );
}
