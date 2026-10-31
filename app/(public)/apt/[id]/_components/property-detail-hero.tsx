import type { Property, Region } from '@prisma/client';
import { formatBillion } from '@/lib/format';
import { propertyAddress } from '@/lib/property';

export function PropertyDetailHero({
  property,
  region,
  confirmed,
  builtYear,
}: {
  property: Property;
  region: Region;
  /** 이 단지의 거래가 단일 지번에 모여 있는지. 아니면 히어로는 법정동까지만 표기한다 */
  confirmed: boolean;
  /**
   * 준공 연도. 사용승인일이 있으면 그 연도가 들어온다(resolveBuiltYear).
   * 미지정이면 실거래 신고의 건축년도를 쓴다 — 단지정보가 없는 페이지의 기존 동작.
   */
  builtYear?: number | null;
}) {
  const builtYearShown = builtYear !== undefined ? builtYear : property.builtYear;
  const addr = propertyAddress(property, region);
  // 미확정 지번을 접힘선 위에 확정 주소처럼 내보내지 않는다. 전체 지번은 '대표 지번' 배지가
  // 붙는 주소 줄(AddressLine)에서만 보여준다.
  const display = confirmed ? addr.display : addr.localityDisplay;
  const txCount = Number(property.txCount12m ?? 0);
  const trend = txCount > 10 ? '거래 활발' : txCount > 3 ? '소폭 거래' : '거래 소강';

  const boxes = [
    { label: '최근 매매 실거래', value: formatBillion(property.saleLastPrice) },
    { label: '최근 전세 실거래', value: formatBillion(property.jeonseLastDeposit) },
    {
      label: '최근 월세 실거래',
      value:
        property.wolseLastDeposit != null
          ? `${formatBillion(property.wolseLastDeposit)} / ${Number(property.wolseLastRent ?? 0).toLocaleString('ko-KR')}만`
          : '-',
    },
    { label: '최근 거래 흐름', value: trend },
  ];

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-5 p-6 md:p-7">
        <div aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border border-[var(--color-line)] bg-[var(--color-sky-soft)] text-2xl md:h-16 md:w-16 md:text-3xl">🏢</div>
        <div className="min-w-0">
          <span className="mb-2 inline-block rounded-full bg-[var(--color-sky-soft)] px-2 py-0.5 text-xs font-bold text-[var(--color-blue-dark)]">
            실거래가 상세
          </span>
          <h1 className="break-keep text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">{property.name}</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            {display}
            {builtYearShown ? ` · ${builtYearShown}년 준공` : ''}
            {property.households
              ? ` · ${Number(property.households).toLocaleString('ko-KR')}세대`
              : ''}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-line)] border-t border-[var(--color-line)] md:grid-cols-4">
        {boxes.map((box) => (
          <div key={box.label} className="bg-white p-5">
            <p className="text-xs text-[var(--color-muted)]">{box.label}</p>
            <p className="mt-2 text-xl font-bold text-[var(--color-blue-dark)]">{box.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
