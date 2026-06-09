import Link from 'next/link';
import { Card } from '@/components/ui/card';

interface SidebarItem { id: bigint; name: string; }

const ANCHORS = [
  { href: '#info', label: '기본 정보' },
  { href: '#facility', label: '시설' },
  { href: '#age-breakdown', label: '연령별 현황' },
  { href: '#wait-list', label: '입소대기' },
  { href: '#staff', label: '교직원' },
  { href: '#map', label: '위치' },
  { href: '#apt', label: '주변 아파트' },
];

export function ChildcareDetailSidebar({ basePath, others }: { basePath: string; others: SidebarItem[] }) {
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
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">같은 지역 다른 어린이집</h3>
          <ul className="flex flex-col gap-2">
            {others.map((o) => <li key={String(o.id)}><Link href={`${basePath}/${o.id}`} className="text-sm hover:text-[var(--color-blue)]">· {o.name}</Link></li>)}
            <li><Link href={basePath} className="text-sm font-semibold text-[var(--color-blue)]">지역 어린이집 전체 보기 →</Link></li>
          </ul>
        </Card>
      )}
      {/* 광고 영역 (AdSense 미연동 — 연동 후 활성화)
      <div className="rounded-[20px] border border-dashed border-[#93c5fd] bg-white/65 p-7 text-center text-xs text-[var(--color-muted)]">광고 영역</div>
      */}
    </div>
  );
}
