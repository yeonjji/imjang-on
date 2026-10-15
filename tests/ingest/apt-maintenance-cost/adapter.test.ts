import { describe, it, expect } from 'vitest';
import { toAmount, readItem, summarizeMonth, type OpResult } from '@/scripts/ingest/apt-maintenance-cost/adapter';
import { COST_OPS } from '@/scripts/ingest/apt-maintenance-cost/ops';

const ok = (item: Record<string, unknown> | null) => ({ response: { header: { resultCode: '00' }, body: item ? { item } : {} } });
const byOp = (name: string) => COST_OPS.find((o) => o.op === name)!;
/** 31개 전부 정상 응답 + 지정한 오퍼레이션만 item을 갖는 결과 */
function results(items: Record<string, Record<string, unknown>>): OpResult[] {
  return COST_OPS.map((op) => ({ op, ok: true, item: items[op.op] ?? { kaptCode: 'A1', kaptName: 'x' } }));
}

describe('COST_OPS', () => {
  it('31개이고 중복이 없다', () => {
    expect(COST_OPS).toHaveLength(31);
    expect(new Set(COST_OPS.map((o) => o.op)).size).toBe(31);
  });
  it('개별사용료는 V3 오퍼레이션명을 쓴다', () => {
    expect(COST_OPS.filter((o) => o.service === 'AptIndvdlzManageCostServiceV3').every((o) => o.op.endsWith('V3'))).toBe(true);
  });
});

describe('toAmount', () => {
  it('타입이 섞여 와도 숫자로 바꾼다', () => {
    expect(toAmount(1506766)).toBe(1506766);
    expect(toAmount('0')).toBe(0);
    expect(toAmount('1,234')).toBe(1234);
    expect(toAmount(3.5)).toBe(3.5);
  });
  it('null·빈 문자열·숫자 아닌 값은 null', () => {
    expect(toAmount(null)).toBeNull();
    expect(toAmount(undefined)).toBeNull();
    expect(toAmount('')).toBeNull();
    expect(toAmount('  ')).toBeNull();
    expect(toAmount('abc')).toBeNull();
    expect(toAmount({})).toBeNull();
  });
});

describe('readItem', () => {
  it('resultCode 00이면 ok와 item', () => {
    expect(readItem(ok({ cleanCost: 1 }))).toEqual({ ok: true, item: { cleanCost: 1 } });
  });
  it('item이 없는 정상 응답은 ok, item null', () => {
    expect(readItem(ok(null))).toEqual({ ok: true, item: null });
  });
  it('XML 오류 문자열·다른 resultCode는 ok=false', () => {
    expect(readItem('<errMsg>NO_OPENAPI_SERVICE_ERROR</errMsg>').ok).toBe(false);
    expect(readItem({ response: { header: { resultCode: '03' } } }).ok).toBe(false);
    expect(readItem(null).ok).toBe(false);
  });
});

describe('summarizeMonth', () => {
  it('묶음별로 item의 금액 필드를 모두 더한다(kaptCode·kaptName 제외)', () => {
    const r = summarizeMonth(results({
      getHsmpLaborCostInfoV3: { kaptCode: 'A1', kaptName: 'x', pay: '100', bonus: 0, pension: 50, welfareBenefit: null },
      getHsmpRepairsCostInfoV3: { lrefCost1: 10 },
      getHsmpFacilityMntncCostInfoV3: { lrefCost2: '20' },
      getHsmpCleaningCostInfoV3: { cleanCost: 7 },
    }));
    expect(r.amounts.labor).toBe(150);
    expect(r.amounts.repairs).toBe(30);
    expect(r.amounts.cleaning).toBe(7);
    expect(r.amounts.commonTotal).toBe(187);
    expect(r.complete).toBe(true);
  });

  it('개별난방 단지의 난방 0은 0으로 남는다(null이 아니다)', () => {
    const r = summarizeMonth(results({ getHsmpHeatCostInfoV3: { heatP: '0', heatC: 0 } }));
    expect(r.amounts.heat).toBe(0);
  });

  it('장기수선충당금은 지정 필드 하나만 읽는다', () => {
    const r = summarizeMonth(results({
      getHsmpMonthFeeInfoV3: { sLevy: 52459240 },
      getHsmpReserveBalanceInfoV3: { sTot: 1312406334 },
      getHsmpAccumulationTariffInfoV3: { sPer: 0 },
    }));
    expect(r.amounts.ltrLevy).toBe(52459240);
    expect(r.amounts.ltrBalance).toBe(1312406334);
    expect(r.amounts.ltrRate).toBe(0);
  });

  it('모든 값이 비어 있는 달은 금액이 전부 null이지만 complete=true', () => {
    const empty = COST_OPS.map((op) => ({ op, ok: true, item: { kaptCode: 'A1', kaptName: 'x', v: null } }));
    const r = summarizeMonth(empty);
    expect(r.amounts.commonTotal).toBeNull();
    expect(r.amounts.heat).toBeNull();
    expect(r.complete).toBe(true);
  });

  it('하나라도 실패했거나 31개가 아니면 complete=false', () => {
    const rs = results({});
    rs[3] = { ...rs[3], ok: false, item: null };
    expect(summarizeMonth(rs).complete).toBe(false);
    expect(summarizeMonth(results({}).slice(0, 30)).complete).toBe(false);
  });

  it('원 응답을 오퍼레이션별로 보존한다', () => {
    const r = summarizeMonth(results({ getHsmpGuardCostInfoV3: { guardCost: 5 } }));
    expect(r.raw.getHsmpGuardCostInfoV3).toEqual({ guardCost: 5 });
  });
});
