import Link from 'next/link';
import { Card } from '@/components/ui/card';

interface Props {
  code: string;
  name: string;
  count?: number;
}

export function RegionCard({ code, name, count }: Props) {
  return (
    <Link href={`/region/${code.slice(0, 5)}`}>
      <Card className="text-center transition hover:shadow-lg">
        <p className="text-base font-bold text-[var(--color-blue-dark)]">{name}</p>
        {count !== undefined && (
          <p className="mt-1 text-xs text-[var(--color-muted)]">단지 {count.toLocaleString('ko-KR')}개</p>
        )}
      </Card>
    </Link>
  );
}
