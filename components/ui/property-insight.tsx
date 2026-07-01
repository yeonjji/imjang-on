import { Fragment } from 'react';

/**
 * 실거래가 상세(아파트·오피스텔·빌라)의 "한눈에 보기" 해석 요약 섹션.
 * 문장을 줄 단위로 나눠 스캔하기 쉽게 보여준다. 강조는 두 가지:
 *  - 핵심 수치(금액·변동률)는 굵기(색 아님 — Weight-Not-Family)
 *  - 상승/하락 방향은 색 신호(한국 관례: 상승 빨강 · 하락 파랑). 단어를 함께 두어
 *    색에만 의존하지 않는다.
 * 흰 데이터 카드보다 조용한 위계를 위해 그림자 없는 soft-tint 보더 패널을 쓴다.
 */

// 강조 토큰: 금액(3.67억 / 8,000만원)·변동률(23%)·방향(상승/하락). 건수·개수·도보분은 평문.
const TOKEN_SPLIT = /(\d+(?:\.\d+)?억|\d[\d,]*만원|\d+%|상승|하락)/g;
const IS_FIGURE = /^(?:\d+(?:\.\d+)?억|\d[\d,]*만원|\d+%)$/;

function renderSentence(sentence: string) {
  return sentence.split(TOKEN_SPLIT).map((part, i) => {
    if (IS_FIGURE.test(part)) {
      return (
        <strong key={i} className="font-semibold">
          {part}
        </strong>
      );
    }
    if (part === '상승') {
      return (
        <span key={i} className="font-semibold text-[var(--color-red)]">
          {part}
        </span>
      );
    }
    if (part === '하락') {
      return (
        <span key={i} className="font-semibold text-[var(--color-blue)]">
          {part}
        </span>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function PropertyInsight({ sentences }: { sentences: string[] }) {
  if (sentences.length === 0) return null;
  return (
    <section
      aria-label="한눈에 보기"
      className="mt-5 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-soft)] p-5 sm:p-6"
    >
      <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">한눈에 보기</h2>
      <div className="flex flex-col gap-2">
        {sentences.map((s, i) => (
          <p key={i} className="break-keep text-[15px] leading-relaxed text-[var(--color-text)]">
            {renderSentence(s)}
          </p>
        ))}
      </div>
    </section>
  );
}
