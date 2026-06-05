import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  normalizeNotice,
  normalizeUnit,
  APPLYHOME_CONFIG,
} from '@/scripts/ingest/subscriptions/adapter-applyhome';

function load(name: string) {
  return JSON.parse(readFileSync(resolve(`tests/ingest/subscriptions/fixtures/${name}`), 'utf-8'));
}

describe('normalizeNotice (APT)', () => {
  const detail = load('applyhome-apt-detail.json').data[0];
  const n = normalizeNotice(detail, APPLYHOME_CONFIG.apt);

  it('source/category/sourceKey 를 채운다', () => {
    expect(n.source).toBe('APPLYHOME');
    expect(n.category).toBe('APT');
    expect(n.sourceKey).toBe(`${detail.HOUSE_MANAGE_NO}-${detail.PBLANC_NO}`);
  });
  it('공통 필드를 매핑한다', () => {
    expect(n.name).toBe(detail.HOUSE_NM);
    expect(n.regionCode).toBe(detail.SUBSCRPT_AREA_CODE);
    expect(n.regionName).toBe(detail.SUBSCRPT_AREA_CODE_NM);
    expect(n.address).toBe(detail.HSSPLY_ADRES);
    expect(n.totalSupply).toBe(Number(detail.TOT_SUPLY_HSHLDCO));
    expect(n.noticeUrl).toBe(detail.PBLANC_URL);
    expect(n.developer).toBe(detail.BSNS_MBY_NM);
    expect(n.constructor).toBe(detail.CNSTRCT_ENTRPS_NM);
  });
  it('APT 의 RCEPT_BGNDE 를 receiptBegin 으로 쓴다', () => {
    expect(n.receiptBegin?.toISOString().slice(0, 10)).toBe(detail.RCEPT_BGNDE);
  });
  it('rawJson 에 원본을 보존한다', () => {
    expect((n.rawJson as any).HOUSE_NM).toBe(detail.HOUSE_NM);
  });
});

describe('normalizeUnit (APT vs urbty 필드 차이)', () => {
  it('APT: HOUSE_TY/SUPLY_AR/LTTOT_TOP_AMOUNT 를 쓴다', () => {
    const row = load('applyhome-apt-mdl.json').data[0];
    const u = normalizeUnit(row);
    expect(u.houseType).toBe(row.HOUSE_TY);
    expect(u.area).toBeCloseTo(Number(row.SUPLY_AR));
    expect(u.generalSupply).toBe(Number(row.SUPLY_HSHLDCO));
    expect(u.specialSupply).toBe(Number(row.SPSPLY_HSHLDCO));
    expect(u.topAmount).toBe(Number(String(row.LTTOT_TOP_AMOUNT).replace(/,/g, '')));
  });
  it('urbty: TP/EXCLUSE_AR/SUPLY_AMOUNT 로 폴백한다', () => {
    const row = load('applyhome-urbty-mdl.json').data[0];
    const u = normalizeUnit(row);
    expect(u.houseType).toBe(row.TP);
    expect(u.area).toBeCloseTo(Number(row.EXCLUSE_AR));
    expect(u.generalSupply).toBe(Number(row.SUPLY_HSHLDCO));
    expect(u.topAmount).toBe(Number(String(row.SUPLY_AMOUNT).replace(/,/g, '')));
    expect(u.specialSupply).toBeNull();
  });
});
