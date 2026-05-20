import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatBillion } from '@/lib/format';
import { typeToSlug } from '@/lib/property';
import type { DealFilter } from '@/lib/property';
import type { Property, Region } from '@prisma/client';

const TYPE_LABEL: Record<string, string> = {
  APARTMENT: '아파트',
  OFFICETEL: '오피스텔',
  ROW_HOUSE: '다세대',
  MULTIPLEX: '다세대',
};

interface Props {
  property: Property & { region: Region };
  deal?: DealFilter;
}

export function PropertyListCard({ property: p, deal }: Props) {
  const slug = typeToSlug(p.propertyType);
  const href = `/${slug}/${p.id}`;

  const isHighlighted = (type: 'sale' | 'jeonse' | 'wolse') =>
    !deal || deal === 'all' || deal === type;

  return (
    <Link href={href}>
      <article className="grid grid-cols-[1fr_200px] gap-6 items-center rounded-[22px] border border-[var(--color-line)] bg-white px-6 py-5 shadow-[var(--shadow)] transition hover:shadow-lg">
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
            {p.households ? ` · ${p.households.toLocaleString('ko-KR')}세대` : ''}
          </p>

          {/* 가격 박스 */}
          <div className="grid grid-cols-3 gap-3">
            {p.saleCount12m > 0 && (
              <div className={`rounded-[14px] bg-[var(--color-soft)] px-4 py-3 transition ${!isHighlighted('sale') ? 'opacity-40' : ''}`}>
                <span className="block text-xs text-[var(--color-muted)] mb-1">매매</span>
                <strong className="text-base font-bold text-[var(--color-blue-dark)]">
                  {formatBillion(p.saleLastPrice ?? p.saleAvgPrice12m)}
                </strong>
              </div>
            )}
            {p.jeonseCount12m > 0 && (
              <div className={`rounded-[14px] bg-[var(--color-soft)] px-4 py-3 transition ${!isHighlighted('jeonse') ? 'opacity-40' : ''}`}>
                <span className="block text-xs text-[var(--color-muted)] mb-1">전세</span>
                <strong className="text-base font-bold text-[var(--color-blue-dark)]">
                  {formatBillion(p.jeonseLastDeposit ?? p.jeonseAvgDeposit12m)}
                </strong>
              </div>
            )}
            {p.wolseCount12m > 0 && (
              <div className={`rounded-[14px] bg-[var(--color-soft)] px-4 py-3 transition ${!isHighlighted('wolse') ? 'opacity-40' : ''}`}>
                <span className="block text-xs text-[var(--color-muted)] mb-1">월세</span>
                <strong className="text-base font-bold text-[var(--color-blue-dark)]">
                  {formatBillion(p.wolseLastDeposit)}{p.wolseLastRent ? `/${p.wolseLastRent.toLocaleString('ko-KR')}만` : ''}
                </strong>
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽 요약 박스 */}
        <div className="rounded-[18px] bg-[#eff6ff] px-4 py-4 text-sm text-[var(--color-muted)] leading-relaxed self-stretch flex flex-col justify-center gap-1">
          <p className="font-semibold text-[var(--color-blue-dark)]">12개월 거래 {p.txCount12m}건</p>
          {p.saleCount12m > 0 && <p>매매 {p.saleCount12m}건</p>}
          {p.jeonseCount12m > 0 && <p>전세 {p.jeonseCount12m}건</p>}
          {p.wolseCount12m > 0 && <p>월세 {p.wolseCount12m}건</p>}
        </div>
      </article>
    </Link>
  );
}
