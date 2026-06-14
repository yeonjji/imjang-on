import type { LoanProduct } from '@prisma/client';

export function LoanHero({ product }: { product: LoanProduct }) {
  return (
    <div className="flex min-h-[160px] items-end rounded-[26px] bg-gradient-to-br from-[#1e3a8a] to-[#38bdf8] p-7 text-white sm:p-8">
      <div className="min-w-0">
        <p className="mb-2 text-xs font-bold text-white/80">주거금융 · 대출상품</p>
        <h1 className="break-keep text-2xl font-black tracking-tight sm:text-3xl">
          {product.finprdnm}
        </h1>
        <p className="mt-2 break-keep text-sm text-white/80">
          {product.ofrinstnm ?? '—'}
          {product.instCtg ? ` · ${product.instCtg}` : ''}
        </p>
        {product.usageTags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {product.usageTags.map((t) => (
              <span
                key={t}
                className="inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold"
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
