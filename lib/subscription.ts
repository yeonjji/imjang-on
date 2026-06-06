import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { SubscriptionCategory } from '@prisma/client';
import type { SubscriptionNotice, SubscriptionUnit } from '@prisma/client';
import { formatBillion, formatPyeong } from '@/lib/format';

// ---- 카테고리 ----
export interface CategoryMeta {
  slug: string;
  category: SubscriptionCategory;
  label: string;
}

export const SUBSCRIPTION_CATEGORIES: CategoryMeta[] = [
  { slug: 'apt', category: 'APT', label: '아파트' },
  { slug: 'urbty', category: 'OFFICETEL_ETC', label: '오피스텔·도시형' },
  { slug: 'remndr', category: 'REMNANT', label: '무순위·잔여' },
  { slug: 'pblpvt', category: 'PUB_PRIV_RENT', label: '공공·민간임대' },
  { slug: 'opt', category: 'ARBITRARY', label: '임의공급' },
  { slug: 'lh', category: 'LH_PRESUB', label: 'LH 사전청약' },
];

const CATEGORY_BY_SLUG = new Map(SUBSCRIPTION_CATEGORIES.map((c) => [c.slug, c.category]));
const LABEL_BY_CATEGORY = new Map(SUBSCRIPTION_CATEGORIES.map((c) => [c.category, c.label]));

export function categoryLabel(category: SubscriptionCategory): string {
  return LABEL_BY_CATEGORY.get(category) ?? category;
}

export function slugsToCategories(slugs: string[]): SubscriptionCategory[] {
  return slugs
    .map((s) => CATEGORY_BY_SLUG.get(s))
    .filter((c): c is SubscriptionCategory => c !== undefined);
}

// ---- 상태 도출 ----
export type SubscriptionStatus = 'OPEN' | 'UPCOMING' | 'CLOSED';

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  OPEN: '접수중',
  UPCOMING: '예정',
  CLOSED: '마감',
};

export const STATUS_TONE: Record<SubscriptionStatus, 'green' | 'blue' | 'gray'> = {
  OPEN: 'green',
  UPCOMING: 'blue',
  CLOSED: 'gray',
};

function dateInt(d: Date): number {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

function dayDiff(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}

export interface DerivedStatus {
  status: SubscriptionStatus;
  /** OPEN: 마감까지 남은 일수, UPCOMING: 시작까지 남은 일수, CLOSED: null */
  dday: number | null;
}

export function deriveStatus(
  receiptBegin: Date | null,
  receiptEnd: Date | null,
  today: Date = new Date(),
): DerivedStatus {
  const t = dateInt(today);
  if (receiptBegin && dateInt(receiptBegin) > t) {
    return { status: 'UPCOMING', dday: dayDiff(today, receiptBegin) };
  }
  if (receiptEnd && dateInt(receiptEnd) >= t && (!receiptBegin || dateInt(receiptBegin) <= t)) {
    return { status: 'OPEN', dday: dayDiff(today, receiptEnd) };
  }
  return { status: 'CLOSED', dday: null };
}

export function ddayLabel(d: DerivedStatus): string | null {
  if (d.dday == null) return null;
  if (d.status === 'OPEN') return d.dday === 0 ? '오늘 마감' : `D-${d.dday}`;
  if (d.status === 'UPCOMING') return d.dday === 0 ? '오늘 시작' : `${d.dday}일 후`;
  return null;
}

// ---- 카드 집계 포맷 ----
export function formatPriceRange(min: number | null, max: number | null): string {
  if (min == null || max == null) return '-';
  return min === max ? formatBillion(min) : `${formatBillion(min)}~${formatBillion(max)}`;
}

export function formatAreaRange(min: number | null, max: number | null): string {
  if (min == null || max == null) return '-';
  const a = formatPyeong(min);
  const b = formatPyeong(max);
  return a === b ? a : `${a}~${b}`;
}

// ---- 조회 ----
export interface SubscriptionListItem {
  id: string;
  name: string;
  category: SubscriptionCategory;
  regionName: string | null;
  receiptBegin: Date | null;
  receiptEnd: Date | null;
  totalSupply: number | null;
  unitCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  minArea: number | null;
  maxArea: number | null;
}

export interface SubscriptionListResult {
  rows: SubscriptionListItem[];
  total: number;
  totalPages: number;
  page: number;
  perPage: number;
}

interface ListRow {
  id: bigint;
  name: string;
  category: SubscriptionCategory;
  region_name: string | null;
  receipt_begin: Date | null;
  receipt_end: Date | null;
  total_supply: number | null;
  unit_count: number;
  min_price: number | null;
  max_price: number | null;
  min_area: number | null;
  max_area: number | null;
}

function mapListRow(r: ListRow): SubscriptionListItem {
  return {
    id: String(r.id),
    name: r.name,
    category: r.category,
    regionName: r.region_name,
    receiptBegin: r.receipt_begin,
    receiptEnd: r.receipt_end,
    totalSupply: r.total_supply,
    unitCount: r.unit_count,
    minPrice: r.min_price,
    maxPrice: r.max_price,
    minArea: r.min_area,
    maxArea: r.max_area,
  };
}

export async function getSubscriptionList(opts: {
  categories?: SubscriptionCategory[];
  sido?: string;
  status?: SubscriptionStatus;
  sort?: 'recent' | 'notice';
  page?: number;
  perPage?: number;
}): Promise<SubscriptionListResult> {
  const { categories, sido, status, sort = 'recent', page = 1, perPage = 20 } = opts;
  const offset = (page - 1) * perPage;

  const where = Prisma.sql`
    WHERE 1 = 1
    ${
      categories && categories.length > 0
        ? Prisma.sql`AND n.category IN (${Prisma.join(
            categories.map((c) => Prisma.sql`${c}::"SubscriptionCategory"`),
          )})`
        : Prisma.empty
    }
    ${sido ? Prisma.sql`AND n."regionName" = ${sido}` : Prisma.empty}
    ${
      status === 'OPEN'
        ? Prisma.sql`AND (n."receiptBegin" IS NULL OR n."receiptBegin" <= CURRENT_DATE) AND n."receiptEnd" >= CURRENT_DATE`
        : Prisma.empty
    }
    ${status === 'UPCOMING' ? Prisma.sql`AND n."receiptBegin" > CURRENT_DATE` : Prisma.empty}
    ${
      status === 'CLOSED'
        ? Prisma.sql`AND (n."receiptBegin" IS NULL OR n."receiptBegin" <= CURRENT_DATE) AND (n."receiptEnd" < CURRENT_DATE OR n."receiptEnd" IS NULL)`
        : Prisma.empty
    }
  `;

  const orderBy =
    sort === 'notice'
      ? Prisma.sql`ORDER BY n."noticeDate" DESC NULLS LAST, n.id DESC`
      : Prisma.sql`ORDER BY n."receiptEnd" DESC NULLS LAST, n."noticeDate" DESC NULLS LAST, n.id DESC`;

  const rows = await prisma.$queryRaw<ListRow[]>(Prisma.sql`
    SELECT
      n.id, n.name, n.category,
      n."regionName" AS region_name,
      n."receiptBegin" AS receipt_begin,
      n."receiptEnd" AS receipt_end,
      n."totalSupply" AS total_supply,
      COUNT(u.id)::int AS unit_count,
      MIN(u."topAmount")::int AS min_price,
      MAX(u."topAmount")::int AS max_price,
      MIN(u.area)::float AS min_area,
      MAX(u.area)::float AS max_area
    FROM "SubscriptionNotice" n
    LEFT JOIN "SubscriptionUnit" u ON u."noticeId" = n.id
    ${where}
    GROUP BY n.id
    ${orderBy}
    LIMIT ${perPage} OFFSET ${offset}
  `);

  const totalRows = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS count FROM "SubscriptionNotice" n ${where}
  `);
  const total = totalRows[0]?.count ?? 0;

  return {
    rows: rows.map(mapListRow),
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    page,
    perPage,
  };
}

export type SubscriptionDetail = SubscriptionNotice & { units: SubscriptionUnit[] };

// ---- 주간 보드 타입 ----
export type BoardTone = 'green' | 'blue' | 'gray' | 'orange';

export interface WeeklyNoticeRow {
  id: bigint;
  name: string;
  regionName: string | null;
  address: string | null;
  receiptBegin: Date | null;
  receiptEnd: Date | null;
}

export interface WeeklyBoardItem {
  id: string;
  name: string;
  regionShort: string | null;
  tone: BoardTone;
  badge: string;
}

export interface WeeklyBoardDay {
  date: Date;
  weekday: string;
  isToday: boolean;
  items: WeeklyBoardItem[];
  overflow: number;
}

export interface WeeklyBoard {
  weekStart: Date;
  weekEnd: Date;
  days: WeeklyBoardDay[];
  summary: { open: number; upcoming: number; closed: number };
  total: number;
}

export interface WeekRange {
  weekStart: Date;
  weekEnd: Date;
  dates: Date[];
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function getWeekRange(today: Date): WeekRange {
  const base = utcMidnight(today);
  const offsetToMonday = (base.getUTCDay() + 6) % 7;
  const weekStart = new Date(base);
  weekStart.setUTCDate(base.getUTCDate() - offsetToMonday);
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setUTCDate(weekStart.getUTCDate() + i);
    return d;
  });
  return { weekStart: dates[0], weekEnd: dates[6], dates };
}

export async function getSubscriptionById(id: bigint): Promise<SubscriptionDetail | null> {
  return prisma.subscriptionNotice.findUnique({
    where: { id },
    include: { units: { orderBy: [{ area: 'asc' }, { id: 'asc' }] } },
  });
}

export async function getSubscriptionLatLng(
  id: bigint,
): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "SubscriptionNotice"
    WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

export interface NearbySubscriptionsResult {
  items: SubscriptionListItem[];
  scopeLabel: string;
}

/**
 * 같은 구/군(부족 시 시·도)에서 진행 중·예정 우선, 그다음 최근 마감순으로 청약을 조회.
 * @param sido    단축 시도 (예: "서울") — SubscriptionNotice.regionName과 동일 표기
 * @param sigungu 구/군 (예: "강서구"). null이면 곧바로 시·도 범위로 조회
 */
export async function getNearbySubscriptions(opts: {
  sido: string;
  sigungu: string | null;
  limit?: number;
}): Promise<NearbySubscriptionsResult> {
  const { sido, sigungu, limit = 3 } = opts;

  const run = async (extraWhere: Prisma.Sql): Promise<SubscriptionListItem[]> => {
    const rows = await prisma.$queryRaw<ListRow[]>(Prisma.sql`
      SELECT
        n.id, n.name, n.category,
        n."regionName" AS region_name,
        n."receiptBegin" AS receipt_begin,
        n."receiptEnd" AS receipt_end,
        n."totalSupply" AS total_supply,
        COUNT(u.id)::int AS unit_count,
        MIN(u."topAmount")::int AS min_price,
        MAX(u."topAmount")::int AS max_price,
        MIN(u.area)::float AS min_area,
        MAX(u.area)::float AS max_area
      FROM "SubscriptionNotice" n
      LEFT JOIN "SubscriptionUnit" u ON u."noticeId" = n.id
      WHERE n."regionName" = ${sido}
      ${extraWhere}
      GROUP BY n.id
      ORDER BY (CASE WHEN n."receiptBegin" > CURRENT_DATE OR n."receiptEnd" >= CURRENT_DATE THEN 0 ELSE 1 END),
               n."receiptEnd" DESC NULLS LAST,
               n.id DESC
      LIMIT ${limit}
    `);
    return rows.map(mapListRow);
  };

  // LH 사전청약 공고는 address가 null이라 구/군 매칭에서 빠지고 시·도 폴백으로만 잡힌다.
  if (sigungu) {
    const items = await run(
      Prisma.sql`AND (n.address ILIKE ${`% ${sigungu} %`} OR n.address ILIKE ${`% ${sigungu}`})`,
    );
    if (items.length > 0) return { items, scopeLabel: sigungu };
  }

  const items = await run(Prisma.empty);
  return { items, scopeLabel: sido };
}
