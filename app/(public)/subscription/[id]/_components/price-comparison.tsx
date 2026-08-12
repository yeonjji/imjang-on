import { readSigunguMedianSnapshot, type SigunguMedian } from '@/lib/subscription/median-snapshot';
import { resolveSigunguFromAddress } from '@/lib/region/from-address';
import { formatBillion } from '@/lib/format';
import { SourceCaption } from '@/components/ui/source-caption';

/** label이 없거나 빈 값일 때(이 필드가 생기기 전에 쓰인 스냅샷) 쓰는 예전 문구. */
const FALLBACK_LABEL = '시군구';

/**
 * 순수 표현 뷰. local의 형태는 이미 PriceComparison에서 검증됐다고 가정한다.
 *
 * label은 실거래가 실제로 집계된 단위(수원시·강남구 등)를 그대로 보여준다 — "같은 시군구"라고만
 * 쓰면, 일반구 도시(수원 등)는 구 단위 공고인데도 시 전체를 합친 건수를 마치 그 구의 것처럼
 * 읽히게 만든다(예: 팔달구 공고에 수원시 전체 17,116건이 "같은 시군구" 밑에 뜨는 문제). label이
 * 없는 옛 스냅샷 데이터는 예전 문구로 폴백한다 — 줄 자체를 생략하지는 않는다, median/count는
 * 여전히 유효한 값이라서다.
 */
export function PriceComparisonView({ local }: { local: SigunguMedian }) {
  const groupLabel = typeof local.label === 'string' && local.label.length > 0 ? local.label : FALLBACK_LABEL;

  return (
    <section className="my-8 rounded-[18px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
      <h2 className="text-base font-bold text-[var(--color-blue-dark)]">같은 {groupLabel} 실거래 시세</h2>
      <p className="mt-3 text-sm text-[var(--color-text)]">
        최근 12개월 아파트 매매 중위가 <strong>{formatBillion(local.median)}</strong>
        <span className="text-[var(--color-muted)]"> · 거래 {local.count.toLocaleString('ko-KR')}건</span>
      </p>
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        분양가는 공고에 적힌 최고 공급금액입니다. 실거래는 전용면적 기준이라, 면적당 단가는
        비교하지 않았습니다.
      </p>
      <SourceCaption ids={['applyhome', 'molit-rtms']} />
    </section>
  );
}

/**
 * 이 공고 지역의 최근 실거래 중위가를 한 줄로 보여준다(async 데이터 래퍼).
 *
 * 분양가 자체는 바로 위 UnitSupplyTable이 이미 보여주므로 여기서 표를 다시 그리지 않는다 —
 * 예전엔 이 컴포넌트도 주택형별 분양가 표를 따로 그려 UnitSupplyTable과 near-duplicate였다.
 *
 * **면적당 단가는 비교하지 않는다.** `SubscriptionUnit.area`의 기준이 행마다 다르고(공급 80% /
 * 전용 12%, UnitSupplyTable 참고) 실거래는 전용면적이라, 단가를 나란히 두면 비교가 안 된다.
 * 총액끼리만 본다.
 */
export async function PriceComparison({ address }: { address: string | null }) {
  const sgg = await resolveSigunguFromAddress(address).catch(() => null);
  const snapshot = sgg ? await readSigunguMedianSnapshot().catch(() => null) : null;
  const local = sgg && snapshot ? snapshot[sgg] : null;
  // readSigunguMedianSnapshot()은 DashboardSnapshot.payload를 검증 없이 캐스팅한다.
  // payload가 기대한 { median, count } 형태가 아니면(예: 마이그레이션 중 값 손상) 여기서
  // count.toLocaleString()이 서버 컴포넌트 안에서 던져 그 시군구의 모든 페이지가 500이 된다 —
  // 렌더 전에 형태를 확인해 어긋나면 줄 자체를 생략한다. label은 없어도(옛 스냅샷) 던지지
  // 않는다 — PriceComparisonView가 폴백 문구로 대체한다.
  if (!local || !Number.isFinite(local.median) || !Number.isFinite(local.count)) return null;

  return <PriceComparisonView local={local} />;
}
