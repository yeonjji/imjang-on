import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '개인정보 처리방침',
  description: '임장ON 개인정보 처리방침 — 수집 항목, 이용 목적, 처리위탁, 국외 이전, 쿠키 및 광고(Google AdSense) 안내.',
  alternates: { canonical: '/privacy' },
};

const TRANSFER_ROWS = [
  {
    to: 'Oracle Cloud Infrastructure',
    country: '일본',
    items: '접속 IP, 이메일 주소',
    purpose: '서버 호스팅',
    when: '서비스 이용 시 네트워크 전송',
  },
  {
    to: 'Cloudflare, Inc.',
    country: '미국',
    items: '접속 IP, 브라우저 정보',
    purpose: 'CDN 및 트래픽 보호',
    when: '서비스 이용 시 네트워크 전송',
  },
  {
    to: 'Google LLC',
    country: '미국',
    items: '쿠키, 기기 정보',
    purpose: '이용 통계, 광고 게재',
    when: '페이지 로드 시 자동 전송',
  },
];

function TransferTable() {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="border-b border-[var(--color-line)]">
            {['이전받는 자', '국가', '이전 항목', '목적', '시점 및 방법'].map((h) => (
              <th key={h} className="py-2.5 pr-4 text-left font-normal text-[var(--color-muted)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TRANSFER_ROWS.map((r) => (
            <tr key={r.to} className="border-b border-[var(--color-line)] last:border-b-0">
              <td className="py-2.5 pr-4 font-semibold text-[var(--color-blue-dark)]">{r.to}</td>
              <td className="py-2.5 pr-4 text-[var(--color-text)]">{r.country}</td>
              <td className="py-2.5 pr-4 text-[var(--color-text)]">{r.items}</td>
              <td className="py-2.5 pr-4 text-[var(--color-text)]">{r.purpose}</td>
              <td className="py-2.5 text-[var(--color-text)]">{r.when}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const HISTORY_ROWS = [
  { date: '2026년 6월 7일', note: '제정' },
  {
    date: '2026년 8월 7일',
    note: '호스팅 사업자 변경 반영(Vercel → Oracle Cloud Infrastructure, Cloudflare 추가). 파기 절차, 제3자 제공, 국외 이전, 안전성 확보조치, 만 14세 미만 아동, 권익침해 구제방법 조항 신설.',
  },
];

function HistoryTable() {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <tbody>
          {HISTORY_ROWS.map((r) => (
            <tr key={r.date} className="border-b border-[var(--color-line)] last:border-b-0">
              <th className="w-32 py-2.5 pr-4 text-left align-top font-normal text-[var(--color-muted)]">
                {r.date}
              </th>
              <td className="py-2.5 text-[var(--color-text)]">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// body는 문단(<p>)으로, block은 표처럼 <p> 안에 들어갈 수 없는 요소를 문단 밖에 렌더한다.
const SECTIONS: { heading: string; body: React.ReactNode[]; block?: React.ReactNode }[] = [
  {
    heading: '1. 총칙',
    body: [
      '임장ON(이하 "서비스")은 이용자의 개인정보를 중요하게 생각하며, 개인정보 보호법 등 관계 법령을 준수합니다.',
      '본 방침은 서비스가 어떤 정보를 어떤 목적으로 처리하는지, 이용자가 어떤 권리를 행사할 수 있는지를 안내합니다.',
    ],
  },
  {
    heading: '2. 수집하는 개인정보 항목',
    body: [
      '① 출시·청약 알림 신청 시: 이메일 주소',
      '② 자동 수집 항목: 쿠키, 접속 IP, 브라우저 및 기기 정보(서비스 이용 통계 및 광고 게재 목적)',
    ],
  },
  {
    heading: '3. 개인정보의 수집·이용 목적',
    body: ['알림 발송, 서비스 이용 통계 분석, 광고 게재'],
  },
  {
    heading: '4. 보유 및 이용 기간',
    body: [
      '알림 목적 달성 또는 이용자의 수신 철회 시까지 보유하며, 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.',
    ],
  },
  {
    heading: '5. 개인정보의 파기 절차 및 방법',
    body: [
      '① 이용자가 삭제를 요청하면 보관 중인 이메일 주소를 지체 없이 삭제합니다.',
      <>
        ② 삭제 요청은{' '}
        <Link href="/contact" className="underline">문의 페이지</Link>
        에 안내된 이메일로 접수합니다.
      </>,
    ],
  },
  {
    heading: '6. 개인정보의 제3자 제공',
    body: [
      '서비스는 이용자의 개인정보를 제3자에게 제공하지 않습니다.',
      '아래 제7조의 처리위탁은 서비스 운영을 위한 것으로 제3자 제공과 구분됩니다.',
    ],
  },
  {
    heading: '7. 개인정보 처리위탁',
    body: [
      '서비스는 원활한 운영을 위해 다음 사업자에게 개인정보 처리 업무를 위탁합니다.',
      '· Oracle Cloud Infrastructure — 서버 호스팅',
      '· Cloudflare, Inc. — CDN 및 트래픽 보호',
      '· Google LLC — 이용 통계(Google Analytics), 광고 게재(Google AdSense)',
    ],
  },
  {
    heading: '8. 개인정보의 국외 이전',
    body: [
      '서비스는 아래와 같이 개인정보를 국외로 이전합니다. 이용자는 국외 이전을 거부할 수 있으며, 이 경우 서비스 이용이 제한될 수 있습니다.',
    ],
    block: <TransferTable />,
  },
  {
    heading: '9. 쿠키 및 맞춤형 광고',
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
      '⑤ 브라우저별 쿠키 차단 경로는 다음과 같습니다.',
      '· Chrome: 설정 → 개인정보 보호 및 보안 → 서드 파티 쿠키',
      '· Safari: 환경설정 → 개인정보 보호 → 쿠키 및 웹사이트 데이터 차단',
      '· Edge: 설정 → 쿠키 및 사이트 권한 → 쿠키 및 사이트 데이터 관리',
    ],
  },
  {
    heading: '10. 정보주체의 권리와 행사 방법',
    body: [
      '① 이용자는 본인의 개인정보에 대한 열람·정정·삭제·처리정지를 요구할 수 있습니다.',
      <>
        ② 요청은{' '}
        <Link href="/contact" className="underline">문의 페이지</Link>
        의 이메일로 접수하며, 알림 신청 시 사용한 이메일 주소를 함께 알려주시면 확인이 빠릅니다.
      </>,
      '③ 이용자는 개인정보 수집·이용에 대한 동의를 언제든지 철회할 수 있습니다.',
    ],
  },
  {
    heading: '11. 개인정보의 안전성 확보조치',
    body: [
      '① 서비스의 모든 통신 구간에 HTTPS 암호화를 적용합니다.',
      '② 관리자 화면은 접근을 통제합니다.',
      '③ 서비스 제공에 필요한 최소한의 정보만 수집합니다.',
    ],
  },
  {
    heading: '12. 만 14세 미만 아동의 개인정보',
    body: ['서비스는 만 14세 미만 아동의 개인정보를 별도로 수집하지 않습니다.'],
  },
  {
    heading: '13. 개인정보 보호책임자',
    body: [
      <>
        임장ON 운영자 / 연락처:{' '}
        <a href="mailto:contact@imjangon.co.kr" className="underline">contact@imjangon.co.kr</a>
      </>,
    ],
  },
  {
    heading: '14. 권익침해 구제방법',
    body: [
      '개인정보 침해에 대한 상담·분쟁조정이 필요하신 경우 아래 기관에 문의하실 수 있습니다.',
      <>
        · 개인정보 분쟁조정위원회 1833-6972 (
        <a href="https://www.kopico.go.kr" target="_blank" rel="noopener noreferrer" className="underline">
          kopico.go.kr
        </a>
        )
      </>,
      <>
        · 개인정보 침해신고센터 118 (
        <a href="https://privacy.kisa.or.kr" target="_blank" rel="noopener noreferrer" className="underline">
          privacy.kisa.or.kr
        </a>
        )
      </>,
      '· 대검찰청 사이버수사과 1301',
      '· 경찰청 사이버수사국 182',
    ],
  },
  {
    heading: '15. 개정 이력',
    body: [
      '본 개인정보 처리방침의 내용 변경 시 본 페이지를 통해 고지합니다.',
    ],
    block: <HistoryTable />,
  },
];

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">개인정보 처리방침</h1>
      <p className="mt-3 text-sm text-[var(--color-muted)]">
        시행일: 2026년 8월 7일 (제정: 2026년 6월 7일)
      </p>

      <div className="mt-8 space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.heading}>
            <h2 className="text-lg font-bold text-[var(--color-text)]">{s.heading}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="mt-2 text-[var(--color-text)]">{p}</p>
            ))}
            {s.block}
          </section>
        ))}
      </div>
    </article>
  );
}
