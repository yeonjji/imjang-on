import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { SITE_URL } from '@/lib/site';
import { getAllSigungus } from '@/lib/region';
import { AMENITY_CATEGORIES, AMENITY_SLUGS } from '@/lib/amenity/category';
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

/** core: 정적 + region/school/amenity 허브 동적 엔트리. DB 오류 시 STATIC_ENTRIES로 폴백. */
async function coreEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const [sigungus, schoolSigungus, amenityCountsBySlug] = await Promise.all([
      prisma.region.findMany({
        where: { level: 2, isAbolished: false },
        select: { code: true },
      }),
      getAllSigungus().catch(() => []),
      Promise.all(
        AMENITY_SLUGS.map(async (slug) => ({
          slug,
          counts: await AMENITY_CATEGORIES[slug]
            .getCountsBySigungu()
            .catch(() => new Map<string, number>()),
        })),
      ),
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
    for (const { slug, counts } of amenityCountsBySlug) {
      for (const [sigunguCode, count] of counts) {
        if (count <= 0) continue;
        entries.push({
          url: `${SITE_URL}/amenity/${slug}?region=${sigunguCode}`,
          changeFrequency: 'weekly',
          priority: 0.6,
        });
      }
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
  count: () => prisma.property.count({ where: { txCount12m: { gt: 0 } } }),
  findMany: (skip, take) =>
    prisma.property.findMany({
      where: { txCount12m: { gt: 0 } },
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

const subscription = dbSource({
  key: 'subscription',
  count: () => prisma.subscriptionNotice.count(),
  findMany: (skip, take) =>
    prisma.subscriptionNotice.findMany({
      select: { id: true, updatedAt: true } as Prisma.SubscriptionNoticeSelect,
      orderBy: { id: 'asc' },
      skip,
      take,
    }),
  toEntry: (s) => ({
    url: `${SITE_URL}/subscription/${s.id}`,
    lastModified: s.updatedAt,
    changeFrequency: 'daily',
    priority: 0.7,
  }),
});

// School/Hospital/Pharmacy: sigunguCode nullable → count·findMany 모두 not-null 필터로 일치시킨다.
const school = dbSource({
  key: 'school',
  count: () => prisma.school.count({ where: { sigunguCode: { not: null } } }),
  findMany: (skip, take) =>
    prisma.school.findMany({
      where: { sigunguCode: { not: null } },
      select: { id: true, sigunguCode: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip,
      take,
    }),
  toEntry: (s) => ({
    url: `${SITE_URL}/school/${s.sigunguCode!}/${s.id}`,
    lastModified: s.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }),
});

const childcare = dbSource({
  key: 'childcare',
  count: () => prisma.childcare.count(),
  findMany: (skip, take) =>
    prisma.childcare.findMany({
      select: { id: true, sigunguCode: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip,
      take,
    }),
  toEntry: (c) => ({
    url: `${SITE_URL}/childcare/${c.sigunguCode}/${c.id}`,
    lastModified: c.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }),
});

const pharmacy = dbSource({
  key: 'pharmacy',
  count: () => prisma.pharmacy.count({ where: { sigunguCode: { not: null } } }),
  findMany: (skip, take) =>
    prisma.pharmacy.findMany({
      where: { sigunguCode: { not: null } },
      select: { id: true, sigunguCode: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip,
      take,
    }),
  toEntry: (p) => ({
    url: `${SITE_URL}/medical/pharmacy/${p.sigunguCode!}/${p.id}`,
    lastModified: p.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }),
});

const hospital = dbSource({
  key: 'hospital',
  count: () => prisma.hospital.count({ where: { sigunguCode: { not: null } } }),
  findMany: (skip, take) =>
    prisma.hospital.findMany({
      where: { sigunguCode: { not: null } },
      select: { id: true, sigunguCode: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip,
      take,
    }),
  toEntry: (h) => ({
    url: `${SITE_URL}/medical/hospital/${h.sigunguCode!}/${h.id}`,
    lastModified: h.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }),
});

const loan = dbSource({
  key: 'loan',
  count: () => prisma.loanProduct.count(),
  findMany: (skip, take) =>
    prisma.loanProduct.findMany({
      select: { seq: true, updatedAt: true },
      orderBy: { seq: 'asc' },
      skip,
      take,
    }),
  toEntry: (l) => ({
    url: `${SITE_URL}/finance/${l.seq}`,
    lastModified: l.updatedAt,
    changeFrequency: 'monthly',
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

const jeonseGuarantee = dbSource({
  key: 'jeonse-guarantee',
  count: () => prisma.jeonseGuaranteeProduct.count(),
  findMany: (skip, take) =>
    prisma.jeonseGuaranteeProduct.findMany({
      select: { grntDvcd: true, updatedAt: true },
      orderBy: { grntDvcd: 'asc' },
      skip,
      take,
    }),
  toEntry: (j) => ({
    url: `${SITE_URL}/jeonse-guarantee/${j.grntDvcd}`,
    lastModified: j.updatedAt,
    changeFrequency: 'monthly',
    priority: 0.6,
  }),
});

const guide = dbSource({
  key: 'guide',
  count: () => prisma.guide.count({ where: { status: 'PUBLISHED' } }),
  findMany: (skip, take) =>
    prisma.guide.findMany({
      where: { status: 'PUBLISHED' },
      select: { slug: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip,
      take,
    }),
  toEntry: (g) => ({
    url: `${SITE_URL}/guide/${g.slug}`,
    lastModified: g.updatedAt,
    changeFrequency: 'monthly',
    priority: 0.6,
  }),
});

/** 샤드 id 부여 순서(고정). 변경 시 기존 인덱스 매핑이 바뀌므로 끝에만 추가할 것. */
export const SOURCE_ORDER: SitemapSource[] = [
  core,
  property,
  subscription,
  school,
  childcare,
  pharmacy,
  hospital,
  loan,
  // 게시판 비공개 동안 사이트맵에서도 제외(끝 항목이라 다른 샤드 인덱스 불변).
  ...(isBoardPublic() ? [post] : []),
  jeonseGuarantee, // 끝에 추가 — 기존 샤드 인덱스(core..post) 불변
  guide,           // 끝에 추가 — 기존 샤드 인덱스 불변
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
