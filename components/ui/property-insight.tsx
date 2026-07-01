import { Fragment } from 'react';

/**
 * 실거래가 상세(아파트·오피스텔·빌라)의 "한눈에 보기" 해석 요약 섹션.
 * 문장을 줄 단위로 나눠 스캔하기 쉽게 보여주고, 핵심 수치(금액·변동률)만
 * 굵기로 강조한다(색이 아니라 굵기 — Weight-Not-Family). 흰 데이터 카드보다
 * 조용한 위계를 위해 그림자 없는 soft-tint 보더 패널을 쓴다.
 */

// 강조 대상: 금액(3.67억 / 8,000만원)과 변동률(23%). 건수·개수·도보분은 맥락이라 평문.
const FIGURE_SPLIT = /(\d+(?:\.\d+)?억|\d[\d,]*만원|\d+%)/g;
const IS_FIGURE = /^(?:\d+(?:\.\d+)?억|\d[\d,]*만원|\d+%)$/;

function emphasizeFigures(sentence: string) {
  return sentence.split(FIGURE_SPLIT).map((part, i) =>
    IS_FIGURE.test(part) ? (
      <strong key={i} className="font-semibold">
        {part}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
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
            {emphasizeFigures(s)}
          </p>
        ))}
      </div>
    </section>
  );
}
