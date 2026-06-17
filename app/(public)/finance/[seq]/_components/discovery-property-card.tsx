import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatBillion } from '@/lib/format';
import { typeToSlug } from '@/lib/property';
import type { DiscoveryProperty } from '@/lib/loan/discovery';

const TYPE_LABEL: Record<string, string> = {
  APARTMENT: '아파트',
  OFFICETEL: '오피스텔',
  ROW_HOUSE: '다세대',
  MULTIPLEX: '다세대',
};

/**
 * 디스커버리 섹션 전용 단지 카드. 아래 청약 카드(SubscriptionBoardItem)와 톤을 맞춘다:
 * rounded-xl + 라인 보더 + 그림자 없음 + hover:border-blue. h-full로 같은 행 카드 등높이.
 * (공유 PropertyCard는 그림자형 22px 카드라 그대로 두고 별도 컴포넌트로 분리.)
 */
export function DiscoveryPropertyCard({ property: p }: { property: DiscoveryProperty }) {
  const href = `/${typeToSlug(p.propertyType)}/${p.id}`;
  return (
    <Link
      href={href}
      className="flex h-full flex-col rounded-xl border border-[var(--color-line)] bg-white px-3.5 py-3 transition hover:border-[var(--color-blue)]"
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <Badge tone="blue">{TYPE_LABEL[p.propertyType]}</Badge>
        <span className="text-xs font-medium text-[var(--color-muted)]">거래 {p.txCount12m}건</span>
      </div>
      <p className="truncate text-sm font-bold text-[var(--color-blue-dark)]">{p.name}</p>
      <p className="mb-2 truncate text-xs font-medium text-[var(--color-muted)]">{p.region.fullName}</p>
      <div className="space-y-0.5 text-sm">
        {p.saleCount12m > 0 && (
          <p className="flex gap-2">
            <span className="w-8 shrink-0 text-[var(--color-muted)]">매매</span>
            <b className="text-[var(--color-blue-dark)]">{formatBillion(p.saleAvgPrice12m)}</b>
          </p>
        )}
        {p.jeonseCount12m > 0 && (
          <p className="flex gap-2">
            <span className="w-8 shrink-0 text-[var(--color-muted)]">전세</span>
            <b className="text-[var(--color-blue-dark)]">{formatBillion(p.jeonseAvgDeposit12m)}</b>
          </p>
        )}
        {p.wolseCount12m > 0 && (
          <p className="flex gap-2">
            <span className="w-8 shrink-0 text-[var(--color-muted)]">월세</span>
            <b className="text-[var(--color-blue-dark)]">
              {formatBillion(p.wolseAvgDeposit12m)}
              {p.wolseAvgRent12m ? `/${p.wolseAvgRent12m.toLocaleString('ko-KR')}만` : ''}
            </b>
          </p>
        )}
      </div>
    </Link>
  );
}
