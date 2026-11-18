import { Card } from '@/components/ui/card';
import { formatBillion, formatPyeong } from '@/lib/format';
import { unitAreaBasis, areaBasisLabel } from '@/lib/subscription/unit-area-basis';
import type { SubscriptionUnit } from '@prisma/client';
import type { SpecialBreakdown } from '@/lib/subscription/apt-detail';
import type { AmountCorrection } from '@/lib/subscription/amount-corrections';

// area 컬럼은 어댑터가 SUPLY_AR(공급면적) ?? EXCLUSE_AR(전용면적)로 채워 행마다 기준이 다르다
// (실측: 공급 79.8% · 전용 12.3% · NULL 7.9%). 그래서 "전용면적"으로 일괄 표기하면 거짓이 되고,
// unitAreaBasis()로 판정한 기준을 셀마다 병기한다.
function areaCell(u: SubscriptionUnit): string {
  if (u.area == null) return '-';
  const label = areaBasisLabel(unitAreaBasis(u.rawJson));
  const pyeong = formatPyeong(Number(u.area));
  return label ? `${label} ${pyeong}` : pyeong;
}
function supply(n: number | null): string {
  return n != null && n > 0 ? `${n.toLocaleString('ko-KR')}세대` : '-';
}

// rental: 임대 공고는 금액을 '분양가'가 아니라 청약홈 원문 표기 '공급금액'으로 부른다(lib/subscription/rental.ts).
// perPyeong: 단위 id → 3.3㎡당 만원(APT 분양주택만, lib/subscription/apt-detail.ts). 하나라도 있으면 열을 연다.
// special: 모바일은 특공 유형별을 주택형 카드 안에 접어 둔다(데스크톱은 SpecialSupplyBreakdown 섹션).
// corrections: 공고문 기준으로 보정한 금액이 있으면 그 사실을 밝힌다.
export function UnitSupplyTable({
  units,
  rental = false,
  perPyeong = {},
  special = null,
  corrections = [],
}: {
  units: SubscriptionUnit[];
  rental?: boolean;
  perPyeong?: Record<string, number | null>;
  special?: SpecialBreakdown | null;
  corrections?: AmountCorrection[];
}) {
  if (units.length === 0) return null;
  const hasPerPyeong = units.some((u) => perPyeong[String(u.id)] != null);
  const ppText = (u: SubscriptionUnit) => {
    const v = perPyeong[String(u.id)];
    return v != null ? `${v.toLocaleString('ko-KR')}만원` : '-';
  };
  const specialRow = (u: SubscriptionUnit) => special?.rows.find((r) => r.houseType === (u.houseType ?? '-'));

  return (
    <Card id="units" className="!p-0">
      <h2 className="px-6 pt-6 text-lg font-bold text-[var(--color-blue-dark)]">주택형별 공급</h2>

      {/* 데스크톱: 테이블 */}
      <table className="mt-4 hidden w-full text-sm sm:table">
        <thead>
          <tr className="border-y border-[var(--color-line)] text-left text-xs text-[var(--color-muted)]">
            <th className="px-6 py-3 font-semibold">주택형</th>
            <th className="px-4 py-3 font-semibold">면적</th>
            <th className="px-4 py-3 font-semibold">일반공급</th>
            <th className="px-4 py-3 font-semibold">특별공급</th>
            <th className={`${hasPerPyeong ? 'px-4' : 'px-6'} py-3 text-right font-semibold`}>
              {rental ? '공급금액(최고)' : '분양가'}
            </th>
            {hasPerPyeong && <th className="px-6 py-3 text-right font-semibold">3.3㎡당</th>}
          </tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={String(u.id)} className="border-b border-[var(--color-line)] last:border-0">
              <td className="whitespace-nowrap px-6 py-3 font-semibold text-[var(--color-blue-dark)]">
                {u.houseType ?? '-'}
              </td>
              <td className="whitespace-nowrap px-4 py-3">{areaCell(u)}</td>
              <td className="whitespace-nowrap px-4 py-3">{supply(u.generalSupply)}</td>
              <td className="whitespace-nowrap px-4 py-3">{supply(u.specialSupply)}</td>
              <td
                className={`whitespace-nowrap ${hasPerPyeong ? 'px-4' : 'px-6'} py-3 text-right font-bold text-[var(--color-blue-dark)]`}
              >
                {formatBillion(u.topAmount)}
              </td>
              {hasPerPyeong && (
                <td className="whitespace-nowrap px-6 py-3 text-right font-semibold">{ppText(u)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* 모바일: 카드 리스트 */}
      <ul className="mt-2 divide-y divide-[var(--color-line)] sm:hidden">
        {units.map((u) => (
          <li key={String(u.id)} className="px-6 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="break-keep font-semibold text-[var(--color-blue-dark)]">
                {u.houseType ?? '-'}
              </span>
              <span className="whitespace-nowrap font-bold text-[var(--color-blue-dark)]">
                {formatBillion(u.topAmount)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
              <span>{areaCell(u)}</span>
              <span>일반 {supply(u.generalSupply)}</span>
              <span>특별 {supply(u.specialSupply)}</span>
              {perPyeong[String(u.id)] != null && <span>3.3㎡당 {ppText(u)}</span>}
            </div>
            {special && specialRow(u) && (
              <details className="mt-2">
                <summary className="cursor-pointer py-1.5 text-xs font-bold text-[var(--color-blue)]">
                  특별공급 유형별 보기
                </summary>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-[var(--color-soft)] px-4 py-2.5 text-sm">
                  {special.columns.map((c, i) => (
                    <div key={c} className="flex justify-between gap-2">
                      <dt className="text-[var(--color-text)]">{c}</dt>
                      <dd className="font-semibold text-[var(--color-blue-dark)]">{specialRow(u)!.counts[i]}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </li>
        ))}
      </ul>

      {rental && (
        <p className="mx-6 mt-4 rounded-xl bg-[var(--color-soft)] px-4 py-2.5 text-sm text-[var(--color-text)]">
          임대주택입니다. 공급금액은 청약홈에 실린 주택형별 최고 금액이며, 임대보증금·월 임대료·분양전환
          가격은 입주자모집 공고문에서 확인하세요.
        </p>
      )}

      {corrections.length > 0 && (
        <p className="mx-6 mt-4 rounded-xl bg-[var(--color-soft)] px-4 py-2.5 text-sm text-[var(--color-text)]">
          {corrections.map((c) => c.houseType).join(', ')} 금액은 청약홈 원자료에{' '}
          {corrections.map((c) => c.sourceAmount.toLocaleString('ko-KR')).join(', ')}만원으로 실려 있으나,
          입주자모집 공고문을 확인해 바로잡은 값입니다.
        </p>
      )}

      {hasPerPyeong ? (
        // APT 분양주택은 면적이 전부 공급면적(SUPLY_AR 100%)이라 단가 기준이 하나로 맞는다.
        <p className="px-6 pb-4 pt-2 text-xs text-[var(--color-muted)]">
          분양가는 주택형별 최고 공급금액입니다. 3.3㎡당은 최고 분양가를 공급면적(주거전용+주거공용)으로
          나눈 값이고, 층·호수별 실제 금액은 공고문에서 확인하세요.
        </p>
      ) : (
        // 면적 기준(공급/전용)이 주택형마다 달라 셀마다 병기했다는 걸 밝힌다.
        // 분양가·실거래 비교 시 면적당 단가를 내지 않는 이유이기도 하다(price-comparison.tsx 참고).
        <p className="px-6 pb-4 pt-2 text-xs text-[var(--color-muted)]">
          면적은 공고 원자료에 실린 기준(공급 또는 전용)을 그대로 표기합니다. 주택형마다 기준이
          다를 수 있어, {rental ? '공급금액과' : '분양가와'} 실거래를 비교할 때 면적당 단가는 따로 계산하지 않았습니다.
        </p>
      )}
      <div className="h-2" />
    </Card>
  );
}
