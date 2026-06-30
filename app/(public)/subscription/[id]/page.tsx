import { notFound } from 'next/navigation';
import {
  getSubscriptionById,
  getSubscriptionLatLng,
  categoryLabel,
} from '@/lib/subscription';
import { getNearbyApartments, getNearbyInfra } from '@/lib/amenity/nearby';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { LocationViewer } from '@/components/ui/location-viewer';
import { NearbyApartments } from '@/components/ui/nearby-apartments';
import { NearbyInfra } from '@/components/ui/nearby-infra';
import { NearbySubway } from '@/components/ui/nearby-subway';
import { SubscriptionHero } from './_components/subscription-hero';
import { ScheduleTimeline } from './_components/schedule-timeline';
import { UnitSupplyTable } from './_components/unit-supply-table';
import { SubscriptionSidebar } from './_components/subscription-sidebar';
import { SourceCaption } from '@/components/ui/source-caption';
import { MainSourceBlock } from '@/components/ui/main-source-block';
import { subscriptionSource } from '@/lib/data-sources';
import { JsonLd, breadcrumbSchema } from '@/lib/seo/json-ld';
import { subscriptionBlurb } from '@/lib/seo/blurb';
import { SITE_URL } from '@/lib/site';
import type { Metadata } from 'next';
import { BoardBriefingSection } from '../../_components/board-briefing-section';

export const revalidate = 21_600;

interface Params {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return {};
  const notice = await getSubscriptionById(BigInt(id)).catch(() => null);
  if (!notice) return {};
  const region = notice.regionName ? `${notice.regionName} ` : '';
  const supply = notice.totalSupply ? `, ${notice.totalSupply.toLocaleString('ko-KR')}세대 공급` : '';
  return {
    title: `${notice.name} 청약 · ${categoryLabel(notice.category)}`,
    description: `${region}${notice.name} 청약${supply}. 접수 일정·주택형별 분양가와 주변 단지 시세를 한눈에 확인하세요.`,
    alternates: { canonical: `/subscription/${notice.id}` },
  };
}

export default async function SubscriptionDetailPage({ params }: Params) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const noticeId = BigInt(id);
  const notice = await getSubscriptionById(noticeId);
  if (!notice) notFound();

  const coord = await getSubscriptionLatLng(noticeId);
  const [nearbyApts, infra, subway] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([]),
    coord
      ? getNearbyInfra(coord.lat, coord.lng, { includeChildcare: true })
      : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    coord
      ? getNearbySubwayStations(coord.lat, coord.lng)
      : Promise.resolve({ stations: [], fallback: false }),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <JsonLd
        data={[
          notice.receiptBegin || notice.receiptEnd
            ? {
                '@context': 'https://schema.org',
                '@type': 'Event',
                name: `${notice.name} 청약 공고`,
                url: `${SITE_URL}/subscription/${notice.id}`,
                ...(notice.regionName ? { location: { '@type': 'Place', name: notice.regionName } } : {}),
                ...(notice.receiptBegin ? { startDate: notice.receiptBegin.toISOString().slice(0, 10) } : {}),
                ...(notice.receiptEnd ? { endDate: notice.receiptEnd.toISOString().slice(0, 10) } : {}),
              }
            : {
                '@context': 'https://schema.org',
                '@type': 'WebPage',
                name: `${notice.name} 청약 공고`,
                url: `${SITE_URL}/subscription/${notice.id}`,
                ...(notice.regionName ? { about: notice.regionName } : {}),
              },
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: '청약·분양', url: `${SITE_URL}/subscription` },
            { name: notice.name, url: `${SITE_URL}/subscription/${notice.id}` },
          ]),
        ]}
      />
      <SubscriptionHero notice={notice} />
      <p className="mt-5 rounded-2xl bg-[var(--color-soft)] px-5 py-4 leading-relaxed text-[var(--color-text)]">
        {subscriptionBlurb({
          name: notice.name,
          regionName: notice.regionName,
          categoryLabel: categoryLabel(notice.category),
          totalSupply: notice.totalSupply,
          receiptBegin: notice.receiptBegin,
          receiptEnd: notice.receiptEnd,
        })}
      </p>
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex min-w-0 flex-col gap-8">
          <ScheduleTimeline notice={notice} />
          <UnitSupplyTable units={notice.units} />
          <SourceCaption ids={['applyhome', 'lh-presub']} />

          {coord ? (
            <>
              <section id="map">
                <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
                <LocationViewer lat={coord.lat} lng={coord.lng} name={notice.name} />
              </section>
              <NearbyApartments items={nearbyApts} />
              <NearbySubway data={subway} />
              <NearbyInfra categories={infra} />
            </>
          ) : (
            <div className="rounded-[22px] border border-dashed border-[var(--color-line)] bg-white p-8 text-center text-sm text-[var(--color-muted)]">
              위치 정보가 없어 주변 실거래가·편의시설 정보를 제공하지 않습니다.
            </div>
          )}
          <BoardBriefingSection />
          <MainSourceBlock id={subscriptionSource(notice.category)} />
        </main>
        <aside className="min-w-0">
          <SubscriptionSidebar notice={notice} />
        </aside>
      </div>
    </div>
  );
}
