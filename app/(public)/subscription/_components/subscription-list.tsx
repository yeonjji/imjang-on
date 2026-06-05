import { Suspense } from 'react';
import {
  getSubscriptionList,
  type SubscriptionStatus,
} from '@/lib/subscription';
import type { SubscriptionCategory } from '@prisma/client';
import { SubscriptionCard } from './subscription-card';
import { SubscriptionPagination } from './subscription-pagination';

interface Props {
  categories: SubscriptionCategory[];
  sido?: string;
  status?: SubscriptionStatus;
  sort: 'recent' | 'notice';
  page: number;
}

export async function SubscriptionList({ categories, sido, status, sort, page }: Props) {
  const { rows, total, totalPages, perPage } = await getSubscriptionList({
    categories,
    sido,
    status,
    sort,
    page,
    perPage: 20,
  });

  return (
    <>
      <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow)]">
        <p className="text-base font-bold text-[var(--color-blue-dark)]">
          청약 공고 <span className="text-[var(--color-blue)]">{total.toLocaleString('ko-KR')}</span>건
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">
          조건에 맞는 청약 공고가 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((item) => (
            <SubscriptionCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6">
          <Suspense>
            <SubscriptionPagination
              current={page}
              totalPages={totalPages}
              totalItems={total}
              perPage={perPage}
            />
          </Suspense>
        </div>
      )}
    </>
  );
}
