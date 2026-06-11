import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseLoanProducts } from '@/scripts/ingest/loan/adapter';

const xml = readFileSync(join(__dirname, '../fixtures/loan-sample.xml'), 'utf-8');

describe('parseLoanProducts', () => {
  it('item 을 LoanProductRow 로 매핑하고 totalCount 를 반환한다', () => {
    const { rows, totalCount } = parseLoanProducts(xml);
    expect(totalCount).toBe(2);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      seq: 8,
      finprdnm: '사잇돌Ⅱ대출_대환형',
      ofrinstnm: 'SGI서울보증',
      instCtg: '민간기업',
      lnlmt: 2000,
      irt: '~19.99',
      irtCtg: '변동금리',
      usageTags: ['생계'],
      targetTags: ['근로자', '사업자', '연금소득자'],
      regionTags: ['전국'],
    });
  });
  it('rawJson 에 원본 필드를 보존한다', () => {
    const { rows } = parseLoanProducts(xml);
    expect((rows[0].rawJson as any).rltsite).toBe('https://www.fsb.or.kr');
    expect((rows[0].rawJson as any).cnpl).toBe(1397);
  });
  it('resultCode 가 비정상이면 throw 한다', () => {
    const bad = xml.replace('<resultCode>00</resultCode>', '<resultCode>30</resultCode>');
    expect(() => parseLoanProducts(bad)).toThrow();
  });
});
