import { describe, it, expect } from 'vitest';
import { parseSchoolJson, parseYyyymmdd } from '@/scripts/ingest/amenities/adapter-school';

const base = {
  ATPT_OFCDC_SC_NM: '서울특별시교육청', LCTN_SC_NM: '서울특별시', FOND_SC_NM: '공립',
  COEDU_SC_NM: '남여공학', ORG_TELNO: '02-000-0000', HMPG_ADRES: null,
};
const body = JSON.stringify({
  schoolInfo: [
    { head: [{ list_total_count: 4 }, { RESULT: { CODE: 'INFO-000', MESSAGE: '정상' } }] },
    {
      row: [
        { ...base, SD_SCHUL_CODE: '7010057', SCHUL_NM: '가락고등학교', SCHUL_KND_SC_NM: '고등학교',
          ORG_RDNMA: '서울특별시 송파구 송이로 42', HS_SC_NM: '일반고', HS_GNRL_BUSNS_SC_NM: '일반계',
          SPCLY_PURPS_HS_ORD_NM: null, ENE_BFE_SEHF_SC_NM: '후기', FOND_YMD: '19881223', FOAS_MEMRD: '19890428' },
        { ...base, SD_SCHUL_CODE: '7000001', SCHUL_NM: '교남학교', SCHUL_KND_SC_NM: '특수학교',
          ORG_RDNMA: '서울특별시 종로구 1', HS_SC_NM: null, HS_GNRL_BUSNS_SC_NM: '해당없음',
          SPCLY_PURPS_HS_ORD_NM: null, ENE_BFE_SEHF_SC_NM: '전기', FOND_YMD: '19830125', FOAS_MEMRD: '19830321' },
        { ...base, SD_SCHUL_CODE: '7000002', SCHUL_NM: '날짜이상학교', SCHUL_KND_SC_NM: '초등학교',
          ORG_RDNMA: '서울특별시 중구 1', HS_SC_NM: null, HS_GNRL_BUSNS_SC_NM: '일반계',
          SPCLY_PURPS_HS_ORD_NM: null, ENE_BFE_SEHF_SC_NM: '전기', FOND_YMD: '20240231', FOAS_MEMRD: '1989' },
        { ...base, SD_SCHUL_CODE: '7000003', SCHUL_NM: '경동고등학교부설방송통신고등학교', SCHUL_KND_SC_NM: '방송통신고',
          ORG_RDNMA: '서울특별시 성북구 1', HS_SC_NM: '일반고', HS_GNRL_BUSNS_SC_NM: '일반계',
          SPCLY_PURPS_HS_ORD_NM: null, ENE_BFE_SEHF_SC_NM: '후기', FOND_YMD: '19740302', FOAS_MEMRD: '20020101' },
      ],
    },
  ],
});
const rows = parseSchoolJson(body).rows;
const byName = (n: string) => rows.find((r) => r.name === n)!;

describe('adapter-school 상세 필드', () => {
  it('고등학교: 고교 유형·계열·입학 전형·설립일·개교기념일', () => {
    const s = byName('가락고등학교');
    expect(s.hsType).toBe('일반고');
    expect(s.hsTrack).toBe('일반계');
    expect(s.specialPurpose).toBeNull();
    expect(s.admissionPeriod).toBe('후기');
    expect(s.foundedAt?.toISOString()).toBe('1988-12-23T00:00:00.000Z');
    expect(s.anniversaryAt?.toISOString()).toBe('1989-04-28T00:00:00.000Z');
  });

  it('"해당없음"은 null로 바꾼다', () => {
    expect(byName('교남학교').hsTrack).toBeNull();
  });

  it('존재하지 않는 날짜·8자리 아닌 값은 null', () => {
    const s = byName('날짜이상학교');
    expect(s.foundedAt).toBeNull();
    expect(s.anniversaryAt).toBeNull();
  });
});

describe('개교기념일 자리표시', () => {
  it('MMDD가 0101인 개교기념일은 자리표시로 보고 null', () => {
    const s = byName('경동고등학교부설방송통신고등학교');
    expect(s.anniversaryAt).toBeNull();
    expect(s.foundedAt?.toISOString()).toBe('1974-03-02T00:00:00.000Z');
  });
});

describe('parseYyyymmdd', () => {
  it('8자리 유효 날짜만 UTC 자정으로', () => {
    expect(parseYyyymmdd('18820908')?.toISOString()).toBe('1882-09-08T00:00:00.000Z');
    expect(parseYyyymmdd(19881223)?.toISOString()).toBe('1988-12-23T00:00:00.000Z');
    expect(parseYyyymmdd('20240231')).toBeNull();
    expect(parseYyyymmdd('1988-12-23')).toBeNull();
    expect(parseYyyymmdd(null)).toBeNull();
  });
});
