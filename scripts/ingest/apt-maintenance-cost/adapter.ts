/**
 * 관리비 응답 정규화. 같은 응답 안에서 int·"0"·float·null이 섞여 온다(2026-10-15 표본 100단지 실측).
 */
import { COST_OPS, COMMON_GROUPS, INDIVIDUAL_GROUPS, type CostOp, type SumGroup, type LtrField } from './ops';

type Rec = Record<string, unknown>;

export function toAmount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.replace(/,/g, '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** resultCode 00이면 ok. item이 없는 정상 응답은 "그 달 미공개"로 item=null. */
export function readItem(payload: unknown): { ok: boolean; item: Rec | null } {
  if (!payload || typeof payload !== 'object') return { ok: false, item: null };
  const res = (payload as Rec).response as Rec | undefined;
  const header = res?.header as Rec | undefined;
  if (header?.resultCode !== '00') return { ok: false, item: null };
  const item = (res?.body as Rec | undefined)?.item;
  return { ok: true, item: item && typeof item === 'object' && !Array.isArray(item) ? (item as Rec) : null };
}

export interface OpResult {
  op: CostOp;
  ok: boolean;
  item: Rec | null;
}

export type MaintenanceAmounts = Record<SumGroup | 'commonTotal' | LtrField, number | null>;

const AMOUNT_KEYS: (SumGroup | 'commonTotal' | LtrField)[] = [
  ...COMMON_GROUPS, ...INDIVIDUAL_GROUPS, 'commonTotal', 'ltrLevy', 'ltrUse', 'ltrBalance', 'ltrRate',
];

function add(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return a + b;
}

export function summarizeMonth(results: OpResult[]): {
  amounts: MaintenanceAmounts;
  complete: boolean;
  raw: Record<string, Rec | null>;
} {
  const amounts = Object.fromEntries(AMOUNT_KEYS.map((k) => [k, null])) as MaintenanceAmounts;
  const raw: Record<string, Rec | null> = {};

  for (const r of results) {
    raw[r.op.op] = r.item;
    if (!r.item) continue;
    if (r.op.kind === 'sum') {
      let s: number | null = null;
      for (const f of r.op.fields) s = add(s, toAmount(r.item[f]));
      amounts[r.op.group] = add(amounts[r.op.group], s);
    } else {
      amounts[r.op.field] = toAmount(r.item[r.op.key]);
    }
  }

  amounts.commonTotal = COMMON_GROUPS.reduce<number | null>((acc, g) => add(acc, amounts[g]), null);
  const complete = results.length === COST_OPS.length && results.every((r) => r.ok);
  return { amounts, complete, raw };
}
