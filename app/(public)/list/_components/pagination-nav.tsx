'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pagination } from '@/components/ui/pagination';

interface Props {
  current: number;
  totalPages: number;
  totalItems: number;
  perPage: number;
}

export function PaginationNav(props: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`/list?${params.toString()}`);
  }

  return <Pagination {...props} onChange={handleChange} />;
}
