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

  // 기본(마감임박순): 진행중·예정 공고를 마감일 가까운 순으로 먼저, 마감된 공고는 최근 마감순으로 뒤에.
  const orderBy =
    sort === 'notice'
      ? Prisma.sql`ORDER BY n."noticeDate" DESC NULLS LAST, n.id DESC`
      : Prisma.sql`
          ORDER BY
            (CASE WHEN n."receiptEnd" >= CURRENT_DATE OR n."receiptBegin" > CURRENT_DATE THEN 0 ELSE 1 END),
            CASE WHEN n."receiptEnd" >= CURRENT_DATE OR n."receiptBegin" > CURRENT_DATE THEN n."receiptEnd" END ASC NULLS LAST,
            n."receiptEnd" DESC NULLS LAST,
            n.id DESC
        `;

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
  const weekStart = new Date(base);
  weekStart.setUTCDate(base.getUTCDate() - 3);
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setUTCDate(weekStart.getUTCDate() + i);
    return d;
  });
  return { weekStart: dates[0], weekEnd: dates[6], dates };
}

export function boardTone(st: DerivedStatus): { tone: BoardTone; badge: string } {
  if (st.status === 'UPCOMING') return { tone: 'blue', badge: '예정' };
  if (st.status === 'CLOSED') return { tone: 'gray', badge: '마감' };
  if (st.dday != null && st.dday <= 1) {
    return { tone: 'orange', badge: ddayLabel(st) ?? '진행중' };
  }
  return { tone: 'green', badge: '진행중' };
}

export function parseSigungu(address: string | null, regionName: string | null): string | null {
  if (address) {
    const tokens = address.match(/[가-힣]+[시군구]/g) ?? [];
    const guGun = tokens.find((t) => t.endsWith('구') || t.endsWith('군'));
    if (guGun) return guGun;
    const si = tokens.find((t) => t.endsWith('시'));
    if (si) return si.replace(/(특별자치시|특별시|광역시)$/, '');
  }
  return regionName ?? null;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const TONE_ORDER: Record<BoardTone, number> = { orange: 0, green: 1, blue: 2, gray: 3 };

function clampToWeek(d: Date, weekStart: Date, weekEnd: Date): Date {
  if (dateInt(d) < dateInt(weekStart)) return weekStart;
  if (dateInt(d) > dateInt(weekEnd)) return weekEnd;
  return d;
}

export function assembleWeeklyBoard(rows: WeeklyNoticeRow[], today: Date = new Date()): WeeklyBoard {
  const { weekStart, weekEnd, dates } = getWeekRange(today);
  const buckets: WeeklyBoardItem[][] = dates.map(() => []);
  const summary = { open: 0, upcoming: 0, closed: 0 };

  for (const r of rows) {
    const st = deriveStatus(r.receiptBegin, r.receiptEnd, today);
    if (st.status === 'OPEN') summary.open++;
    else if (st.status === 'UPCOMING') summary.upcoming++;
    else summary.closed++;

    const anchorRaw = st.status === 'UPCOMING' ? r.receiptBegin : (r.receiptEnd ?? r.receiptBegin);
    if (!anchorRaw) continue;
    const anchor = clampToWeek(anchorRaw, weekStart, weekEnd);
    const idx = dates.findIndex((d) => dateInt(d) === dateInt(anchor));
    if (idx < 0) continue;

    const { tone, badge } = boardTone(st);
    buckets[idx].push({
      id: String(r.id),
      name: r.name,
      regionShort: parseSigungu(r.address, r.regionName),
      tone,
      badge,
    });
  }

  const days: WeeklyBoardDay[] = dates.map((date, i) => {
    const sorted = buckets[i].sort(
      (a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || a.name.localeCompare(b.name, 'ko'),
    );
    return {
      date,
      weekday: WEEKDAYS[date.getUTCDay()],
      isToday: dateInt(date) === dateInt(today),
      items: sorted.slice(0, 3),
      overflow: Math.max(0, sorted.length - 3),
    };
  });

  return { weekStart, weekEnd, days, summary, total: rows.length };
}

/**
 * 주간 보드(일자 버킷)를 컴팩트 리스트로 평탄화한다.
 * 진행중·예정 우선(TONE_ORDER) 정렬 후 id 중복 제거, 상위 limit개.
 */
export function flattenWeeklyBoard(board: WeeklyBoard, limit: number): WeeklyBoardItem[] {
  const seen = new Set<string>();
  const items: WeeklyBoardItem[] = [];
  for (const day of board.days) {
    for (const it of day.items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      items.push(it);
    }
  }
  items.sort(
    (a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || a.name.localeCompare(b.name, 'ko'),
  );
  return items.slice(0, limit);
}

// ---- 홈 주간 모델 (연속 표기) ----
export interface WeekModelDay {
  weekday: string;
  md: string;
  isToday: boolean;
  items: WeeklyBoardItem[];
}

export interface WeekModel {
  summary: { open: number; upcoming: number; closed: number };
  total: number;
  days: WeekModelDay[];
}

function mmdd(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** 특정 셀 날짜 기준의 배지/톤. 셀은 활성 구간 [begin..end] 안에 있다고 가정. */
export function dayBadge(
  begin: Date | null,
  end: Date | null,
  cell: Date,
  today: Date,
): { tone: BoardTone; badge: string } {
  const b = begin ? dateInt(begin) : null;
  const e = end ? dateInt(end) : null;
  const c = dateInt(cell);
  const t = dateInt(today);

  if (b != null && c < b) return { tone: 'blue', badge: '예정' };
  if (b != null && c === b && (e == null || c < e)) return { tone: 'green', badge: '접수시작' };
  if (e != null && c === e) {
    if (c === t) return { tone: 'orange', badge: '오늘 마감' };
    return c < t ? { tone: 'gray', badge: '마감' } : { tone: 'orange', badge: '마감일' };
  }
  if (e != null) {
    const d = dayDiff(cell, end!);
    return d === 1 ? { tone: 'orange', badge: 'D-1' } : { tone: 'green', badge: `D-${d}` };
  }
  return { tone: 'green', badge: '진행중' };
}

export function buildWeekModel(rows: WeeklyNoticeRow[], today: Date = new Date()): WeekModel {
  const { dates } = getWeekRange(today);
  const ws = dateInt(dates[0]);
  const we = dateInt(dates[6]);
  const buckets: WeeklyBoardItem[][] = dates.map(() => []);
  const summary = { open: 0, upcoming: 0, closed: 0 };

  for (const r of rows) {
    const st = deriveStatus(r.receiptBegin, r.receiptEnd, today);
    if (st.status === 'OPEN') summary.open++;
    else if (st.status === 'UPCOMING') summary.upcoming++;
    else summary.closed++;

    const spanBegin = r.receiptBegin ?? r.receiptEnd;
    const spanEnd = r.receiptEnd ?? r.receiptBegin;
    if (!spanBegin || !spanEnd) continue;

    const bi = dateInt(spanBegin);
    const ei = dateInt(spanEnd);
    if (ei < ws || bi > we) continue; // 주간과 겹치지 않음(방어)

    const startIdx = dates.findIndex((d) => dateInt(d) === Math.max(bi, ws));
    const endIdx = dates.findIndex((d) => dateInt(d) === Math.min(ei, we));

    const regionShort = parseSigungu(r.address, r.regionName);

    for (let i = startIdx; i <= endIdx; i++) {
      const cell =
        st.status === 'CLOSED'
          ? ({ tone: 'gray', badge: '마감' } as const)
          : dayBadge(r.receiptBegin, r.receiptEnd, dates[i], today);
      buckets[i].push({ id: String(r.id), name: r.name, regionShort, tone: cell.tone, badge: cell.badge });
    }
  }

  const days: WeekModelDay[] = dates.map((date, i) => ({
    weekday: WEEKDAYS[date.getUTCDay()],
    md: mmdd(date),
    isToday: dateInt(date) === dateInt(today),
    items: buckets[i].sort(
      (a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || a.name.localeCompare(b.name, 'ko'),
    ),
  }));

  return { summary, total: rows.length, days };
}

export async function getWeeklySubscriptions(today: Date = new Date()): Promise<WeeklyBoard> {
  const { weekStart, weekEnd } = getWeekRange(today);
  const rows = await prisma.$queryRaw<
    Array<{
      id: bigint; name: string; region_name: string | null; address: string | null;
      receipt_begin: Date | null; receipt_end: Date | null;
    }>
  >(Prisma.sql`
    SELECT n.id, n.name,
           n."regionName" AS region_name,
           n.address AS address,
           n."receiptBegin" AS receipt_begin,
           n."receiptEnd" AS receipt_end
    FROM "SubscriptionNotice" n
    WHERE (n."receiptBegin" BETWEEN ${weekStart} AND ${weekEnd})
       OR (n."receiptEnd"   BETWEEN ${weekStart} AND ${weekEnd})
    ORDER BY n."receiptEnd" ASC NULLS LAST, n.id ASC
  `);

  const mapped: WeeklyNoticeRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    regionName: r.region_name,
    address: r.address,
    receiptBegin: r.receipt_begin,
    receiptEnd: r.receipt_end,
  }));

  return assembleWeeklyBoard(mapped, today);
}

export async function getHomeWeekBoard(today: Date = new Date()): Promise<WeekModel> {
  const { weekStart, weekEnd } = getWeekRange(today);
  // 구간 겹침: 시작이 주 끝 이전 && 마감이 주 시작 이후 → 주 전체를 관통하는 긴 공고도 포함.
  const rows = await prisma.$queryRaw<
    Array<{
      id: bigint; name: string; region_name: string | null; address: string | null;
      receipt_begin: Date | null; receipt_end: Date | null;
    }>
  >(Prisma.sql`
    SELECT n.id, n.name,
           n."regionName" AS region_name,
           n.address AS address,
           n."receiptBegin" AS receipt_begin,
           n."receiptEnd" AS receipt_end
    FROM "SubscriptionNotice" n
    WHERE COALESCE(n."receiptBegin", n."receiptEnd") <= ${weekEnd}
      AND COALESCE(n."receiptEnd", n."receiptBegin") >= ${weekStart}
    ORDER BY n."receiptEnd" ASC NULLS LAST, n.id ASC
  `);

  const mapped: WeeklyNoticeRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    regionName: r.region_name,
    address: r.address,
    receiptBegin: r.receipt_begin,
    receiptEnd: r.receipt_end,
  }));

  return buildWeekModel(mapped, today);
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
