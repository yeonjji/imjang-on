import { describe, it, expect } from 'vitest';
import { parseProductDetail, parseRegionLimits } from '@/scripts/ingest/jeonse-guarantee/adapter';

// 실제 op3 응답 형태(스파이크 실측). 빈 문자열·문자열 숫자 포함.
const DETAIL_2D = {
  header: { resultCode: '00', resultMsg: '정상' },
  body: {
    item: {
      grntDvcd: '2D',
      rcmdProdNm: '일반전세자금보증',
      rcmdGrntProdDvcd: '01',
      grntReqTrgtDvcd: '03',
      reqTrgtCont: '임차보증금 7억원(지방 5억원) 이하|1주택 이내',
      exptGrfeRateCont: '0.02%~0.40%',
      intSprtCont: '',
      grntPrmeCont: '',
      qscNm: '',
      qscTlno: '',
      rentGrntMaxLoanLmtRate: '89.0',
      maxLoanLmtAmt: '444444444',
      trtBankCont: '039|034|004',
      guidUrl: 'https://www.hf.go.kr/ko/sub02/sub02_01_02.do',
    },
    pageNo: 1,
    totalCount: 1,
    numOfRows: 10,
  },
};

describe('parseProductDetail', () => {
  it('item을 행으로 매핑(숫자 변환, 빈문자열→null)', () => {
    const row = parseProductDetail(DETAIL_2D, '2D')!;
    expect(row.grntDvcd).toBe('2D');
    expect(row.rcmdProdNm).toBe('일반전세자금보증');
    expect(row.rentGrntMaxLoanLmtRate).toBe(89);
    expect(row.maxLoanLmtAmt).toBe(444444444);
    expect(row.grntReqTrgtDvcd).toBe('03');
    expect(row.intSprtCont).toBeNull(); // 빈 문자열 → null
    expect(row.grntPrmeCont).toBeNull(); // 빈 문자열 → null
    expect(row.trtBankCont).toBe('039|034|004');
    expect(row.rawJson).toEqual(DETAIL_2D.body.item);
  });

  it('rcmdProdNm 없으면 코드표 라벨로 폴백', () => {
    const j = { header: { resultCode: '00' }, body: { item: { grntDvcd: '2V' } } };
    const row = parseProductDetail(j, '2V')!;
    expect(row.rcmdProdNm).toBe('무주택 청년 특례전세');
  });

  it('item 없으면 null (NODATA)', () => {
    expect(parseProductDetail({ header: { resultCode: '00' }, body: {} }, '99')).toBeNull();
  });

  it('resultCode가 00이 아니면 throw', () => {
    expect(() => parseProductDetail({ header: { resultCode: '03', resultMsg: 'NODATA' }, body: {} }, '2D')).toThrow();
  });
});

describe('parseRegionLimits', () => {
  const REGION_2D = {
    header: { resultCode: '00', resultMsg: '정상' },
    body: {
      items: [
        { maxRentGrntAmt: '700000000', trgtLwdgCd: '1100000000' },
        { maxRentGrntAmt: '500000000', trgtLwdgCd: '2600000000' },
      ],
    },
  };

  it('items 배열을 행으로 매핑', () => {
    const rows = parseRegionLimits(REGION_2D, '2D');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ grntDvcd: '2D', trgtLwdgCd: '1100000000', maxRentGrntAmt: 700000000 });
  });

  it('items가 단건(객체)이어도 1행 처리', () => {
    const j = { header: { resultCode: '00' }, body: { items: { maxRentGrntAmt: '300000000', trgtLwdgCd: '1100000000' } } };
    expect(parseRegionLimits(j, '4J')).toHaveLength(1);
  });

  it('items 없으면 빈 배열', () => {
    expect(parseRegionLimits({ header: { resultCode: '00' }, body: {} }, '2D')).toEqual([]);
  });

  it('필수 필드 누락 행은 제외', () => {
    const j = { header: { resultCode: '00' }, body: { items: [{ trgtLwdgCd: '1100000000' }, { maxRentGrntAmt: '700000000' }] } };
    expect(parseRegionLimits(j, '2D')).toEqual([]);
  });

  it('resultCode 비정상이면 throw', () => {
    expect(() => parseRegionLimits({ header: { resultCode: '22' }, body: {} }, '2D')).toThrow();
  });
});
