import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: true,
  trimValues: true,
});

export function parseXml(xml: string): Record<string, unknown> {
  return parser.parse(xml) as Record<string, unknown>;
}

export function getItems(parsed: Record<string, unknown>): Record<string, unknown>[] {
  const items = (parsed as any)?.response?.body?.items;
  if (!items) return [];
  if (items === '') return [];
  const item = (items as any).item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

export function getTotalCount(parsed: Record<string, unknown>): number {
  const v = (parsed as any)?.response?.body?.totalCount;
  return typeof v === 'number' ? v : Number(v ?? 0);
}

export function parseCommaNumber(v: string | number | undefined | null): number | null {
  if (v === undefined || v === null || v === '') return null;
  const cleaned = String(v).replace(/,/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseYmd(year: unknown, month: unknown, day: unknown): Date | null {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}
