const HHMM = /^([01]\d|2[0-4])([0-5]\d)$/;

function parse(hhmm: string | null | undefined): { h: number; m: number } | null {
  if (!hhmm) return null;
  const m = HHMM.exec(hhmm);
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function formatHourRange(open: string | null, close: string | null): string | null {
  const o = parse(open);
  const c = parse(close);
  if (!o || !c) return null;
  if (open === '0000' && close === '2400') return '24시간 운영';
  return `${pad(o.h)}:${pad(o.m)} ~ ${pad(c.h)}:${pad(c.m)}`;
}

export function isOpen24(open: string | null, close: string | null): boolean {
  return open === '0000' && close === '2400';
}

export interface HourBlocks {
  weekdayOpen: string | null;
  weekdayClose: string | null;
  satOpen: string | null;
  satClose: string | null;
  holidayOpen: string | null;
  holidayClose: string | null;
}

export function isAllDayOpen24(b: HourBlocks): boolean {
  return isOpen24(b.weekdayOpen, b.weekdayClose)
    && isOpen24(b.satOpen, b.satClose)
    && isOpen24(b.holidayOpen, b.holidayClose);
}

export function hasAnyHours(b: HourBlocks): boolean {
  return Object.values(b).some((v) => v !== null && v !== '');
}
