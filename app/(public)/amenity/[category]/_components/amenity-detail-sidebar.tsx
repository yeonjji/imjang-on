import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { AmenityCategoryDef, AmenityItem } from '@/lib/amenity/category';

const ANCHORS = [
  { href: '#info', label: '기본 정보' },
  { href: '#map', label: '위치' },
  { href: '#apt', label: '주변 아파트' },
  { href: '#poi', label: '주변 생활 인프라' },
];

export function AmenityDetailSidebar({
  others,
  def,
  sigunguCode,
}: {
  others: AmenityItem[];
  def: AmenityCategoryDef;
  sigunguCode?: string | null;
}) {
  const regionListHref = sigunguCode
    ? `/amenity/${def.slug}?region=${sigunguCode}`
    : `/amenity/${def.slug}`;

  return (
    <div className="sticky top-24 flex flex-col gap-4">
      <Card>
        <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">바로가기</h3>
        <ul className="flex flex-col gap-2">
          {ANCHORS.map((a) => <li key={a.href}><a href={a.href} className="text-sm text-[var(--color-muted)] hover:text-[var(--color-blue)]">{a.label}</a></li>)}
        </ul>
      </Card>
      {others.length > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">같은 지역 다른 {def.label}</h3>
          <ul className="flex flex-col gap-2">
            {others.map((it) => (
              <li key={String(it.id)}>
                <Link href={`/amenity/${def.slug}/${it.id}`} className="text-sm hover:text-[var(--color-blue)]">· {it.name}</Link>
              </li>
            ))}
            <li>
              <Link href={regionListHref} className="text-sm font-semibold text-[var(--color-blue)]">지역 {def.label} 전체 →</Link>
            </li>
          </ul>
        </Card>
      )}
      <div className="rounded-[20px] border border-dashed border-[#93c5fd] bg-white/65 p-7 text-center text-xs text-[var(--color-muted)]">광고 영역</div>
    </div>
  );
}
