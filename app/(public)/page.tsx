import { MainSearchFilter } from './_components/main-search-filter';
import { TypeHub } from './_components/type-hub';
import { getSidoList } from '@/lib/region';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '전국 아파트·오피스텔·연립다세대 실거래가',
  description: '공공데이터 기반 전국 부동산 실거래가 통합 정보 플랫폼. 매매·전세·월세를 단지 단위로 한눈에.',
};

export const revalidate = 3600;

export default async function HomePage() {
  const sidoList = await getSidoList();

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <div className="flex flex-col gap-6 md:flex-row md:items-stretch">
        <div className="min-w-0 flex-1">
          <MainSearchFilter sidoList={sidoList} />
        </div>
        <aside className="w-full md:w-[300px] md:shrink-0">
          <TypeHub />
        </aside>
      </div>
    </section>
  );
}
