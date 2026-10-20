import { describe, it, expect } from 'vitest';
import { selectTarget } from '@/scripts/ingest/building-register/select';

const main = (o: Record<string, unknown> = {}) => ({ mainAtchGbCd: '0', mainPurpsCdNm: '공동주택', etcPurps: '공동주택', useAprDay: '20190830', bldNm: '', ...o });
const atch = (o: Record<string, unknown> = {}) => ({ mainAtchGbCd: '1', mainPurpsCdNm: '주차장', useAprDay: '20190830', ...o });

describe('selectTarget', () => {
  it('결과가 없으면 not_found', () => {
    expect(selectTarget({ type: 'MULTIPLEX', name: 'x', builtYear: 2019, recap: [], titles: [] }).status).toBe('not_found');
  });
  it('빌라: 주건축물 1건이면 채택(부속건축물은 무시)', () => {
    const r = selectTarget({ type: 'MULTIPLEX', name: '고척헤리츠', builtYear: 2019, recap: [], titles: [main(), atch()] });
    expect(r.status).toBe('matched');
    if (r.status === 'matched') expect(r.mains).toHaveLength(1);
  });
  it('아파트: 총괄표제부 1건이면 그 필지의 주건축물 전체', () => {
    const r = selectTarget({ type: 'APARTMENT', name: 'e편한세상', builtYear: 2024, recap: [{ useAprDay: '' }], titles: [main({ useAprDay: '20240423' }), main({ useAprDay: '20240423' })] });
    expect(r.status).toBe('matched');
    if (r.status === 'matched') { expect(r.mains).toHaveLength(2); expect(r.recap).not.toBeNull(); }
  });
  it('여러 건물이면 건물명이 단지명과 맞는 한 이름으로 모일 때만', () => {
    const titles = [main({ bldNm: '가나빌라 A동' }), main({ bldNm: '다라맨션' })];
    expect(selectTarget({ type: 'ROW_HOUSE', name: '다라맨션', builtYear: 2019, recap: [], titles }).status).toBe('matched');
    expect(selectTarget({ type: 'ROW_HOUSE', name: '마바', builtYear: 2019, recap: [], titles }).status).toBe('ambiguous');
  });
  it('준공연도: ±1년 안이면 채택, 없거나 어긋나면 탈락', () => {
    const t = [main({ useAprDay: '20190830' })];
    expect(selectTarget({ type: 'MULTIPLEX', name: 'x', builtYear: 2020, recap: [], titles: t }).status).toBe('matched');
    expect(selectTarget({ type: 'MULTIPLEX', name: 'x', builtYear: 2015, recap: [], titles: t }).status).toBe('year_mismatch');
    expect(selectTarget({ type: 'MULTIPLEX', name: 'x', builtYear: null, recap: [], titles: t }).status).toBe('year_unknown');
    expect(selectTarget({ type: 'MULTIPLEX', name: 'x', builtYear: 2019, recap: [], titles: [main({ useAprDay: '' })] }).status).toBe('year_unknown');
  });
  it('용도: 빌라·아파트는 주택, 오피스텔은 오피스텔·업무·공동주택이어야 한다', () => {
    expect(selectTarget({ type: 'MULTIPLEX', name: 'x', builtYear: 2019, recap: [], titles: [main({ mainPurpsCdNm: '공장', etcPurps: '공장' })] }).status).toBe('purpose_mismatch');
    expect(selectTarget({ type: 'OFFICETEL', name: 'x', builtYear: 2019, recap: [], titles: [main({ mainPurpsCdNm: '업무시설', etcPurps: '업무시설(오피스텔)' })] }).status).toBe('matched');
    expect(selectTarget({ type: 'OFFICETEL', name: 'x', builtYear: 2019, recap: [], titles: [main({ mainPurpsCdNm: '공장', etcPurps: '지식산업센터' })] }).status).toBe('purpose_mismatch');
  });
});
