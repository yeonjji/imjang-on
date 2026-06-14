import { Card } from '@/components/ui/card';
import { externalHref } from '@/lib/external-href';
import type { LoanProduct } from '@prisma/client';

export function LoanSidebar({
  product,
  rltsite,
}: {
  product: LoanProduct;
  rltsite: string | null;
}) {
  const facts: { label: string; value: string }[] = [];
  if (product.lnlmt != null)
    facts.push({ label: '대출한도', value: `${product.lnlmt.toLocaleString('ko-KR')}만원` });
  if (product.irt) facts.push({ label: '금리', value: product.irt });
  if (product.irtCtg) facts.push({ label: '금리구분', value: product.irtCtg });
  if (product.targetTags.length > 0)
    facts.push({ label: '대상', value: product.targetTags.join(', ') });
  if (product.ofrinstnm) facts.push({ label: '제공기관', value: product.ofrinstnm });

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
