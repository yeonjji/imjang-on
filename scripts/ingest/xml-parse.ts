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
  // API마다 totalCount 위치가 다름 (body 또는 header). body 우선, 없으면 header fallback.
  const root = (parsed as any)?.response;
  const v = root?.body?.totalCount ?? root?.header?.totalCount;
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

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

const NORMAL_CODES = new Set(['00']);

// 공공데이터포털 응답의 에러 코드를 검증한다. 비정상이면 throw하여
// runOne이 해당 run을 ERROR로 마킹 → resume가 다음 패스에서 재시도하도록 한다.
// (정상 0건은 header.resultCode=00 이므로 통과 → 그대로 done 처리됨)
export function assertNormalResponse(parsed: Record<string, unknown>): void {
  const root = parsed as any;

  // 1) 레거시 게이트웨이 에러: <OpenAPI_ServiceResponse><cmmMsgHeader>...
  const cmm = root?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (cmm) {
    const code = cmm.returnReasonCode != null ? String(cmm.returnReasonCode).padStart(2, '0') : '';
    const msg = String(cmm.returnAuthMsg ?? cmm.errMsg ?? '');
    if (code === '22' || /LIMITED_NUMBER_OF_SERVICE_REQUESTS/i.test(msg)) {
      throw new QuotaExceededError(`API quota exceeded (returnReasonCode=${code}, ${msg})`);
    }
    throw new Error(`API gateway error (returnReasonCode=${code}, ${msg})`);
  }

  // 2) 표준 응답: <response><header><resultCode>...
  const header = root?.response?.header;
  if (header && header.resultCode != null) {
    const code = String(header.resultCode).padStart(2, '0');
    if (!NORMAL_CODES.has(code)) {
      const msg = String(header.resultMsg ?? '');
      if (code === '22') {
        throw new QuotaExceededError(`API quota exceeded (resultCode=${code}, ${msg})`);
      }
      throw new Error(`API error (resultCode=${code}, ${msg})`);
    }
  }
}
