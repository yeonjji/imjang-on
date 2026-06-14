import { Card } from '@/components/ui/card';
import { externalHref } from '@/lib/external-href';
import { decodeEntities } from '@/lib/loan/detail';
import type { LoanProduct } from '@prisma/client';

export function LoanSidebar({
  product,
  rltsite,
}: {
  product: LoanProduct;
  rltsite: string | null;
}) {
  // 한도·금리 등 핵심 수치는 본문 '한눈에' 박스에 있으므로, 사이드바는 분류성 정보만.
  const facts: { label: string; value: string }[] = [];
  if (product.ofrinstnm) facts.push({ label: '제공기관', value: decodeEntities(product.ofrinstnm) });
  if (product.instCtg) facts.push({ label: '기관구분', value: decodeEntities(product.instCtg) });
  if (product.targetTags.length > 0)
    facts.push({ label: '대상', value: decodeEntities(product.targetTags.join(', ')) });

  return (
    <div className="sticky top-24 flex flex-col gap-4">
      {facts.length > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">핵심 정보</h3>
          <ul className="space-y-2 text-sm">
            {facts.map((f) => (
              <li key={f.label} className="flex items-start justify-between gap-3">
                <span className="shrink-0 text-[var(--color-muted)]">{f.label}</span>
                <span className="break-keep text-right font-semibold text-[var(--color-blue-dark)]">
                  {f.value}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {rltsite && (
        <Card>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">바로가기</h3>
          <a
            href={externalHref(rltsite)}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl bg-[var(--color-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--color-blue-dark)] transition-colors hover:bg-[var(--color-line)]"
          >
            관련 사이트에서 보기 →
          </a>
        </Card>
      )}
    </div>
  );
}
