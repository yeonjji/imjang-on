import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '개인정보 처리방침',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">개인정보 처리방침</h1>
      <p className="mt-4">
        임장온은 Phase 2 알림 신청 시 이메일 주소만 수집하며, 출시 알림 발송 목적으로만 사용합니다.
      </p>
      <p className="mt-3">
        Google Analytics 4 / Vercel Analytics를 통해 익명화된 트래픽 통계를 수집합니다.
      </p>
    </article>
  );
}
