import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatBillion, formatAreaTypes } from '@/lib/format';
import { typeToSlug } from '@/lib/property';
import type { DealFilter, PropertyListItem } from '@/lib/property';

const TYPE_LABEL: Record<string, string> = {
  APARTMENT: '아파트',
  OFFICETEL: '오피스텔',
  ROW_HOUSE: '다세대',
  MULTIPLEX: '다세대',
};

interface Props {
  property: PropertyListItem;
  deal?: DealFilter;
}

export function PropertyListCard({ property: p, deal }: Props) {
  const slug = typeToSlug(p.propertyType);
  const href = `/${slug}/${p.id}`;

  const isHighlighted = (type: 'sale' | 'jeonse' | 'wolse') =>
    !deal || deal === 'all' || deal === type;

  return (
    <Link href={href}>
      <article className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-4 md:gap-6 items-start md:items-center rounded-[22px] border border-[var(--color-line)] bg-white px-6 py-5 shadow-[var(--shadow)] transition hover:shadow-lg">
        {/* 왼쪽 */}
        <div>
          {/* 뱃지 */}
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge tone="blue">{TYPE_LABEL[p.propertyType]}</Badge>
          </div>

          {/* 단지명 */}
          <h3 className="text-xl font-bold text-[var(--color-blue-dark)] mb-1">{p.name}</h3>

          {/* 주소 정보 */}
          <p className="text-sm text-[var(--color-muted)] mb-4">
            {p.region.fullName}
            {p.builtYear ? ` · ${p.builtYear}년` : ''}
            {p.areaTypes.length > 0 ? ` · ${formatAreaTypes(p.areaTypes)}` : ''}
            {p.households ? ` · ${p.households.toLocaleString('ko-KR')}세대` : ''}
          </p>

          {/* 가격 박스 — 존재하는 거래유형 수(1~3)에 맞춰 유동 배치(flex-wrap).
              고정 3칸이면 단독 거래유형이 1/3폭으로 눌려 금액이 토큰 중간에서 깨지므로,
              각 박스는 flex-1로 남은 폭을 채우되 min 8rem으로 복합값(보증금/월세)을 한 줄에 담고
              max 13rem으로 단독 박스의 과확장을 막는다. 폭이 부족하면 <wbr> 토큰 단위로만 줄바꿈. */}
          <div className="flex flex-wrap gap-2 md:gap-3">
            {p.saleCount12m > 0 && (
              <div className={`min-w-[8rem] flex-1 max-w-[13rem] rounded-[14px] bg-[var(--color-soft)] px-3 py-2.5 md:px-4 md:py-3 transition ${!isHighlighted('sale') ? 'opacity-40' : ''}`}>
                <span className="block text-xs text-[var(--color-muted)] mb-1">매매</span>
                <strong className="block break-keep text-[15px] font-bold leading-tight text-[var(--color-blue-dark)] md:text-base">
                  {formatBillion(p.saleLastPrice ?? p.saleAvgPrice12m)}
                </strong>
              </div>
            )}
            {p.jeonseCount12m > 0 && (
              <div className={`min-w-[8rem] flex-1 max-w-[13rem] rounded-[14px] bg-[var(--color-soft)] px-3 py-2.5 md:px-4 md:py-3 transition ${!isHighlighted('jeonse') ? 'opacity-40' : ''}`}>
                <span className="block text-xs text-[var(--color-muted)] mb-1">전세</span>
                <strong className="block break-keep text-[15px] font-bold leading-tight text-[var(--color-blue-dark)] md:text-base">
                  {formatBillion(p.jeonseLastDeposit ?? p.jeonseAvgDeposit12m)}
                </strong>
              </div>
            )}
            {p.wolseCount12m > 0 && (
              <div className={`min-w-[8rem] flex-1 max-w-[13rem] rounded-[14px] bg-[var(--color-soft)] px-3 py-2.5 md:px-4 md:py-3 transition ${!isHighlighted('wolse') ? 'opacity-40' : ''}`}>
                <span className="block text-xs text-[var(--color-muted)] mb-1">월세</span>
                <strong className="block break-keep text-[15px] font-bold leading-tight text-[var(--color-blue-dark)] md:text-base">
                  <span className="whitespace-nowrap">{formatBillion(p.wolseLastDeposit)}</span>
                  {p.wolseLastRent ? (
                    <>
                      <wbr />
                      <span className="whitespace-nowrap">/{p.wolseLastRent.toLocaleString('ko-KR')}만</span>
                    </>
                  ) : null}
                </strong>
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽 요약 박스 */}
        <div className="rounded-[18px] bg-[#eff6ff] px-4 py-3 text-sm text-[var(--color-muted)] leading-relaxed flex flex-row md:flex-col items-center md:items-start justify-between md:justify-center gap-2 md:gap-1 md:self-stretch">
          <p className="font-semibold text-[var(--color-blue-dark)] whitespace-nowrap">12개월 거래 {p.txCount12m}건</p>
          <div className="flex flex-row md:flex-col gap-3 md:gap-0">
            {p.saleCount12m > 0 && <p className="whitespace-nowrap">매매 {p.saleCount12m}건</p>}
            {p.jeonseCount12m > 0 && <p className="whitespace-nowrap">전세 {p.jeonseCount12m}건</p>}
            {p.wolseCount12m > 0 && <p className="whitespace-nowrap">월세 {p.wolseCount12m}건</p>}
          </div>
        </div>
      </article>
    </Link>
  );
}
