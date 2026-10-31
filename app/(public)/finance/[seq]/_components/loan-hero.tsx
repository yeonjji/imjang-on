import { decodeEntities } from '@/lib/loan/detail';
import type { LoanProduct } from '@prisma/client';

export function LoanHero({ product }: { product: LoanProduct }) {
  return (
    <div className="flex items-center gap-5 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white p-6 shadow-[var(--shadow-soft)] md:p-7">
      <div aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border border-[var(--color-line)] bg-[var(--color-sky-soft)] text-2xl md:h-16 md:w-16 md:text-3xl">🏦</div>
      <div className="min-w-0">
        <p className="mb-2 text-xs font-bold text-[var(--color-muted)]">주거금융 · 대출상품</p>
        <h1 className="break-keep text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
          {decodeEntities(product.finprdnm)}
        </h1>
        <p className="mt-2 break-keep text-sm text-[var(--color-muted)]">
          {product.ofrinstnm ? decodeEntities(product.ofrinstnm) : '—'}
          {product.instCtg ? ` · ${decodeEntities(product.instCtg)}` : ''}
        </p>
        {product.usageTags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {product.usageTags.map((t) => (
              <span
                key={t}
                className="inline-block rounded-full bg-[var(--color-sky-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue-dark)]"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
