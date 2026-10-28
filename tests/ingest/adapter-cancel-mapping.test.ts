import { describe, it, expect } from 'vitest';
import { adapterOffiTrade } from '@/scripts/ingest/transactions/adapter-offi-trade';
import { adapterRhTrade } from '@/scripts/ingest/transactions/adapter-rh-trade';
import { adapterAptTrade } from '@/scripts/ingest/transactions/adapter-apt-trade';
import { parseMolitDate } from '@/scripts/ingest/transactions/molit-date';

// S3: 오피스텔·연립다세대 매매 API도 cdealType/cdealDay를 준다(2026-10-27 강남구 실측). 아파트와 같은 규칙으로 매핑.
const xml = (nameTag: string, extra: string) => `<?xml version="1.0"?><response><header><resultCode>00</resultCode></header><body><items>
<item><${nameTag}>UT</${nameTag}><dealYear>2026</dealYear><dealMonth>6</dealMonth><dealDay>10</dealDay><excluUseAr>59.99</excluUseAr><floor>3</floor><dealAmount>35,000</dealAmount><houseType>다세대</houseType>${extra}</item>
</items><totalCount>1</totalCount></body></response>`;

describe.each([
  ['오피스텔', adapterOffiTrade, 'offiNm'],
  ['연립다세대', adapterRhTrade, 'mhouseNm'],
  ['아파트', adapterAptTrade, 'aptNm'],
] as const)('%s 매매 해제 매핑', (_, adapter, nameTag) => {
  it('cdealType=O, cdealDay YY.MM.DD → 해제', () => {
    const [r] = adapter.parseRows(xml(nameTag, '<cdealType>O</cdealType><cdealDay>26.09.09</cdealDay>'), '11680').rows;
    expect(r.cancelType).toBe('O');
    expect(r.cancelDate?.toISOString().slice(0, 10)).toBe('2026-09-09');
  });
  it('공백 값은 해제 아님', () => {
    const [r] = adapter.parseRows(xml(nameTag, '<cdealType> </cdealType><cdealDay> </cdealDay>'), '11680').rows;
    expect(r.cancelType).toBeNull();
    expect(r.cancelDate).toBeNull();
  });
});

describe('parseMolitDate', () => {
  it('YY.MM.DD·YYYYMMDD, 잘못된 날짜는 null', () => {
    expect(parseMolitDate('26.09.09')?.toISOString().slice(0, 10)).toBe('2026-09-09');
    expect(parseMolitDate('20260909')?.toISOString().slice(0, 10)).toBe('2026-09-09');
    expect(parseMolitDate('26.02.30')).toBeNull();
    expect(parseMolitDate(' ')).toBeNull();
  });
});
