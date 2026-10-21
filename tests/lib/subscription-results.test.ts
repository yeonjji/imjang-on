import { describe, expect, it } from 'vitest';
import {
  buildResultsView,
  formatRate,
  houseTypeLabel,
  parseRate,
} from '@/lib/insights/subscription-results';

const cmp = (
  ty: string,
  rank: number,
  secd: string,
  rate: string,
  req: string,
  supply: number,
) => ({
  HOUSE_TY: ty,
  SUBSCRPT_RANK_CODE: rank,
  RESIDE_SECD: secd,
  RESIDE_SENM: secd === '01' ? '해당지역' : secd === '02' ? '기타지역' : '기타경기',
  CMPET_RATE: rate,
  REQ_CNT: req,
  SUPLY_HSHLDCO: supply,
});

describe('parseRate', () => {
  it('숫자·쉼표', () => {
    expect(parseRate('1692.33')).toEqual({ kind: 'rate', value: 1692.33 });
    expect(parseRate('16,227.00')).toEqual({ kind: 'rate', value: 16227 });
  });
  it("'(△n)'은 미달 n세대", () => {
    expect(parseRate('(△236)')).toEqual({ kind: 'short', n: 236 });
  });
  it("'-'·빈 값·이상값은 없음", () => {
    expect(parseRate('-')).toEqual({ kind: 'none' });
    expect(parseRate('')).toEqual({ kind: 'none' });
    expect(parseRate(undefined)).toEqual({ kind: 'none' });
    expect(parseRate('abc')).toEqual({ kind: 'none' });
  });
  it('표기', () => {
    expect(formatRate(parseRate('1692.33'))).toBe('1,692.33 : 1');
    expect(formatRate(parseRate('5'))).toBe('5.00 : 1');
    expect(formatRate(parseRate('(△14)'))).toBe('미달 14세대');
    expect(formatRate(parseRate('-'))).toBe('—');
  });
});

describe('houseTypeLabel', () => {
  it('면적형', () => {
    expect(houseTypeLabel('084.9700A')).toBe('84.97㎡ A');
    expect(houseTypeLabel('059.9800 ')).toBe('59.98㎡');
    expect(houseTypeLabel('105.5065C')).toBe('105.51㎡ C');
  });
  it('그 외는 원문', () => {
    expect(houseTypeLabel('69A1')).toBe('69A1');
    expect(houseTypeLabel(' 1 ')).toBe('1');
  });
});

describe('buildResultsView — APT', () => {
  const competition = [
    cmp('059.9800 ', 1, '01', '1692.33', '10154', 6),
    cmp('059.9800 ', 1, '02', '-', '0', 6),
    cmp('059.9800 ', 2, '01', '-', '0', 6),
    cmp('059.9800 ', 2, '02', '-', '0', 6),
    cmp('084.9700A', 1, '01', '467.53', '8883', 19),
    cmp('084.9700A', 1, '02', '-', '0', 19),
    cmp('084.9700A', 2, '01', '-', '0', 19),
    cmp('084.9700A', 2, '02', '-', '0', 19),
  ];

  it('요약: 공급은 주택형당 1번, 1순위 해당지역 접수 합', () => {
    const v = buildResultsView('APT', competition, null, null);
    if (v?.kind !== 'apt') throw new Error('apt view expected');
    expect(v.summary.requests).toBe(19037);
    expect(v.summary.supply).toBe(25);
    expect(v.summary.overall).toBe('761.48');
    expect(v.summary.top).toEqual({ type: '59.98㎡', rate: '1,692.33' });
    expect(v.summary.shortfall).toBe(0);
  });

  it('2순위 데이터가 모두 없으면 2순위 열 없음, 기타지역 열은 경쟁률만', () => {
    const v = buildResultsView('APT', competition, null, null);
    if (v?.kind !== 'apt') throw new Error('apt view expected');
    expect(v.columns).toEqual(['공급', '해당지역 접수', '해당지역 경쟁률', '기타지역']);
    expect(v.rows[0]).toEqual({
      type: '59.98㎡',
      cells: ['6', '10,154', '1,692.33 : 1', '—'],
    });
    expect(v.hasDash).toBe(true);
    expect(v.hasShort).toBe(false);
  });

  it('미달 공고: 2순위 열과 최종 미달 합(주택형별 마지막 값)', () => {
    const rows = [
      cmp('084.9500A', 1, '01', '(△236)', '183', 419),
      cmp('084.9500A', 1, '02', '(△218)', '18', 419),
      cmp('084.9500A', 2, '01', '(△170)', '48', 419),
      cmp('084.9500A', 2, '02', '(△164)', '6', 419),
      cmp('084.9500E', 1, '01', '1.00', '10', 10),
      cmp('084.9500E', 1, '02', '-', '0', 10),
      cmp('084.9500E', 2, '01', '-', '0', 10),
      cmp('084.9500E', 2, '02', '-', '0', 10),
    ];
    const v = buildResultsView('APT', rows, null, null);
    if (v?.kind !== 'apt') throw new Error('apt view expected');
    expect(v.columns).toEqual(['공급', '해당지역 접수', '해당지역 경쟁률', '기타지역', '2순위']);
    expect(v.rows[0].cells).toEqual(['419', '183', '미달 236세대', '미달 218세대', '미달 164세대']);
    expect(v.rows[1].cells).toEqual(['10', '10', '1.00 : 1', '—', '—']);
    expect(v.summary.shortfall).toBe(164);
    expect(v.summary.overall).toBe('0.45');
    expect(v.summary.top).toEqual({ type: '84.95㎡ E', rate: '1.00' });
    expect(v.hasShort).toBe(true);
  });

  it('기타경기 지역이 있으면 해당 → 기타경기 → 기타지역 순서', () => {
    const rows = [
      cmp('084.0000 ', 1, '01', '3.00', '30', 10),
      cmp('084.0000 ', 1, '02', '-', '0', 10),
      cmp('084.0000 ', 1, '03', '2.00', '20', 10),
    ];
    const v = buildResultsView('APT', rows, null, null);
    if (v?.kind !== 'apt') throw new Error('apt view expected');
    expect(v.columns).toEqual(['공급', '해당지역 접수', '해당지역 경쟁률', '기타경기', '기타지역']);
    expect(v.rows[0].cells).toEqual(['10', '30', '3.00 : 1', '2.00 : 1', '—']);
  });

  it('가점: 0·- 행 숨김, 지역이 하나면 지역 열 없음', () => {
    const scores = [
      { HOUSE_TY: '059.9800 ', RESIDE_SECD: '01', RESIDE_SENM: '해당지역', LWET_SCORE: '70', AVRG_SCORE: '70', TOP_SCORE: '70' },
      { HOUSE_TY: '059.9800 ', RESIDE_SECD: '02', RESIDE_SENM: '기타지역', LWET_SCORE: '0', AVRG_SCORE: '0', TOP_SCORE: '0' },
      { HOUSE_TY: '084.9700A', RESIDE_SECD: '02', RESIDE_SENM: '기타지역', LWET_SCORE: '-', AVRG_SCORE: '-', TOP_SCORE: '-' },
      { HOUSE_TY: '084.9700A', RESIDE_SECD: '01', RESIDE_SENM: '해당지역', LWET_SCORE: '69', AVRG_SCORE: '70.07', TOP_SCORE: '74' },
    ];
    const v = buildResultsView('APT', competition, scores, null);
    if (v?.kind !== 'apt') throw new Error('apt view expected');
    expect(v.scores).toEqual({
      showRegion: false,
      region: '해당지역',
      rows: [
        { type: '59.98㎡', region: '해당지역', low: '70', avg: '70', top: '70' },
        { type: '84.97㎡ A', region: '해당지역', low: '69', avg: '70.07', top: '74' },
      ],
    });
  });

  it('가점: 지역이 둘 이상이면 지역 열, 전부 비면 null', () => {
    const scores = [
      { HOUSE_TY: '084.9900F', RESIDE_SENM: '해당지역', LWET_SCORE: '44', AVRG_SCORE: '51.75', TOP_SCORE: '58' },
      { HOUSE_TY: '084.9500E', RESIDE_SENM: '기타지역', LWET_SCORE: '56', AVRG_SCORE: '56', TOP_SCORE: '56' },
    ];
    const v = buildResultsView('APT', competition, scores, null);
    if (v?.kind !== 'apt') throw new Error('apt view expected');
    expect(v.scores?.showRegion).toBe(true);
    const empty = buildResultsView('APT', competition, [{ HOUSE_TY: 'x', RESIDE_SENM: '해당지역', LWET_SCORE: '0', AVRG_SCORE: '0', TOP_SCORE: '0' }], null);
    if (empty?.kind !== 'apt') throw new Error('apt view expected');
    expect(empty.scores).toBeNull();
  });

  it('특별공급: 유형별 합산, 기관추천·이전기관 제외, 배정 0 숨김', () => {
    const base = {
      MNYCH_HSHLDCO: 0, NWWDS_NMTW_HSHLDCO: 0, LFE_FRST_HSHLDCO: 0, YGMN_HSHLDCO: 0,
      OLD_PARNTS_SUPORT_HSHLDCO: 0, NWBB_NWBBSHR_HSHLDCO: 0,
      INSTT_RECOMEND_HSHLDCO: 3, INSTT_RECOMEND_PREPAR_CNT: 50,
      TRANSR_INSTT_ENFSN_HSHLDCO: 1, TRANSR_INSTT_ENFSN_CNT: 9,
    } as Record<string, number | string>;
    for (const k of ['MNYCH', 'NWWDS_NMTW', 'LFE_FRST', 'YGMN', 'OPS', 'NWBB_NWBBSHR'])
      for (const a of ['CRSPAREA', 'CTPRVN', 'ETC_AREA']) base[`${a}_${k}_CNT`] = 0;
    const special = [
      { ...base, HOUSE_TY: '059.9800 ', LFE_FRST_HSHLDCO: 1, CRSPAREA_LFE_FRST_CNT: 3431, ETC_AREA_LFE_FRST_CNT: 626, NWWDS_NMTW_HSHLDCO: 2, CRSPAREA_NWWDS_NMTW_CNT: 1692, ETC_AREA_NWWDS_NMTW_CNT: 366 },
      { ...base, HOUSE_TY: '084.9700A', LFE_FRST_HSHLDCO: '6', CRSPAREA_LFE_FRST_CNT: '827', OLD_PARNTS_SUPORT_HSHLDCO: 2, CTPRVN_OPS_CNT: 87 },
    ];
    const v = buildResultsView('APT', competition, null, special);
    if (v?.kind !== 'apt') throw new Error('apt view expected');
    expect(v.special).toEqual([
      { label: '생애최초', alloc: '7', req: '4,884', rate: '697.71 : 1' },
      { label: '신혼부부', alloc: '2', req: '2,058', rate: '1,029.00 : 1' },
      { label: '노부모', alloc: '2', req: '87', rate: '43.50 : 1' },
    ]);
  });

  it('배정이 모두 0이면 특별공급 null', () => {
    const v = buildResultsView('APT', competition, null, [{ HOUSE_TY: 'x', MNYCH_HSHLDCO: 0 }]);
    if (v?.kind !== 'apt') throw new Error('apt view expected');
    expect(v.special).toBeNull();
  });

  it('경쟁률 행이 없으면 null', () => {
    expect(buildResultsView('APT', [], null, null)).toBeNull();
    expect(buildResultsView('APT', null, null, null)).toBeNull();
    expect(buildResultsView('OFFICETEL_ETC', 'oops' as unknown, null, null)).toBeNull();
  });
});

describe('buildResultsView — 그 외 유형', () => {
  it('오피스텔: 타입 + 구분(거주자우선/기타/전체)', () => {
    const v = buildResultsView(
      'OFFICETEL_ETC',
      [
        { HOUSE_TY: '1', RESIDNT_PRIOR_SENM: '거주자우선', SUPLY_HSHLDCO: 182, REQ_CNT: '270', CMPET_RATE: '7.50' },
        { HOUSE_TY: '1', RESIDNT_PRIOR_SENM: '기타', SUPLY_HSHLDCO: 182, REQ_CNT: '125', CMPET_RATE: '(△14)' },
      ],
      null,
      null,
    );
    expect(v).toEqual({
      kind: 'simple',
      typeHeader: '타입',
      kindHeader: '구분',
      rows: [
        { type: '1', kind: '거주자우선', supply: '182', req: '270', rate: '7.50 : 1' },
        { type: '1', kind: '기타', supply: '182', req: '125', rate: '미달 14세대' },
      ],
    });
  });

  it('공공지원민간임대: 공급유형 열, 배정·접수 모두 0인 유형 행 숨김', () => {
    const v = buildResultsView(
      'PUB_PRIV_RENT',
      [
        { HOUSE_TY: '69A1', SPSPLY_KND_NM: '일반공급', SPSPLY_KND_HSHLDCO: 0, SUPLY_HSHLDCO: 248, REQ_CNT: '0', CMPET_RATE: '-' },
        { HOUSE_TY: '69A1', SPSPLY_KND_NM: '신혼부부', SPSPLY_KND_HSHLDCO: 105, SUPLY_HSHLDCO: 248, REQ_CNT: '224', CMPET_RATE: '2.13' },
      ],
      null,
      null,
    );
    expect(v).toEqual({
      kind: 'simple',
      typeHeader: '주택형',
      kindHeader: '공급유형',
      rows: [{ type: '69A1', kind: '신혼부부', supply: '105', req: '224', rate: '2.13 : 1' }],
    });
  });

  it('잔여·임의: 구분 열 없음', () => {
    const v = buildResultsView(
      'REMNANT',
      [{ HOUSE_TY: '076.3622 ', SUPLY_HSHLDCO: 1, REQ_CNT: '16227', CMPET_RATE: '16,227.00' }],
      null,
      null,
    );
    expect(v).toEqual({
      kind: 'simple',
      typeHeader: '주택형',
      kindHeader: null,
      rows: [{ type: '76.36㎡', kind: null, supply: '1', req: '16,227', rate: '16,227.00 : 1' }],
    });
  });

  it('LH 사전청약 등 대상 아닌 유형은 null', () => {
    expect(buildResultsView('LH_PRESUB', [{ HOUSE_TY: '1' }], null, null)).toBeNull();
  });
});
