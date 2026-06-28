import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';
import { SITE_URL } from '@/lib/site';
import { getAllSigungus } from '@/lib/region';
import { MIN_INDEXABLE_TX } from '@/lib/property';
import { STATIC_ENTRIES } from './static-entries';
import { isBoardPublic } from '@/lib/board/visibility';
import { boardPath } from '@/lib/board/slug';

export const CHUNK_SIZE = 10_000;

export interface SitemapSource {
  key: string;
  count: () => Promise<number>;
  page: (offset: number, limit: number) => Promise<MetadataRoute.Sitemap>;
}

/** Property.propertyType → URL prefix */
function propertyPrefix(type: string): string {
  if (type === 'APARTMENT') return 'apt';
  if (type === 'OFFICETEL') return 'officetel';
  return 'villa';
}

/**
 * core: 정적 + region/school 허브 동적 엔트리. DB 오류 시 STATIC_ENTRIES로 폴백.
 *
 * (2026-06-28: AdSense thin-content 대응 — amenity?region 디렉터리 격자는 색인 제외(noindex)로
 * 전환했으므로 사이트맵에서도 제거. POI/청약/금융 상세 소스도 SOURCE_ORDER에서 제외.
 * docs/adsense/thin-content-diagnosis.md 참고.)
 */
async function coreEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const [sigungus, schoolSigungus] = await Promise.all([
      prisma.region.findMany({
        where: { level: 2, isAbolished: false },
        select: { code: true },
      }),
      getAllSigungus().catch(() => []),
    ]);

    const entries: MetadataRoute.Sitemap = [...STATIC_ENTRIES];

    for (const r of sigungus) {
      entries.push({
        url: `${SITE_URL}/region/${r.code.slice(0, 5)}`,
        changeFrequency: 'daily',
        priority: 0.7,
      });
    }
    for (const s of schoolSigungus) {
      entries.push({
        url: `${SITE_URL}/school/${s.sigunguCode}`,
        changeFrequency: 'weekly',
        priority: 0.7,
      });
    }
    return entries;
  } catch (err) {
    console.error('sitemap core: DB unavailable, static entries only', err);
    return STATIC_ENTRIES;
  }
}

/** DB 페이지네이션 소스 공통 헬퍼. page()는 오류 시 [] 반환. */
function dbSource<T>(opts: {
  key: string;
  count: () => Promise<number>;
  findMany: (skip: number, take: number) => Promise<T[]>;
  toEntry: (row: T) => MetadataRoute.Sitemap[number];
}): SitemapSource {
  return {
    key: opts.key,
    count: opts.count,
    page: async (offset, limit) => {
      try {
        const rows = await opts.findMany(offset, limit);
        return rows.map(opts.toEntry);
      } catch (err) {
        console.error(`sitemap ${opts.key}: page query failed`, err);
        return [];
      }
    },
  };
}

const core: SitemapSource = {
  key: 'core',
  count: async () => (await coreEntries()).length,
  page: async (offset, limit) => (await coreEntries()).slice(offset, offset + limit),
};

const property = dbSource({
  key: 'property',
  count: () => prisma.property.count({ where: { txCount12m: { gte: MIN_INDEXABLE_TX } } }),
  findMany: (skip, take) =>
    prisma.property.findMany({
      where: { txCount12m: { gte: MIN_INDEXABLE_TX } },
      select: { id: true, propertyType: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip,
      take,
    }),
  toEntry: (p) => ({
    url: `${SITE_URL}/${propertyPrefix(p.propertyType)}/${p.id}`,
    lastModified: p.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }),
});

const post = dbSource({
  key: 'post',
  count: () => prisma.post.count({ where: { status: 'PUBLISHED' } }),
  findMany: (skip, take) =>
    prisma.post.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip,
      take,
    }),
  toEntry: (p) => ({
    url: `${SITE_URL}${boardPath(p.id)}`,
    lastModified: p.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }),
});

/**
 * 샤드 id 부여 순서(고정). 변경 시 기존 인덱스 매핑이 바뀌므로 끝에만 추가할 것.
 *
 * 색인 대상만 포함한다. POI 상세(병원·약국·어린이집·학교 상세)·청약·금융·전세보증 상세는
 * 고유 서술이 없어 page 메타에서 noindex 처리했고, 사이트맵에서도 제외한다.
 */
export const SOURCE_ORDER: SitemapSource[] = [
  core,
  property,
  // 게시판 비공개 동안 사이트맵에서도 제외(끝 항목이라 다른 샤드 인덱스 불변).
  ...(isBoardPublic() ? [post] : []),
];

export const SOURCE_MAP: Record<string, SitemapSource> = Object.fromEntries(
  SOURCE_ORDER.map((s) => [s.key, s]),
);

/** 모든 소스의 count를 SOURCE_ORDER 순서로 조회한다. 개별 소스 count 실패 시 0으로 격리(전체 500 방지). */
export async function loadCounts() {
  return Promise.all(
    SOURCE_ORDER.map(async (s) => {
      try {
        return { key: s.key, count: await s.count() };
      } catch (err) {
        console.error(`sitemap ${s.key}: count failed`, err);
        return { key: s.key, count: 0 };
      }
    }),
  );
}
