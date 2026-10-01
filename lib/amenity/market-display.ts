// 전통시장 원문 필드(개설 주기·취급 품목·개설 연도)를 화면 문구로 바꾸는 순수 함수.
// "다음 장날"은 만들지 않는다 — 상세는 ISR 24시간 캐시라 지난 날짜가 보일 수 있다.

export type MarketDays =
  | { kind: 'daily' }
  | { kind: 'monthly'; cycle: number[]; days: number[] }
  | { kind: 'raw'; text: string };

/** '4일+9일'처럼 1~10일로 이뤄진 오일장 주기만 날짜로 펼친다. 그 외 형식은 원문 유지. */
export function parseMarketDays(openCycle: string | null | undefined): MarketDays | null {
  const raw = (openCycle ?? '').trim();
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, '');
  if (compact === '매일') return { kind: 'daily' };
  if (!/^\d{1,2}일(\+\d{1,2}일)*$/.test(compact)) return { kind: 'raw', text: raw };
  const cycle = Array.from(new Set(compact.split('+').map((t) => Number(t.replace('일', ''))))).sort(
    (a, b) => a - b,
  );
  if (cycle.some((n) => n < 1 || n > 10)) return { kind: 'raw', text: raw };
  const digits = cycle.map((n) => n % 10);
  const days: number[] = [];
  for (let d = 1; d <= 31; d++) if (digits.includes(d % 10)) days.push(d);
  return { kind: 'monthly', cycle, days };
}

export function marketDaysShort(d: MarketDays): string {
  if (d.kind === 'daily') return '매일';
  if (d.kind === 'monthly') return `${d.cycle.join('·')}일장`;
  return d.text;
}

export function marketDaysLong(d: MarketDays): string {
  if (d.kind === 'daily') return '매일 개장';
  if (d.kind === 'monthly') return `매월 ${d.days.join('·')}일`;
  return d.text;
}

export function splitProducts(products: string | null | undefined): string[] {
  if (!products) return [];
  const parts = products.split('+').map((s) => s.trim()).filter(Boolean);
  return Array.from(new Set(parts));
}

export function marketAgeYears(year: number | null | undefined, nowYear: number): number | null {
  if (year == null || year > nowYear) return null;
  return nowYear - year;
}

export function buildMarketHeroLine(m: {
  establishedYear?: number | null;
  storeCount?: number | null;
  openCycle?: string | null;
}): string | null {
  const parts: string[] = [];
  if (m.establishedYear) parts.push(`${m.establishedYear}년 개설`);
  if (m.storeCount) parts.push(`점포 ${m.storeCount.toLocaleString('ko-KR')}곳`);
  const days = parseMarketDays(m.openCycle);
  if (days?.kind === 'monthly') parts.push(`${days.cycle.join('·')}일 장날`);
  if (days?.kind === 'daily') parts.push('매일 개장');
  return parts.length ? parts.join(' · ') : null;
}
