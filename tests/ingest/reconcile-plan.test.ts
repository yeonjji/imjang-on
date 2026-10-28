import { describe, it, expect } from 'vitest';
import { DealType } from '@prisma/client';
import { planReconcile, reconcileKey, area2, legacyHash, type ApiTx, type DbTx } from '@/scripts/ingest/transactions/reconcile';
import { computeHash } from '@/scripts/ingest/transactions/runner';
import type { NormalizedTransaction } from '@/scripts/ingest/types';

const D = (s: string) => new Date(`${s}T00:00:00Z`);
let nextId = 100n;
const base = { propertyId: 1n, dealType: DealType.SALE, contractDate: D('2026-06-10'), exclusiveArea: 84.99, floor: 5, dealAmount: 100000, deposit: null, monthlyRent: null, cancelType: null as string | null, cancelDate: null as Date | null };
const db = (o: Partial<DbTx> = {}): DbTx => ({ ...base, id: ++nextId, rawHash: `h${nextId}`, ...o });
const api = (o: Partial<ApiTx> = {}): ApiTx => ({ ...base, data: {} as never, ...o });
const O = { cancelType: 'O', cancelDate: D('2026-07-20') };

describe('reconcileKey·area2', () => {
  it('DB Decimal(6,2)와 같은 반올림(84.9973 → 85.00, 84.995 → 85.00)', () => {
    expect(area2(84.9973)).toBe('85.00');
    expect(area2(84.995)).toBe('85.00');
    expect(area2(84.994)).toBe('84.99');
    expect(area2(30.2)).toBe('30.20');
  });
  it('DB 저장과 같은 규칙: 유효숫자 16자리 → 둘째 자리 반올림(84.975는 이진수로 84.97499…라 84.97로 저장된다)', () => {
    // 리허설에서 원천 84.975가 매번 '정정'으로 보관·재삽입되던 원인(2026-10-28)
    expect(area2(84.975)).toBe('84.97');
    expect(area2(8.075)).toBe('8.07');
    expect(area2(1.005)).toBe('1.01');
    expect(area2(84.9751)).toBe('84.98');
    expect(area2(66.335)).toBe('66.33'); // 66.33499999999999
  });
  it('해제 여부가 키에 들어간다(해제본과 정상본은 다른 키)', () => {
    expect(reconcileKey(api())).not.toBe(reconcileKey(api(O)));
  });
  it('legacyHash는 옛 수집기 computeHash와 같다(다른 범위 중복 확인용)', () => {
    const a = api({ exclusiveArea: 84.9973, floor: null, dealAmount: 123456 });
    expect(legacyHash(a)).toBe(computeHash(a as unknown as NormalizedTransaction, a.propertyId));
    expect(legacyHash(api(O))).toBe(legacyHash(api())); // 해제 여부는 옛 해시에 없다
  });
});

describe('planReconcile', () => {
  it('원천과 DB가 같으면 아무것도 하지 않는다(멱등)', () => {
    const p = planReconcile([api(), api({ floor: 7 })], [db(), db({ floor: 7 })]);
    expect(p).toMatchObject({ inserts: [], archives: [], orphans: [], cancelDateRepairs: [] });
  });

  it('해제된 원거래 + 같은 조건 재신고가 함께 있으면: 정상 1행은 그대로, 해제 1행만 추가', () => {
    const d = db();
    const p = planReconcile([api(), api(O)], [d]);
    expect(p.archives).toEqual([]);
    expect(p.inserts.map((a) => a.cancelType)).toEqual(['O']);
  });

  it('재신고 없이 해제만 된 경우: 정상 행을 보관(사유 cancel)하고 해제 행을 넣는다', () => {
    const d = db();
    const p = planReconcile([api(O)], [d]);
    expect(p.archives).toEqual([{ row: d, reason: 'cancel' }]);
    expect(p.inserts).toHaveLength(1);
  });

  it('같은 조건의 실제 거래가 여러 건이면 모두 유지한다(옛 해시 충돌로 1건만 있던 것을 보충)', () => {
    const p = planReconcile([api(), api(), api()], [db()]);
    expect(p.inserts).toHaveLength(2);
    expect(p.archives).toEqual([]);
  });

  it('정정 신고(면적 30.22→30.21): 이전 값 행을 보관(correction)하고 정정본을 넣는다', () => {
    const d = db({ exclusiveArea: 30.22 });
    const p = planReconcile([api({ exclusiveArea: 30.21 })], [d]);
    expect(p.archives).toEqual([{ row: d, reason: 'correction' }]);
    expect(p.inserts).toHaveLength(1);
  });

  it('정정은 속성 하나만 다를 때만 인정(둘 이상 다르면 보관하지 않고 보류)', () => {
    const d = db({ exclusiveArea: 30.22, floor: 3 });
    const p = planReconcile([api({ exclusiveArea: 30.21, floor: 9 })], [d]);
    expect(p.archives).toEqual([]);
    expect(p.orphans).toEqual([d]);
    expect(p.inserts).toHaveLength(1);
  });

  it('수집 기간이 지난 뒤 추가 신고: 넣기만 한다', () => {
    const p = planReconcile([api(), api({ contractDate: D('2026-06-29'), dealAmount: 90000 })], [db()]);
    expect(p.inserts).toHaveLength(1);
    expect(p.archives).toEqual([]);
  });

  it('원천에서 사라졌는데 대체가 없으면 지우지 않고 보류(단순 건수 차이로 삭제 금지)', () => {
    const d = db({ dealAmount: 77777 });
    const p = planReconcile([api()], [db(), d]);
    expect(p.archives).toEqual([]);
    expect(p.orphans).toEqual([d]);
  });

  it('매물만 다르면(같은 이름 매물이 여럿) 같은 거래로 보고 그대로 둔다 — 옮기면 실행마다 매물 사이를 오간다', () => {
    const d = db({ propertyId: 2n });
    const p = planReconcile([api({ propertyId: 3n })], [d]);
    expect(p).toMatchObject({ inserts: [], archives: [], orphans: [], propertyMismatch: 1 });
  });

  it('매물만 다른 짝이 정정·해제보다 먼저 맞춰진다', () => {
    const d = db({ propertyId: 2n });
    const p = planReconcile([api({ propertyId: 3n }), api({ propertyId: 3n, ...O })], [d]);
    expect(p.archives).toEqual([]);
    expect(p.inserts.map((a) => a.cancelType)).toEqual(['O']);
  });

  it('해제 행의 해제일이 옛 파싱 오류(1926년)면 원천 값으로 고친다(키는 같으니 행 이동 없음)', () => {
    const d = db({ cancelType: 'O', cancelDate: D('1926-07-20') });
    const p = planReconcile([api(O)], [d]);
    expect(p.cancelDateRepairs).toEqual([{ id: d.id, propertyId: d.propertyId, cancelDate: D('2026-07-20') }]);
    expect(p.inserts).toEqual([]);
    expect(p.archives).toEqual([]);
  });

  it('보관 대상은 같은 키 안에서 가장 최근 id부터(오래된 원본을 남긴다)', () => {
    const d1 = db(); const d2 = db();
    const p = planReconcile([api(O)], [d1, d2]);
    expect(p.archives.map((a) => a.row.id)).toEqual([d2.id]);
    expect(p.orphans).toEqual([d1]); // 대체(해제 1건)는 하나뿐
  });
});
