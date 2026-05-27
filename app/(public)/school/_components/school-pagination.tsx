'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pagination } from '@/components/ui/pagination';

export function SchoolPagination({ basePath, current, totalPages, totalItems, perPage }: {
  basePath: string;
  current: number;
  totalPages: number;
  totalItems: number;
  perPage: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  return (
    <Pagination
      current={current}
      totalPages={totalPages}
      totalItems={totalItems}
      perPage={perPage}
      onChange={(page) => {
        const params = new URLSearchParams(sp.toString());
        params.set('page', String(page));
        router.push(`${basePath}?${params.toString()}`);
      }}
    />
  );
}
