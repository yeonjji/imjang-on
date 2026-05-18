import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatBillion, formatDate } from '@/lib/format';
import { typeToSlug } from '@/lib/property';
import type { Property, Region } from '@prisma/client';

interface Props {
  property: Property & { region: Region };
}

export function PropertyCard({ property: p }: Props) {
  const slug = typeToSlug(p.propertyType);
  const href = `/${slug}/${p.id}`;
  return (
    <Link href={href}>
      <Card className="transition hover:shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-bold text-[var(--color-blue-dark)]">{p.name}</p>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              {p.region.fullName} · {p.builtYear ? `${p.builtYear}년 준공` : '준공년도 미상'}
              {p.households ? ` · ${p.households.toLocaleString('ko-KR')}세대` : ''}
            </p>
          </div>
          <Badge tone="blue">{p.txCount12m}건</Badge>
        </div>
        <div className="mt-4 space-y-1.5 text-sm">
          {p.saleCount12m > 0 && (
            <p>
              <span className="inline-block w-12 text-[var(--color-muted)]">매매</span>
              평균 <b>{formatBillion(p.saleAvgPrice12m)}</b>
              <span className="ml-2 text-[var(--color-muted)]">최근 {formatBillion(p.saleLastPrice)} · {formatDate(p.saleLastAt)}</span>
            </p>
          )}
          {p.jeonseCount12m > 0 && (
            <p>
              <span className="inline-block w-12 text-[var(--color-muted)]">전세</span>
              평균 <b>{formatBillion(p.jeonseAvgDeposit12m)}</b>
              <span className="ml-2 text-[var(--color-muted)]">최근 {formatBillion(p.jeonseLastDeposit)} · {formatDate(p.jeonseLastAt)}</span>
            </p>
          )}
          {p.wolseCount12m > 0 && (
            <p>
              <span className="inline-block w-12 text-[var(--color-muted)]">월세</span>
              보 <b>{formatBillion(p.wolseAvgDeposit12m)}</b> / 월 <b>{p.wolseAvgRent12m?.toLocaleString('ko-KR')}만원</b>
            </p>
          )}
        </div>
      </Card>
    </Link>
  );
}
