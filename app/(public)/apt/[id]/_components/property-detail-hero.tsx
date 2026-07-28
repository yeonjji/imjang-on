import type { Property, Region } from '@prisma/client';
import { formatBillion } from '@/lib/format';
import { propertyAddress } from '@/lib/property';

export function PropertyDetailHero({
  property,
  region,
}: {
  property: Property;
  region: Region;
}) {
  const { display } = propertyAddress(property, region);
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
    <div className="overflow-hidden rounded-[2rem] border border-[var(--color-line)] bg-white shadow-[var(--shadow)]">
      <div className="flex min-h-[200px] items-end bg-gradient-to-br from-[#1e3a8a] to-[#38bdf8] p-8 text-white">
        <div>
          <span className="mb-3 inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
            실거래가 상세
          </span>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">{property.name}</h1>
          <p className="mt-2 text-white/80">
            {display}
            {property.builtYear ? ` · ${property.builtYear}년 준공` : ''}
            {property.households
              ? ` · ${Number(property.households).toLocaleString('ko-KR')}세대`
              : ''}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-line)] md:grid-cols-4">
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
