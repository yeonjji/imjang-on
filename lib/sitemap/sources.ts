import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { SITE_URL } from '@/lib/site';
import { getSigunguList } from '@/lib/region';
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
    const [schoolSigungus, amenityCountsBySlug] = await Promise.all([
      getSigunguList().catch(() => []),
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

    // getSigunguList는 sigunguCode(시군구 정체성) 단위로 이미 접힌 목록이라 세종(36110)도 1건이다.
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

// 색인 위생: 상세는 narrative.fired≥3(SALE 기반 trend/peer 필수)일 때만 index되므로,
// 매매 이력이 전혀 없는(전세·월세만) 매물은 항상 noindex다. saleLastAt not null(매매 ≥1건)을
// 함께 요구해 그런 매물을 사이트맵에서 빼, 'Submitted URL marked noindex' 경고·크롤 예산 낭비를
// 줄인다(제거 대상은 모두 noindex라 false-negative 없음). count·findMany 동일 조건으로 샤드 정합. (AdSense P2-A)
const PROPERTY_INDEXABLE: Prisma.PropertyWhereInput = {
  txCount12m: { gt: 0 },
  saleLastAt: { not: null },
};

// property 상세 색인 게이트(fired≥3)는 nearby(입지)·지역통계(peer) 의존이라 Property 컬럼만으로
// hard-0 부분집합을 만들 수 없다. 이번 마감은 noindex 0건 우선 → property 상세를 sitemap에서 제외한다
// (허브는 core에 유지). SOURCE_ORDER 슬롯·findMany는 보존해, 향후 사전계산 indexable 플래그로
// 복원 시 count를 prisma.property.count({ where: PROPERTY_INDEXABLE })로 되돌리면 된다.
const property = dbSource({
  key: 'property',
  count: async () => 0,
  findMany: (skip, take) =>
    prisma.property.findMany({
      where: PROPERTY_INDEXABLE,
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

// 색인 게이트: 공급 정보(주택형별 units 또는 총공급)가 있는 공고만 사이트맵에 등재한다.
// subscription/[id] page.tsx의 indexable 조건과 일치시켜 noindex ↔ sitemap 등재 모순을 방지. (AdSense P0-A)
const SUBSCRIPTION_INDEXABLE: Prisma.SubscriptionNoticeWhereInput = {
  OR: [{ totalSupply: { not: null } }, { units: { some: {} } }],
};

const subscription = dbSource({
  key: 'subscription',
  count: () => prisma.subscriptionNotice.count({ where: SUBSCRIPTION_INDEXABLE }),
  findMany: (skip, take) =>
    prisma.subscriptionNotice.findMany({
      where: SUBSCRIPTION_INDEXABLE,
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
// school 상세 색인 게이트는 district(인근 학교 밀도, 공간)·입지 의존이라 컬럼만으로 부분집합 불가.
// noindex 0건 우선 → school 상세 제외(허브 /school/{sigunguCode}는 core에 유지). 복원 시 count를
// prisma.school.count({ where: { sigunguCode: { not: null } } })로 되돌린다.
const school = dbSource({
  key: 'school',
  count: async () => 0,
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

// 색인 게이트의 확정 부분집합: intro(capacity)+occupancy(capacity·currentCount)+facility(roomSize·cctv)
// = 3발화, occupancy∈requireKeys. ratio(emRoleTeacher)와 무관해 childcare 프로즈 변경 영향 없음.
// count·findMany 동일 WHERE로 샤드 정합. (tests/lib/sitemap-indexable.test.ts가 부분집합 증명)
const CHILDCARE_SITEMAP_INDEXABLE: Prisma.ChildcareWhereInput = {
  capacity: { gte: 1 },
  currentCount: { gte: 1 },
  roomSize: { not: null },
  cctvCount: { gte: 1 },
};

const childcare = dbSource({
  key: 'childcare',
  count: () => prisma.childcare.count({ where: CHILDCARE_SITEMAP_INDEXABLE }),
  findMany: (skip, take) =>
    prisma.childcare.findMany({
      where: CHILDCARE_SITEMAP_INDEXABLE,
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
  // 약국 상세는 noindex(색인 배제)이므로 sitemap에서도 제외한다 — count 0이면 buildManifest가
  // 샤드를 만들지 않아 인덱스에서 완전히 빠진다(약국 noindex ↔ sitemap 등재 모순 해소).
  // SOURCE_ORDER 슬롯은 그대로 두어 뒤 소스 키 순서를 보존한다. 색인 재개 시 아래 count를
  // 원래 쿼리 `() => prisma.pharmacy.count({ where: { sigunguCode: { not: null } } })`로 되돌리면 된다.
  // (docs/adsense/approval-strategy-2026-07-08.md P0-A)
  count: async () => 0,
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

// 색인 게이트의 확정 부분집합: intro(typeName non-null → 항상)+doctors(totalDoctors≥1)
// +depts(전문의 배치 진료과 존재 ⇒ deptWithSpecialistCount>0) = 3발화, requireKeys(depts·doctors) 충족.
const HOSPITAL_SITEMAP_INDEXABLE: Prisma.HospitalWhereInput = {
  sigunguCode: { not: null },
  totalDoctors: { gte: 1 },
  depts: { some: { specialistCount: { gt: 0 } } },
};

const hospital = dbSource({
  key: 'hospital',
  count: () => prisma.hospital.count({ where: HOSPITAL_SITEMAP_INDEXABLE }),
  findMany: (skip, take) =>
    prisma.hospital.findMany({
      where: HOSPITAL_SITEMAP_INDEXABLE,
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
