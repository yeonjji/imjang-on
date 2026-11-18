import { describe, it, expect } from 'vitest';
import {
  aptNoticeBadges,
  aptSchedule,
  specialSupplyBreakdown,
  pricePerPyeong,
} from '@/lib/subscription/apt-detail';
import { correctedTopAmount, findAmountCorrection } from '@/lib/subscription/amount-corrections';

// 실제 공고(부천대장 A2BL, houseManageNo 2026000457) rawJson 발췌
const bucheon = {
  HOUSE_DTL_SECD_NM: '국민',
  RENT_SECD_NM: '분양주택',
  PARCPRC_ULS_AT: 'Y',
  SPECLT_RDN_EARTH_AT: 'N',
  MDAT_TRGET_AREA_SECD: 'N',
  LRSCL_BLDLND_AT: 'Y',
  PUBLIC_HOUSE_EARTH_AT: 'Y',
  IMPRMN_BSNS_AT: 'N',
  SPSPLY_RCEPT_BGNDE: '2026-11-23',
  SPSPLY_RCEPT_ENDDE: '2026-11-23',
  GNRL_RNK1_CRSPAREA_RCPTDE: '2026-11-24',
  GNRL_RNK1_CRSPAREA_ENDDE: '2026-11-24',
  GNRL_RNK1_ETC_GG_RCPTDE: '2026-11-24',
  GNRL_RNK1_ETC_GG_ENDDE: '2026-11-24',
  GNRL_RNK1_ETC_AREA_RCPTDE: '2026-11-24',
  GNRL_RNK1_ETC_AREA_ENDDE: '2026-11-24',
  GNRL_RNK2_CRSPAREA_RCPTDE: '2026-11-25',
  GNRL_RNK2_CRSPAREA_ENDDE: '2026-11-25',
  GNRL_RNK2_ETC_AREA_RCPTDE: '2026-11-25',
  GNRL_RNK2_ETC_AREA_ENDDE: '2026-11-25',
};

describe('aptNoticeBadges', () => {
  it('Y인 항목만, 국민/민영 먼저', () => {
    expect(aptNoticeBadges('APT', bucheon)).toEqual(['국민주택', '분양가상한제', '대규모 택지개발지구', '공공주택지구']);
  });
  it('APT가 아니면 빈 배열', () => {
    expect(aptNoticeBadges('REMNANT', bucheon)).toEqual([]);
  });
});

describe('aptSchedule', () => {
  it('세부 지역 날짜가 같으면 한 줄 값', () => {
    const s = aptSchedule('APT', bucheon)!;
    expect(s.special).toBe('2026-11-23');
    expect(s.rank1).toEqual({
      value: '2026-11-24',
      areas: [
        { label: '해당지역', value: '2026-11-24' },
        { label: '기타경기', value: '2026-11-24' },
        { label: '기타지역', value: '2026-11-24' },
      ],
    });
    expect(s.rank2?.value).toBe('2026-11-25');
    expect(s.rank2?.areas.map((a) => a.label)).toEqual(['해당지역', '기타지역']);
  });
  it('세부 지역 날짜가 다르면 value null', () => {
    const s = aptSchedule('APT', { ...bucheon, GNRL_RNK1_ETC_AREA_RCPTDE: '2026-11-25', GNRL_RNK1_ETC_AREA_ENDDE: '2026-11-25' })!;
    expect(s.rank1?.value).toBeNull();
  });
  it('기간이면 범위로', () => {
    const s = aptSchedule('APT', { ...bucheon, SPSPLY_RCEPT_ENDDE: '2026-11-24' })!;
    expect(s.special).toBe('2026-11-23 ~ 2026-11-24');
  });
  it('APT가 아니거나 1순위 일정이 없으면 null', () => {
    expect(aptSchedule('OFFICETEL_ETC', bucheon)).toBeNull();
    expect(aptSchedule('APT', { SPSPLY_RCEPT_BGNDE: '2026-11-23' })).toBeNull();
  });
});

const unit = (houseType: string, r: Record<string, unknown>) => ({ houseType, rawJson: r });
const sp = (o: Record<string, number>) => ({
  NWBB_HSHLDCO: 0, LFE_FRST_HSHLDCO: 0, INSTT_RECOMEND_HSHLDCO: 0, MNYCH_HSHLDCO: 0, NWWDS_HSHLDCO: 0,
  OLD_PARNTS_SUPORT_HSHLDCO: 0, YGMN_HSHLDCO: 0, TRANSR_INSTT_ENFSN_HSHLDCO: 0, ETC_HSHLDCO: 0, ...o,
});

describe('specialSupplyBreakdown', () => {
  it('0인 유형은 빼고 합계 많은 순, 기타는 맨 뒤', () => {
    const b = specialSupplyBreakdown([
      unit('059.7100A', { SPSPLY_HSHLDCO: 205, ...sp({ MNYCH_HSHLDCO: 24, NWWDS_HSHLDCO: 24, LFE_FRST_HSHLDCO: 36, OLD_PARNTS_SUPORT_HSHLDCO: 12, INSTT_RECOMEND_HSHLDCO: 36, NWBB_HSHLDCO: 49, ETC_HSHLDCO: 24 }) }),
    ])!;
    expect(b.columns).toEqual(['신생아', '생애최초', '기관추천', '다자녀', '신혼부부', '노부모부양', '기타']);
    expect(b.rows[0].counts).toEqual([49, 36, 36, 24, 24, 12, 24]);
    expect(b.total).toBe(205);
  });
  it('유형별 합이 특공 세대수와 다른 주택형은 뺀다', () => {
    const b = specialSupplyBreakdown([
      unit('A', { SPSPLY_HSHLDCO: 10, ...sp({ NWWDS_HSHLDCO: 10 }) }),
      unit('B', { SPSPLY_HSHLDCO: 10, ...sp({ NWWDS_HSHLDCO: 9 }) }),
    ])!;
    expect(b.rows.map((r) => r.houseType)).toEqual(['A']);
  });
  it('남는 주택형이 없으면 null(유형 필드 없는 공고 포함)', () => {
    expect(specialSupplyBreakdown([unit('A', { SPSPLY_HSHLDCO: 0, ...sp({}) })])).toBeNull();
    expect(specialSupplyBreakdown([unit('A', { SUPLY_AMOUNT: '11060' })])).toBeNull();
  });
});

describe('pricePerPyeong', () => {
  const notice = { category: 'APT', houseManageNo: '2026000457', rawJson: bucheon };
  it('최고 분양가 ÷ 공급면적 평', () => {
    expect(pricePerPyeong(notice, { topAmount: 61345, rawJson: { SUPLY_AR: '81.0969' } })).toBe(2501);
    expect(pricePerPyeong(notice, { topAmount: 85406, rawJson: { SUPLY_AR: '115.3774' } })).toBe(2447);
  });
  it('임대·비APT·공급면적 없음은 null', () => {
    const u = { topAmount: 7200, rawJson: { SUPLY_AR: '84.5' } };
    expect(pricePerPyeong({ ...notice, rawJson: { RENT_SECD_NM: '분양전환 가능임대' } }, u)).toBeNull();
    expect(pricePerPyeong({ ...notice, category: 'PUB_PRIV_RENT' }, u)).toBeNull();
    expect(pricePerPyeong(notice, { topAmount: 7200, rawJson: { EXCLUSE_AR: '59.9' } })).toBeNull();
  });
  it('원문 미확인 의심 공고는 null', () => {
    expect(pricePerPyeong({ ...notice, houseManageNo: '2025820006' }, { topAmount: 461940, rawJson: { SUPLY_AR: '82.8838' } })).toBeNull();
  });
  it('상한(2억/3.3㎡) 초과는 null', () => {
    expect(pricePerPyeong(notice, { topAmount: 693790, rawJson: { SUPLY_AR: '82.4825' } })).toBeNull();
  });
});

describe('amount corrections', () => {
  it('공고문으로 확인한 성남복정1 55B: 693,790 → 69,379', () => {
    expect(correctedTopAmount('2025820009', '055.9700B', 693790)).toBe(69379);
    expect(findAmountCorrection(' 2025820009 ', '055.9700B')?.amount).toBe(69379);
  });
  it('원자료가 바뀌었으면(청약홈이 바로잡음) 보정하지 않는다', () => {
    expect(correctedTopAmount('2025820009', '055.9700B', 69379)).toBe(69379);
    expect(correctedTopAmount('2025820009', '055.9700B', 70000)).toBe(70000);
  });
  it('다른 공고는 그대로', () => {
    expect(correctedTopAmount('2026000457', '059.7100A', 61345)).toBe(61345);
    expect(correctedTopAmount(null, null, null)).toBeNull();
  });
});
