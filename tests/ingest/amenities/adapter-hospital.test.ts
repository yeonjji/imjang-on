import { describe, it, expect } from 'vitest';
import {
  parseHospitalRows,
  parseFacilityRows,
  parseDetailRows,
  parseDeptRows,
} from '@/scripts/ingest/amenities/adapter-hospital';

const HOSPITAL_ROWS: Record<string, unknown>[] = [
  {
    '암호화요양기호': 'ABC123',
    '요양기관명': '서울중앙의원',
    '종별코드': '31',
    '종별코드명': '의원',
    '시도코드': 110000,
    '시도코드명': '서울',
    '시군구코드': 110001,
    '시군구코드명': '서울종로구',
    '읍면동': '종로동',
    '우편번호': '03181',
    '주소': '서울특별시 종로구 종로 1',
    '전화번호': '02-1234-5678',
    '병원홈페이지': 'https://hospital.kr',
    '개설일자': new Date('2010-03-15'),
    '총의사수': 5,
    '의과일반의 인원수': 1,
    '의과인턴 인원수': 0,
    '의과레지던트 인원수': 1,
    '의과전문의 인원수': 3,
    '치과일반의 인원수': 0,
    '치과인턴 인원수': 0,
    '치과레지던트 인원수': 0,
    '치과전문의 인원수': 0,
    '한방일반의 인원수': 0,
    '한방인턴 인원수': 0,
    '한방레지던트 인원수': 0,
    '한방전문의 인원수': 0,
    '조산사 인원수': 0,
    '좌표(X)': 126.978,
    '좌표(Y)': 37.572,
  },
  {
    '암호화요양기호': 'DEF456',
    '요양기관명': '부산의원',
    '종별코드': '31',
    '종별코드명': '의원',
    '시도코드': 210000,
    '시도코드명': '부산',
    '시군구코드': 210010,
    '시군구코드명': '부산해운대구',
    '읍면동': null,
    '우편번호': null,
    '주소': '부산광역시 해운대구 해운대로 1',
    '전화번호': null,
    '병원홈페이지': null,
    '개설일자': null,
    '총의사수': 1,
    '의과일반의 인원수': 0,
    '의과인턴 인원수': 0,
    '의과레지던트 인원수': 0,
    '의과전문의 인원수': 1,
    '치과일반의 인원수': 0,
    '치과인턴 인원수': 0,
    '치과레지던트 인원수': 0,
    '치과전문의 인원수': 0,
    '한방일반의 인원수': 0,
    '한방인턴 인원수': 0,
    '한방레지던트 인원수': 0,
    '한방전문의 인원수': 0,
    '조산사 인원수': 0,
    '좌표(X)': 0,
    '좌표(Y)': 0,
  },
];

describe('parseHospitalRows', () => {
  it('기본 필드를 파싱한다', () => {
    const rows = parseHospitalRows(HOSPITAL_ROWS);
    expect(rows).toHaveLength(2);
    const r = rows[0];
    expect(r.sourceId).toBe('ABC123');
    expect(r.name).toBe('서울중앙의원');
    expect(r.typeCode).toBe('31');
    expect(r.sido).toBe('서울');
    expect(r.sigunguCode).toBe('110001');
    expect(r.address).toBe('서울특별시 종로구 종로 1');
    expect(r.tel).toBe('02-1234-5678');
    expect(r.totalDoctors).toBe(5);
    expect(r.drMedSpecialist).toBe(3);
    expect(r.openedAt).toEqual(new Date('2010-03-15'));
    expect(r.lat).toBeCloseTo(37.572);
    expect(r.lng).toBeCloseTo(126.978);
  });

  it('좌표 0은 null 처리한다', () => {
    const rows = parseHospitalRows(HOSPITAL_ROWS);
    expect(rows[1].lat).toBeNull();
    expect(rows[1].lng).toBeNull();
  });

  it('sourceId 없는 행은 스킵한다', () => {
    const rows = parseHospitalRows([{ ...HOSPITAL_ROWS[0], '암호화요양기호': '' }]);
    expect(rows).toHaveLength(0);
  });

  it('전화번호/홈페이지 null 처리', () => {
    const rows = parseHospitalRows(HOSPITAL_ROWS);
    expect(rows[1].tel).toBeNull();
    expect(rows[1].homepage).toBeNull();
    expect(rows[1].openedAt).toBeNull();
  });
});

describe('parseFacilityRows', () => {
  it('병상수를 파싱한다', () => {
    const rows = parseFacilityRows([{
      '암호화요양기호': 'ABC123',
      '요양기관명': '서울중앙의원',
      '종별코드': '31',
      '종별코드명': '의원',
      '설립구분코드': '12',
      '설립구분코드명': '개인',
      '시도코드': 110000,
      '시도코드명': '서울',
      '시군구코드': 110001,
      '시군구코드명': '서울종로구',
      '읍면동': '종로동',
      '우편번호': '03181',
      '주소': '서울특별시 종로구 종로 1',
      '전화번호': '02-1234-5678',
      '개설일자': new Date('2010-03-15'),
      '일반입원실상급병상수': 0,
      '일반입원실일반병상수': 10,
      '성인중환자병상수': 2,
      '소아중환자병상수': 0,
      '신생아중환자병상수': 0,
      '분만실병상수': 0,
      '수술실병상수': 1,
      '응급실병상수': 3,
      '물리치료실병상수': 0,
      '정신과폐쇄상급병상수': 0,
      '정신과폐쇄일반병상수': 0,
      '정신과개방상급병상수': 0,
      '정신과개방일반병상수': 0,
      '격리병실병상수': 0,
      '무균치료실병상수': 0,
    }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].hospitalSourceId).toBe('ABC123');
    expect(rows[0].foundTypeName).toBe('개인');
    expect(rows[0].generalBedNormal).toBe(10);
    expect(rows[0].icuAdultBed).toBe(2);
    expect(rows[0].erBed).toBe(3);
    expect(rows[0].operatingRoomBed).toBe(1);
  });
});

describe('parseDetailRows', () => {
  it('진료시간을 HHMM 정수로 파싱한다', () => {
    const rows = parseDetailRows([{
      '암호화요양기호': 'ABC123',
      '요양기관명': '서울중앙의원',
      '위치_공공건물(장소)명': '율하역 2번 출구',
      '위치_방향': null,
      '위치_거리': null,
      '주차_가능대수': 30,
      '주차_비용 부담여부': 'N',
      '주차_기타 안내사항': null,
      '휴진안내_일요일': '전부 휴진',
      '휴진안내_공휴일': null,
      '응급실_주간_운영여부': 'N',
      '응급실_주간_전화번호1': null,
      '응급실_주간_전화번호2': null,
      '응급실_야간_운영여부': 'N',
      '응급실_야간_전화번호1': null,
      '응급실_야간_전화번호2': null,
      '점심시간_평일': '13:00-14:00',
      '점심시간_토요일': null,
      '접수시간_평일': '09:00-18:00',
      '접수시간_토요일': null,
      '진료시작시간_일요일': 0,
      '진료종료시간_일요일': 0,
      '진료시작시간_월요일': 900,
      '진료종료시간_월요일': 1800,
      '진료시작시간_화요일': 900,
      '진료종료시간_화요일': 1800,
      '진료시작시간_수요일': 900,
      '진료종료시간_수요일': 1800,
      '진료시작시간_목요일': 900,
      '진료종료시간_목요일': 1800,
      '진료시작시간_금요일': 900,
      '진료종료시간_금요일': 1800,
      '진료시작시간_토요일': 900,
      '진료종료시간_토요일': 1300,
    }]);
    expect(rows[0].openMon).toBe(900);
    expect(rows[0].closeMon).toBe(1800);
    expect(rows[0].openSat).toBe(900);
    expect(rows[0].closeSat).toBe(1300);
    expect(rows[0].openSun).toBeNull();
    expect(rows[0].parkingCapacity).toBe(30);
    expect(rows[0].locationBuilding).toBe('율하역 2번 출구');
  });
});

describe('parseDeptRows', () => {
  it('진료과목을 파싱한다', () => {
    const rows = parseDeptRows([
      { '암호화요양기호': 'ABC123', '요양기관명': '서울중앙의원', '진료과목코드': '01', '진료과목코드명': '내과', '과목별 전문의수': 2, '선택진료 의사수': 0 },
      { '암호화요양기호': 'ABC123', '요양기관명': '서울중앙의원', '진료과목코드': '05', '진료과목코드명': '정형외과', '과목별 전문의수': 1, '선택진료 의사수': 0 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].deptCode).toBe('01');
    expect(rows[0].deptName).toBe('내과');
    expect(rows[0].specialistCount).toBe(2);
  });

  it('deptCode 없는 행 스킵', () => {
    const rows = parseDeptRows([{ '암호화요양기호': 'ABC123', '진료과목코드': '', '진료과목코드명': '', '과목별 전문의수': 0, '선택진료 의사수': 0 }]);
    expect(rows).toHaveLength(0);
  });
});
