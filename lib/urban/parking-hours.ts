const HHMM = /^([01]\d|2[0-4])([0-5]\d)$/;

function parse(hhmm: string | null | undefined): { h: number; m: number } | null {
  if (!hhmm) return null;
  // 데이터는 "HH:MM"(콜론) 또는 "HHMM"(4자리)으로 들어올 수 있다
  const m = HHMM.exec(hhmm.replace(':', ''));
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
  if (isOpen24(open, close)) return '24시간 운영';
  if (o.h === c.h && o.m === c.m) return null; // 00:00~00:00 등 동일 시각 = 운영 안 함
  return `${pad(o.h)}:${pad(o.m)} ~ ${pad(c.h)}:${pad(c.m)}`;
}

export function isOpen24(open: string | null, close: string | null): boolean {
  if (!open || !close) return false;
  // 종일 개방은 "00:00"~"23:59"(콜론) 또는 "0000"~"2400"(4자리)로 저장될 수 있다
  const o = open.replace(':', '');
  const c = close.replace(':', '');
  return o === '0000' && (c === '2400' || c === '2359');
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
