import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getUrbanById, getUrbanLatLng } from '@/lib/urban/detail';
import { getUrbanList } from '@/lib/urban/list';
import { resolveSigunguFromAddress } from '@/lib/urban/region-from-address';
import { fetchChargerStatus } from '@/lib/urban/ev-status';
import { getNearbyApartments, getNearbyInfra } from '@/lib/amenity/nearby';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { getSigunguByCode } from '@/lib/region';
import { chargerDef } from '@/lib/urban/adapters/charger';
import type { ChargerRaw } from '@/lib/urban/adapters/charger';
import type { UrbanItem } from '@/lib/urban/category';
import { ChargerHero } from './_components/charger-hero';
import { ChargerStatusTable } from './_components/charger-status-table';
import { UrbanInfo } from '@/app/(public)/urban/[category]/_components/urban-info';
import { UrbanDetailSidebar } from '@/app/(public)/urban/[category]/_components/urban-detail-sidebar';
import { NearbyApartments } from '@/components/ui/nearby-apartments';
import { LocationViewer } from '@/components/ui/location-viewer';
import { Card } from '@/components/ui/card';
import { NearbyInfra } from '@/components/ui/nearby-infra';
import { NearbySubway } from '@/components/ui/nearby-subway';
import { SourceCaption } from '@/components/ui/source-caption';
import { MainSourceBlock } from '@/components/ui/main-source-block';
import { BoardBriefingSection } from '@/app/(public)/_components/board-briefing-section';
import { RelatedGuides } from '@/app/(public)/_components/related-guides';
import type { NearbyApartment } from '@/lib/amenity/nearby';

export const revalidate = 60;
// 동적 세그먼트는 generateStaticParams가 없으면 revalidate가 무시되고 매 요청 동적 렌더된다.
// 빈 배열 → 프리빌드 없이 첫 요청 시 렌더 후 revalidate 동안 ISR 캐시(dynamicParams 기본 true).
export function generateStaticParams() { return []; }

const CHARGER_ANCHORS = [
  { href: '#status', label: '충전기 현황' },
  { href: '#info',   label: '기본 정보' },
  { href: '#map',    label: '위치' },
  { href: '#apt',    label: '주변 아파트' },
  { href: '#poi',    label: '주변 생활 인프라' },
];

interface Params { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return {};
  const item = await getUrbanById('charger', BigInt(id)).catch(() => null);
  if (!item) return {};
  return {
    title: `${item.name} — 전기차충전소 정보·주변 아파트`,
    description: `${item.name} 전기차충전소 실시간 충전기 현황과 도보권 아파트 실거래가. 주변 시세를 공공데이터로 확인하세요.`,
    alternates: { canonical: `/urban/charger/${id}` },
  };
}

export default async function ChargerDetailPage({ params }: Params) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const itemId = BigInt(id);

  const rawItem = await getUrbanById('charger', itemId);
  if (!rawItem) notFound();

  const item = rawItem as UrbanItem<ChargerRaw>;
  const r = item.raw;
  const sigunguCode = await resolveSigunguFromAddress(r.address);

  const [region, coord, statuses] = await Promise.all([
    sigunguCode ? getSigunguByCode(sigunguCode).catch(() => null) : Promise.resolve(null),
    getUrbanLatLng('charger', itemId),
    fetchChargerStatus(r.sourceId),
  ]);

  const emptyList = { rows: [], total: 0, page: 1, perPage: 0, totalPages: 0 };

  const [apts, infra, otherList, subway] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord
      ? getNearbyInfra(coord.lat, coord.lng, { excludeChargerId: itemId, includeChildcare: true })
      : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    sigunguCode ? getUrbanList('charger', { sigunguCode }, 1) : Promise.resolve(emptyList),
    coord
      ? getNearbySubwayStations(coord.lat, coord.lng)
      : Promise.resolve({ stations: [], fallback: false }),
  ]);

  const others = otherList.rows.filter((s) => s.id !== item.id).slice(0, 4);
  const lastUpdated = statuses.find((s) => s.lastTsdt)?.lastTsdt ?? null;

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/urban/parking">도시인프라</Link><span>›</span>
        <Link href="/urban/charger">전기차충전소</Link><span>›</span>
        {region && (
          <><Link href={`/urban/charger?region=${sigunguCode}`}>{region.fullName}</Link><span>›</span></>
        )}
        <span className="truncate font-semibold text-[var(--color-blue-dark)]">{item.name}</span>
      </nav>

      <ChargerHero item={item} />

      <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex flex-col gap-6">
          <ChargerStatusTable units={r.units} statuses={statuses} lastUpdated={lastUpdated} />
          <UrbanInfo item={item} def={chargerDef} regionFullName={region?.fullName ?? ''} />
          <SourceCaption ids={['kepco-ev']} />
          {coord ? (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
              <LocationViewer lat={coord.lat} lng={coord.lng} name={item.name} />
            </Card>
          ) : (
            <Card>
              <p className="py-6 text-center text-sm text-[var(--color-muted)]">
                위치 정보가 등록되어 있지 않아 지도와 주변 정보를 표시할 수 없습니다.
              </p>
            </Card>
          )}
          {coord && <NearbyApartments items={apts} />}
          {coord && <NearbySubway data={subway} />}
          {coord && <NearbyInfra categories={infra} />}
          <BoardBriefingSection />
          <RelatedGuides pageKey="urban" />
          <MainSourceBlock id="kepco-ev" />
        </main>
        <aside>
          <UrbanDetailSidebar
            others={others}
            def={chargerDef}
            sigunguCode={sigunguCode}
            anchors={CHARGER_ANCHORS}
          />
        </aside>
      </div>
    </div>
  );
}
