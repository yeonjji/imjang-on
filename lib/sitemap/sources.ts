import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { SITE_URL } from '@/lib/site';
import { getSigunguList } from '@/lib/region';
import { PROPERTY_INDEXABLE_WHERE } from '@/lib/property';
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

/** core: 정적 + school 시군구 허브 동적 엔트리. DB 오류 시 STATIC_ENTRIES로 폴백. */
async function coreEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const schoolSigungus = await getSigunguList().catch(() => []);

    const entries: MetadataRoute.Sitemap = [...STATIC_ENTRIES];

    // getSigunguList는 sigunguCode(시군구 정체성) 단위로 이미 접힌 목록이라 세종(36110)도 1건이다.
    for (const s of schoolSigungus) {
      entries.push({
        url: `${SITE_URL}/school/${s.sigunguCode}`,
        changeFrequency: 'weekly',
        priority: 0.7,
      });
    }

    // `/amenity/{slug}?region={시군구}` 994건은 제거했다(2026-08-09). 카테고리당 시군구 250개가
    // 같은 템플릿의 근접중복이라 doorway 신호였고, 이제 canonical이 전부 정본 허브 하나로
    // 접히므로 사이트맵에 올리면 'canonical이 다른 URL' 경고만 생긴다.
    // 허브 7개(amenity 4 + urban 3)는 STATIC_ENTRIES가 정본 경로로 담는다.

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

// 매물 사이트맵 복원(2026-08-10). 커밋 29e6fdb가 'Submitted URL marked noindex' 경고를 없애려
// count를 0으로 만든 뒤로, 사이트맵에 부동산 상세가 한 건도 없었다 — 병원 58.5% + 어린이집 31.4%가
// 90%를 차지해 사이트가 스스로 '의료·보육 디렉터리'라고 선언하는 상태였다.
//
// 조건을 페이지 robots와 **같은 함수**(PROPERTY_INDEXABLE_WHERE ↔ isPropertyIndexable)에서 읽어
// 차집합을 원천 차단한다. 종전 게이트(fired≥3)가 nearby·지역통계 의존이라 Property 컬럼만으로
// 재현할 수 없었던 것이 count 0의 실제 이유였고, 새 기준은 Property 컬럼만 쓴다.
const property = dbSource({
  key: 'property',
  count: () => prisma.property.count({ where: PROPERTY_INDEXABLE_WHERE }),
  findMany: (skip, take) =>
    prisma.property.findMany({
      where: PROPERTY_INDEXABLE_WHERE,
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

// D1(2026-08-10): 어린이집 상세는 조회 기능으로 내려 공개 URL에서 제거한다. 라우트 삭제보다
// 사이트맵 제외가 **먼저**여야 한다 — 순서를 뒤집으면 곧 308이 될 URL을 계속 제출하게 된다.
// SOURCE_ORDER 슬롯·findMany·WHERE는 보존한다(pharmacy가 같은 형식의 선례).
const childcare = dbSource({
  key: 'childcare',
  count: async () => 0,
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

// D1(2026-08-10): 병원 상세도 동일. 근거는 위 childcare 주석 참고.
const hospital = dbSource({
  key: 'hospital',
  count: async () => 0,
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
  // property는 앞이 아니라 **끝**이다(2026-08-10). count가 ETL로 매일 움직이는 유일한 소스라,
  // 앞에 두면 그 변동마다 뒤 소스의 샤드 번호가 통째로 재배치돼 GSC 제출분이 매번 어긋난다.
  // 이번에 병원·어린이집 제외로 어차피 전체 재번호가 일어나므로 함께 옮긴다.
  property,
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
