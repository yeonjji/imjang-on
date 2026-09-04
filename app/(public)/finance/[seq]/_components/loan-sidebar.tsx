import { Card } from '@/components/ui/card';
import { externalHref, isLinkableUrl } from '@/lib/external-href';
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

  // 원천(서민금융진흥원)의 rltsite에는 URL이 아니라 안내 문구가 들어오기도 한다
  // (예: "취급은행 홈페이지"). 링크로 만들면 존재하지 않는 호스트가 되므로 문구로만 표시한다.
  const linkable = rltsite != null && isLinkableUrl(rltsite);

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

      {rltsite && linkable && (
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

      {rltsite && !linkable && (
        <Card>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">관련 사이트</h3>
          <p className="break-keep text-sm text-[var(--color-muted)]">{decodeEntities(rltsite)}</p>
        </Card>
      )}
    </div>
  );
}
