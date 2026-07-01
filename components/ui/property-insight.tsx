/**
 * 실거래가 상세(아파트·오피스텔·빌라)의 "한눈에 보기" 해석 요약 섹션.
 * 문장을 줄 단위로 나눠 스캔하기 쉽게 보여준다. 흰 데이터 카드보다 조용한
 * 위계를 위해 그림자 없는 soft-tint 보더 패널을 쓴다.
 */
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
            {s}
          </p>
        ))}
      </div>
    </section>
  );
}
