import Link from 'next/link';

/**
 * 홈 하단 편집 산문 — "공공기록의 열람실" 안내문.
 * 사이트가 무엇을·어떤 출처로·어떻게 해석하는지, 그리고 데이터의 한계를 정직하게 밝힌다.
 * 서버 렌더 원본 텍스트로 홈에 고유 콘텐츠를 부여한다(AdSense P1-C, gap #5).
 */
export function HomeEditorial() {
  return (
    <section className="mt-16">
      <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-6 shadow-[var(--shadow-soft)] md:p-8">
        <h2 className="text-xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-[22px]">
          흩어진 공공데이터를, 한 곳에서
        </h2>
        <div className="mt-4 flex max-w-[68ch] flex-col gap-4 text-[15px] leading-relaxed text-[var(--color-text)]">
          <p>
            임장ON은 국토교통부 실거래가, 청약홈·LH 청약, 학교·병원·생활 인프라처럼 여러 정부 기관에
            흩어진 부동산 공공데이터를 한 곳에 모아 보여주는 서비스입니다. 이사·매수를 앞두고 특정 단지를
            깊이 살펴보는 분에게는 실거래 내역과 출처를, 시세와 동향을 둘러보는 분에게는 지역별 요약을 같은
            화면에서 제공합니다.
          </p>
          <p>
            각 수치는 원본을 그대로 옮겨 놓는 데 그치지 않습니다. 면적·층을 맞춘 실거래 비교, 전세가율,
            지역 평균 대비 가격 위치처럼 데이터를 읽는 데 도움이 되는 지표를 함께 계산해 보여주고, 모든
            값에는 어떤 공공데이터에서 왔는지와 데이터 기준일을 함께 표기합니다.
          </p>
          <p>
            실거래는 신고까지 시간이 걸려 가장 최근 거래가 바로 반영되지 않을 수 있고, 공공데이터 자체의
            지연·정정도 있습니다. 임장ON은 이런 한계를 감추지 않고 페이지마다 밝히며, 특정 매물을
            중개하거나 광고하지 않습니다. 데이터의 출처와 수집 방식은{' '}
            <Link href="/data-source" className="font-semibold text-[var(--color-blue)] hover:underline">
              데이터 안내
            </Link>
            에서, 운영 주체는{' '}
            <Link href="/about" className="font-semibold text-[var(--color-blue)] hover:underline">
              서비스 소개
            </Link>
            에서 확인할 수 있습니다.
          </p>
        </div>
      </div>
    </section>
  );
}
