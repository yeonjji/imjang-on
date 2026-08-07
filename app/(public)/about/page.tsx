import type { Metadata } from 'next';
import Link from 'next/link';
import { EDITORIAL } from '@/lib/editorial';

export const metadata: Metadata = {
  title: '서비스 소개',
  description: '임장ON 서비스 소개 — 공공데이터 기반 부동산 실거래가·생활편의 정보를 제공하는 방식과 운영 안내.',
  alternates: { canonical: '/about' },
};

// deploy/systemd/install-timers.sh의 OnCalendar(UTC)를 KST로 환산한 값.
// 타이머를 바꾸면 이 표도 함께 고쳐야 한다.
const UPDATE_CYCLES = [
  { data: '아파트·오피스텔·연립다세대 실거래가', cycle: '매일 2회 (00시·04시)' },
  { data: '청약·분양 공고', cycle: '매일 1회 (03:30)' },
  { data: '서민금융 대출상품', cycle: '매월 1회' },
  { data: '전세보증 상품', cycle: '매월 1회' },
  { data: '상권·편의시설', cycle: '매월 1회' },
  { data: '지하철역', cycle: '분기 1회' },
  { data: '병원·약국', cycle: '원 제공기관의 공개 파일 갱신 시 수동 반영' },
];

const HISTORY = [
  { when: '2026년 5월', what: '아파트 실거래가 목록·상세 공개' },
  { when: '2026년 5월', what: '학교·어린이집·상권편의·주차장 등 생활 인프라 추가' },
  { when: '2026년 6월', what: '병원·약국, 지하철 역세권, 청약·분양, 서민금융 대출 추가' },
  { when: '2026년 7월', what: '전세보증 추천, 자동 게시판, 주제별 가이드 추가' },
  { when: '2026년 7월', what: '자체 서버 인프라로 이전' },
];

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">임장ON 소개</h1>

      <p className="mt-5 text-[var(--color-text)]">
        임장ON은 국토교통부 실거래가, 한국부동산원 청약홈, 건강보험심사평가원, 교육부, 보건복지부,
        행정안전부, 국가철도공단 등 공공데이터를 자체 수집·정제·결합해 제공하는 부동산 데이터 서비스입니다.
      </p>

      <h2 className="mt-10 text-xl font-bold text-[var(--color-text)]">제공하는 정보</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-[var(--color-text)]">
        <li>아파트·오피스텔·연립다세대 실거래가(매매·전세·월세)</li>
        <li>청약·분양 일정 정보</li>
        <li>생활 인프라 — 학교·어린이집, 병원·약국, 편의점·마트·카페·전통시장, 공원·주차장·전기차 충전소</li>
        <li>지하철 역세권 및 지역별 시세</li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-[var(--color-text)]">운영 주체</h2>
      <p className="mt-3 text-[var(--color-text)]">
        임장ON은 <strong className="font-semibold text-[var(--color-blue-dark)]">{EDITORIAL.name}</strong>
        ({EDITORIAL.role}) 1인이 운영합니다. 회원가입·결제 기능은 제공하지 않습니다.
        문의는{' '}
        <a href={`mailto:${EDITORIAL.email}`} className="underline hover:text-[var(--color-blue-dark)]">
          {EDITORIAL.email}
        </a>
        으로 받습니다.
      </p>

      <h2 className="mt-10 text-xl font-bold text-[var(--color-text)]">데이터 수집·검증 방법</h2>
      <p className="mt-3 text-[var(--color-text)]">
        각 정보는 공공기관의 원본 데이터를 API·공개 파일로 수집해 자체적으로 정제·결합한 뒤,
        페이지마다 출처와 데이터 기준일을 함께 표기합니다. 실거래가처럼 원본이 갱신되는 데이터는
        정기적으로 재수집하며, 신고 지연 등으로 최신성·정확성을 100% 보장하기 어려운 항목은 해당
        페이지에 명시합니다. 사용한 공공데이터 목록과 출처는{' '}
        <Link href="/data-source" className="underline">데이터 안내</Link>에서 확인할 수 있습니다.
      </p>

      <h2 className="mt-10 text-xl font-bold text-[var(--color-text)]">데이터 갱신 주기</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {UPDATE_CYCLES.map((r) => (
              <tr key={r.data} className="border-b border-[var(--color-line)] last:border-b-0">
                <th className="py-2.5 pr-4 text-left align-top font-normal text-[var(--color-muted)]">
                  {r.data}
                </th>
                <td className="py-2.5 font-semibold text-[var(--color-blue-dark)]">{r.cycle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-bold text-[var(--color-text)]">운영 연혁</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {HISTORY.map((r) => (
              <tr key={r.when + r.what} className="border-b border-[var(--color-line)] last:border-b-0">
                <th className="w-28 py-2.5 pr-4 text-left align-top font-normal text-[var(--color-muted)]">
                  {r.when}
                </th>
                <td className="py-2.5 text-[var(--color-text)]">{r.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-bold text-[var(--color-text)]">오류를 발견하셨다면</h2>
      <p className="mt-3 text-[var(--color-text)]">
        화면의 값이 원본과 다르다고 판단되시면{' '}
        <Link href="/contact" className="underline">문의</Link>로 알려주세요. 접수된 내용은 공공기관
        원본과 대조해 정정하거나 그 사유를 회신합니다. 원본 데이터 자체의 오류는 원 제공기관에
        문의하셔야 정정됩니다.
      </p>

      <h2 className="mt-10 text-xl font-bold text-[var(--color-text)]">운영 재원</h2>
      <p className="mt-3 text-[var(--color-text)]">
        서비스는 무료이며 서버·운영 비용은 광고 수익으로 충당합니다. 부동산을 중개하거나 특정 매물을
        광고하지 않으며, 광고 게재 여부가 정보의 표시 순서나 내용에 영향을 주지 않습니다.
      </p>

      <p className="mt-8 text-sm text-[var(--color-muted)]">
        본 서비스의 정보는 공공데이터를 가공해 제공하며, 실거래 신고 지연 등으로 최신성·정확성을 100%
        보장하지 않습니다. 자세한 내용은{' '}
        <Link href="/data-source" className="underline">데이터 안내</Link>,{' '}
        <Link href="/terms" className="underline">이용약관</Link>,{' '}
        <Link href="/privacy" className="underline">개인정보 처리방침</Link>,{' '}
        <Link href="/contact" className="underline">문의</Link>를 확인하세요.
      </p>
    </article>
  );
}
