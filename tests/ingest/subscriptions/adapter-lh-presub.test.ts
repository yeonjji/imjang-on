import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseLhList,
  normalizeLhNotice,
  applyLhDetail,
} from '@/scripts/ingest/subscriptions/adapter-lh-presub';

function load(name: string) {
  return JSON.parse(readFileSync(resolve(`tests/ingest/subscriptions/fixtures/${name}`), 'utf-8'));
}

describe('parseLhList', () => {
  it('dsList 행들을 추출한다', () => {
    const rows = parseLhList(load('lh-list.json'));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].PAN_ID).toBeTruthy();
  });
});

describe('normalizeLhNotice', () => {
  const rows = parseLhList(load('lh-list.json'));
  const n = normalizeLhNotice(rows[0]);
  it('source/category/sourceKey(PAN_ID) 매핑', () => {
    expect(n.source).toBe('LH_PRESUB');
    expect(n.category).toBe('LH_PRESUB');
    expect(n.sourceKey).toBe(rows[0].PAN_ID);
    expect(n.panId).toBe(rows[0].PAN_ID);
  });
  it('목록 메타(name/region/status/url/origNoticeKey) 매핑', () => {
    expect(n.name).toBe(rows[0].PAN_NM);
    expect(n.regionCode).toBe(rows[0].CNP_CD || null);
    expect(n.regionName).toBe(rows[0].CNP_CD_NM);
    expect(n.status).toBe(rows[0].PAN_SS);
    expect(n.noticeUrl).toBe(rows[0].DTL_URL);
    expect(n.origNoticeKey).toBe(rows[0].OTXT_PAN_ID);
  });
  it('LH 는 좌표를 채우지 않는다', () => {
    expect(n.lat).toBeNull();
    expect(n.lng).toBeNull();
  });
});

describe('applyLhDetail', () => {
  it('상세의 첫 일정에서 receiptBegin/winnerDate 를 보강하고 rawJson 에 상세 병합', () => {
    const rows = parseLhList(load('lh-list.json'));
    const n = normalizeLhNotice(rows[0]);
    const merged = applyLhDetail(n, load('lh-detail.json'));
    expect(merged.receiptBegin).not.toBeNull();
    expect(merged.winnerDate).not.toBeNull();
    expect((merged.rawJson as any).detail).toBeDefined();
  });
});
