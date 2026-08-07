import type { Metadata } from 'next';
import Link from 'next/link';
import { EDITORIAL } from '@/lib/editorial';

export const metadata: Metadata = {
  title: '문의',
  description: '임장ON 문의 — 데이터 정정, 개인정보 열람·삭제, 저작권, 제휴 문의 안내와 처리 절차.',
  alternates: { canonical: '/contact' },
};

const INQUIRY_TYPES = [
  { type: '데이터 오류·정정', detail: '해당 화면 주소, 화면에 표시된 값, 확인하신 원본 출처' },
  { type: '개인정보 열람·삭제', detail: '알림 신청 시 사용하신 이메일 주소' },
  { type: '저작권·권리 침해', detail: '해당 화면 주소, 침해 사유, 권리 보유 근거' },
  { type: '제휴·광고', detail: '제안 내용과 연락 수단' },
];

const STEPS = [
  { step: '1. 접수', detail: '이메일로 받은 내용을 확인합니다.' },
  { step: '2. 대조', detail: '해당 데이터의 공공기관 원본과 대조합니다.' },
  { step: '3. 회신', detail: '정정하거나, 정정하지 않는 경우 그 사유를 회신합니다.' },
];

const OPERATOR = [
  { label: '서비스명', value: '임장ON' },
  { label: '운영 형태', value: '1인 운영' },
  { label: '연락처', value: EDITORIAL.email },
  {
    label: '성격',
    value:
      '공공데이터를 가공해 제공하는 정보 서비스입니다. 부동산 중개업이 아니며 특정 매물을 중개하거나 광고하지 않습니다.',
  },
];

export default function ContactPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">문의</h1>

      <p className="mt-5 text-[var(--color-text)]">
        서비스 이용, 데이터 정정·삭제 요청, 제휴 등 모든 문의는 아래 이메일로 보내주세요.
      </p>

      <p className="mt-4 text-lg font-bold text-[var(--color-text)]">
        <a
          href={`mailto:${EDITORIAL.email}`}
          className="underline hover:text-[var(--color-blue-dark)]"
        >
          {EDITORIAL.email}
        </a>
      </p>

      <section className="mt-12">
        <h2 className="text-lg font-bold text-[var(--color-text)]">문의 유형별 안내</h2>
        <p className="mt-2 text-[var(--color-text)]">
          빠른 확인을 위해 문의 유형에 맞는 내용을 함께 적어주세요.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)]">
                <th className="w-40 py-2.5 pr-4 text-left font-normal text-[var(--color-muted)]">
                  문의 유형
                </th>
                <th className="py-2.5 text-left font-normal text-[var(--color-muted)]">
                  함께 적어주실 내용
                </th>
              </tr>
            </thead>
            <tbody>
              {INQUIRY_TYPES.map((r) => (
                <tr key={r.type} className="border-b border-[var(--color-line)] last:border-b-0">
                  <th className="py-2.5 pr-4 text-left align-top font-semibold text-[var(--color-blue-dark)]">
                    {r.type}
                  </th>
                  <td className="py-2.5 text-[var(--color-text)]">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-bold text-[var(--color-text)]">처리 절차</h2>
        <ul className="mt-3 space-y-2 text-[var(--color-text)]">
          {STEPS.map((s) => (
            <li key={s.step}>
              <span className="font-semibold text-[var(--color-blue-dark)]">{s.step}</span>
              {' — '}
              {s.detail}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          원본 데이터 자체의 오류는 원 제공기관에 문의하셔야 정정됩니다. 어느 기관인지는{' '}
          <Link href="/data-source" className="underline">데이터 안내</Link>에서 확인하실 수 있습니다.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-bold text-[var(--color-text)]">운영 주체</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {OPERATOR.map((r) => (
                <tr key={r.label} className="border-b border-[var(--color-line)] last:border-b-0">
                  <th className="w-24 py-2.5 pr-4 text-left align-top font-normal text-[var(--color-muted)]">
                    {r.label}
                  </th>
                  <td className="py-2.5 text-[var(--color-text)]">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          서비스가 어떻게 운영되는지는{' '}
          <Link href="/about" className="underline">서비스 소개</Link>, 개인정보 처리에 관한 사항은{' '}
          <Link href="/privacy" className="underline">개인정보 처리방침</Link>에서 확인하실 수 있습니다.
        </p>
      </section>

      <p className="mt-10 text-sm text-[var(--color-muted)]">
        데이터의 오류·정정 요청 시 해당 화면 주소와 내용을 함께 적어주시면 빠르게 확인할 수 있습니다.
        접수된 문의는 순차적으로 답변드립니다.
      </p>
    </article>
  );
}
