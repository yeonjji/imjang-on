import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '이용약관',
  description: '임장온 이용약관 — 서비스 이용 조건과 데이터 정확성·책임 범위 안내.',
  alternates: { canonical: '/terms' },
};

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: '제1조 (목적)',
    body: [
      '본 약관은 임장온(이하 "서비스")이 제공하는 공공데이터 기반 부동산 정보의 이용과 관련하여 서비스와 이용자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.',
    ],
  },
  {
    heading: '제2조 (정의)',
    body: [
      '① "서비스"란 임장온이 공공데이터를 가공해 제공하는 모든 정보 및 기능을 말합니다.',
      '② "이용자"란 본 약관에 따라 서비스를 이용하는 자를 말합니다.',
      '③ "콘텐츠"란 서비스가 제공하는 실거래가·청약·생활 인프라 등 일체의 정보를 말합니다.',
    ],
  },
  {
    heading: '제3조 (서비스의 내용)',
    body: [
      '① 서비스는 국토교통부 실거래가, 한국부동산원 청약홈 등 공공데이터를 가공한 정보를 제공합니다.',
      '② 서비스는 회원가입·결제·부동산 중개 행위를 제공하지 않는 정보 제공 플랫폼입니다.',
    ],
  },
  {
    heading: '제4조 (정보의 정확성 및 면책)',
    body: [
      '① 콘텐츠는 공공데이터를 가공해 제공하며, 실거래 신고 지연(통상 30일 이내) 등으로 최신성·정확성을 보장하지 않습니다.',
      '② 이용자가 콘텐츠를 활용한 부동산 거래·청약 등 의사결정의 결과에 대해 서비스는 책임지지 않습니다.',
      '③ 이용자는 실제 거래·이용 전 반드시 원 출처 및 관계 기관을 통해 정보를 확인해야 합니다.',
    ],
  },
  {
    heading: '제5조 (지식재산권 및 출처표시)',
    body: [
      '① 서비스는 공공누리 제1유형(출처표시)에 따라 공공데이터를 이용합니다.',
      '② 각 데이터의 원저작권은 해당 제공기관에 있으며, 출처는 데이터 안내 페이지에 표기합니다.',
    ],
  },
  {
    heading: '제6조 (광고의 게재)',
    body: [
      '① 서비스는 Google AdSense 등 제3자 광고를 게재할 수 있습니다.',
      '② 광고주와의 거래에 관한 책임은 이용자와 광고주 간에 있으며, 서비스는 이에 관여하지 않습니다.',
    ],
  },
  {
    heading: '제7조 (약관의 변경)',
    body: [
      '서비스는 필요 시 본 약관을 변경할 수 있으며, 변경된 약관은 본 페이지에 게시함으로써 효력이 발생합니다.',
    ],
  },
  {
    heading: '제8조 (준거법 및 관할)',
    body: [
      '본 약관은 대한민국 법령에 따라 해석되며, 분쟁은 관계 법령이 정한 절차에 따릅니다.',
    ],
  },
];

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">이용약관</h1>
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

      <p className="mt-10 text-sm text-[var(--color-muted)]">
        문의: <a href="mailto:contact@imjangon.co.kr" className="underline">contact@imjangon.co.kr</a>
      </p>
    </article>
  );
}
