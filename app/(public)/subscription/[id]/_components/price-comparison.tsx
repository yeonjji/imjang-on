import { readSigunguMedianSnapshot } from '@/lib/subscription/median-snapshot';
import { resolveSigunguFromAddress } from '@/lib/region/from-address';
import { unitAreaBasis, areaBasisLabel } from '@/lib/subscription/unit-area-basis';
import { formatBillion } from '@/lib/format';
import { SourceCaption } from '@/components/ui/source-caption';
import type { SubscriptionUnit } from '@prisma/client';

/**
 * 이 공고의 주택형별 분양가와 같은 시군구 실거래 중위가를 나란히 놓는다.
 *
 * **면적당 단가는 비교하지 않는다.** `area`의 기준이 행마다 다르고(공급 80% / 전용 12%)
 * 실거래는 전용면적이라, 단가를 나란히 두면 행끼리도 실거래와도 비교가 안 된다. 총액끼리만 본다.
 */
export async function PriceComparison({
  units,
  address,
}: {
  units: SubscriptionUnit[];
  address: string | null;
}) {
  const priced = units.filter((u) => u.topAmount != null);
  if (priced.length === 0) return null;

  const sgg = await resolveSigunguFromAddress(address).catch(() => null);
  const snapshot = sgg ? await readSigunguMedianSnapshot().catch(() => null) : null;
  const local = sgg && snapshot ? snapshot[sgg] : null;

  return (
    <section className="my-8 rounded-[18px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
      <h2 className="text-base font-bold text-[var(--color-blue-dark)]">이 공고의 분양가와 주변 시세</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)]">
              <th scope="col" className="py-2 text-left text-xs font-bold text-[var(--color-muted)]">주택형</th>
              <th scope="col" className="py-2 text-right text-xs font-bold text-[var(--color-muted)]">면적</th>
              <th scope="col" className="py-2 text-right text-xs font-bold text-[var(--color-muted)]">분양 최고가</th>
            </tr>
          </thead>
          <tbody>
            {priced.map((u, i) => {
              const basis = unitAreaBasis(u.rawJson);
              const sqm = u.area == null ? null : Number(u.area);
              return (
                <tr key={i} className="border-b border-[var(--color-line)] last:border-b-0">
                  <td className="py-2 text-left text-[var(--color-text)]">{u.houseType ?? '-'}</td>
                  <td className="py-2 text-right text-[var(--color-text)]">
                    {sqm == null ? '-' : `${areaBasisLabel(basis)} ${sqm.toFixed(2)}㎡`}
                  </td>
                  <td className="py-2 text-right text-[var(--color-text)]">{formatBillion(u.topAmount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {local && (
        <p className="mt-3 text-sm text-[var(--color-text)]">
          같은 시군구 아파트 매매 중위가(최근 12개월) <strong>{formatBillion(local.median)}</strong>
          <span className="text-[var(--color-muted)]"> · 거래 {local.count.toLocaleString('ko-KR')}건</span>
        </p>
      )}
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        분양가는 공고에 적힌 최고 공급금액입니다. 면적 기준이 주택형마다 다르고 실거래는 전용면적
        기준이라, 면적당 단가는 비교하지 않았습니다.
      </p>
      <SourceCaption ids={local ? ['applyhome', 'molit-rtms'] : ['applyhome']} />
    </section>
  );
}
