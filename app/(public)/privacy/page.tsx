import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '개인정보 처리방침',
  description: '임장ON 개인정보 처리방침 — 수집 항목, 이용 목적, 쿠키 및 광고(Google AdSense) 안내.',
  alternates: { canonical: '/privacy' },
};

const SECTIONS: { heading: string; body: React.ReactNode[] }[] = [
  {
    heading: '1. 수집하는 개인정보 항목',
    body: [
      '① 출시·청약 알림 신청 시: 이메일 주소',
      '② 자동 수집 항목: 쿠키, 접속 IP, 브라우저 및 기기 정보(서비스 이용 통계 및 광고 게재 목적)',
    ],
  },
  {
    heading: '2. 개인정보의 수집·이용 목적',
    body: ['알림 발송, 서비스 이용 통계 분석, 광고 게재'],
  },
  {
    heading: '3. 보유 및 이용 기간',
    body: [
      '알림 목적 달성 또는 이용자의 수신 철회 시까지 보유하며, 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.',
    ],
  },
  {
    heading: '4. 개인정보의 제3자 제공 및 처리위탁',
    body: [
      '서비스는 다음의 외부 서비스를 통해 분석·광고·호스팅을 수행합니다.',
      '· Google LLC — Google Analytics(이용 통계), Google AdSense(광고 게재)',
      '· Vercel Inc. — 트래픽 분석 및 호스팅',
    ],
  },
  {
    heading: '5. 쿠키 및 광고(Google AdSense) 안내',
    body: [
      '① 제3자(Google 포함)는 쿠키 및 웹비콘을 사용하여 이용자의 방문 정보를 수집하고 광고를 게재할 수 있습니다.',
      '② Google은 광고 쿠키를 사용하여 이용자의 본 사이트 및 다른 사이트 방문 기록을 기반으로 맞춤형 광고를 제공합니다.',
      <>
        ③ 이용자는{' '}
        <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="underline">
          Google 광고 설정
        </a>
        에서 맞춤형 광고를 비활성화할 수 있습니다. 제3자 광고 쿠키에 대한 자세한 내용은{' '}
        <a href="https://www.google.com/policies/technologies/ads/" target="_blank" rel="noopener noreferrer" className="underline">
          Google 광고 기술 안내
        </a>
        를 참고하세요.
      </>,
      '④ 이용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나, 이 경우 일부 기능 이용에 제한이 있을 수 있습니다.',
    ],
  },
  {
    heading: '6. 정보주체의 권리',
    body: [
      '이용자는 본인의 개인정보에 대한 열람·정정·삭제·처리정지를 요구할 수 있으며, 요청은 아래 연락처로 접수합니다.',
    ],
  },
  {
    heading: '7. 개인정보 보호책임자',
    body: [
      <>
        임장ON 운영자 / 연락처:{' '}
        <a href="mailto:contact@imjangon.co.kr" className="underline">contact@imjangon.co.kr</a>
      </>,
    ],
  },
  {
    heading: '8. 고지의 의무',
    body: ['본 개인정보 처리방침의 내용 변경 시 본 페이지를 통해 고지합니다.'],
  },
];

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">개인정보 처리방침</h1>
      <p className="mt-3 text-sm text-[var(--color-muted)]">시행일: 2026년 6월 7일</p>

      <div className="mt-8 space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.heading}>
            <h2 className="text-lg font-bold text-[var(--color-text)]">{s.heading}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="mt-2 text-[var(--color-text)]">{p}</p>
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}
