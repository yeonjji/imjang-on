import { Card } from '@/components/ui/card';
import type { AmenityItem } from '@/lib/amenity/category';
import { splitProducts } from '@/lib/amenity/market-display';

export function MarketProducts({ item }: { item: AmenityItem }) {
  const products = splitProducts(item.products);
  if (products.length === 0) return null;
  return (
    <Card id="market-products">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">취급 품목</h2>
      <ul className="flex flex-wrap gap-2">
        {products.map((p) => (
          <li
            key={p}
            className="rounded-full border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-1.5 text-sm font-semibold text-[var(--color-blue-dark)]"
          >{p}</li>
        ))}
      </ul>
    </Card>
  );
}
