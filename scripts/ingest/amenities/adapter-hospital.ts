import type {
  NormalizedHospital,
  NormalizedHospitalFacility,
  NormalizedHospitalDetail,
  NormalizedHospitalDept,
  NormalizedHospitalTransit,
  NormalizedHospitalEquipment,
  NormalizedHospitalMealSurcharge,
  NormalizedHospitalNursingGrade,
  NormalizedHospitalSpecialTreatment,
  NormalizedHospitalSpecialty,
  NormalizedHospitalStaff,
} from './types';

function str(v: unknown): string { return String(v ?? '').trim(); }
function strOrNull(v: unknown): string | null { const s = str(v); return s || null; }
function intOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function dateOrNull(v: unknown): Date | null { return v instanceof Date ? v : null; }
function hhmm(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
function isKoreaCoord(lat: number | null, lng: number | null): boolean {
  return lat !== null && lng !== null && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}

export function parseHospitalRows(rows: Record<string, unknown>[]): NormalizedHospital[] {
  const result: NormalizedHospital[] = [];
  for (const row of rows) {
    const sourceId = str(row['암호화요양기호']);
    if (!sourceId) continue;
    const rawLng = Number(row['좌표(X)']);
    const rawLat = Number(row['좌표(Y)']);
    const lat = Number.isFinite(rawLat) && rawLat !== 0 ? rawLat : null;
    const lng = Number.isFinite(rawLng) && rawLng !== 0 ? rawLng : null;
    result.push({
      sourceId,
      name: str(row['요양기관명']),
      typeCode: str(row['종별코드']),
      typeName: str(row['종별코드명']),
      sido: strOrNull(row['시도코드명']),
      sigungu: strOrNull(row['시군구코드명']),
      sigunguCode: strOrNull(String(row['시군구코드'] ?? '')),
      eupmyeondong: strOrNull(row['읍면동']),
      zipcode: strOrNull(row['우편번호']),
      address: str(row['주소']),
      tel: strOrNull(row['전화번호']),
      homepage: strOrNull(row['병원홈페이지']),
      openedAt: dateOrNull(row['개설일자']),
      totalDoctors: intOrNull(row['총의사수']),
      drMedGeneral: intOrNull(row['의과일반의 인원수']),
      drMedIntern: intOrNull(row['의과인턴 인원수']),
      drMedResident: intOrNull(row['의과레지던트 인원수']),
      drMedSpecialist: intOrNull(row['의과전문의 인원수']),
      drDentGeneral: intOrNull(row['치과일반의 인원수']),
      drDentIntern: intOrNull(row['치과인턴 인원수']),
      drDentResident: intOrNull(row['치과레지던트 인원수']),
      drDentSpecialist: intOrNull(row['치과전문의 인원수']),
      drKorGeneral: intOrNull(row['한방일반의 인원수']),
      drKorIntern: intOrNull(row['한방인턴 인원수']),
      drKorResident: intOrNull(row['한방레지던트 인원수']),
      drKorSpecialist: intOrNull(row['한방전문의 인원수']),
      midwifeCount: intOrNull(row['조산사 인원수']),
      lat: isKoreaCoord(lat, lng) ? lat : null,
      lng: isKoreaCoord(lat, lng) ? lng : null,
    });
  }
  return result;
}

export function parseFacilityRows(rows: Record<string, unknown>[]): NormalizedHospitalFacility[] {
  const result: NormalizedHospitalFacility[] = [];
  for (const row of rows) {
    const hospitalSourceId = str(row['암호화요양기호']);
    if (!hospitalSourceId) continue;
    result.push({
      hospitalSourceId,
      foundTypeCode: strOrNull(row['설립구분코드']),
      foundTypeName: strOrNull(row['설립구분코드명']),
      generalBedPremium: intOrNull(row['일반입원실상급병상수']),
      generalBedNormal: intOrNull(row['일반입원실일반병상수']),
      icuAdultBed: intOrNull(row['성인중환자병상수']),
      icuPediatricBed: intOrNull(row['소아중환자병상수']),
      icuNeonatalBed: intOrNull(row['신생아중환자병상수']),
      deliveryBed: intOrNull(row['분만실병상수']),
      operatingRoomBed: intOrNull(row['수술실병상수']),
      erBed: intOrNull(row['응급실병상수']),
      physicalTherapyBed: intOrNull(row['물리치료실병상수']),
      psychiatryClosedPremium: intOrNull(row['정신과폐쇄상급병상수']),
      psychiatryClosedNormal: intOrNull(row['정신과폐쇄일반병상수']),
      psychiatryOpenPremium: intOrNull(row['정신과개방상급병상수']),
      psychiatryOpenNormal: intOrNull(row['정신과개방일반병상수']),
      isolationBed: intOrNull(row['격리병실병상수']),
      sterileRoomBed: intOrNull(row['무균치료실병상수']),
    });
  }
  return result;
}

export function parseDetailRows(rows: Record<string, unknown>[]): NormalizedHospitalDetail[] {
  const result: NormalizedHospitalDetail[] = [];
  for (const row of rows) {
    const hospitalSourceId = str(row['암호화요양기호']);
    if (!hospitalSourceId) continue;
    result.push({
      hospitalSourceId,
      locationBuilding: strOrNull(row['위치_공공건물(장소)명']),
      locationDirection: strOrNull(row['위치_방향']),
      locationDistance: strOrNull(row['위치_거리']),
      parkingCapacity: intOrNull(row['주차_가능대수']),
      parkingFee: strOrNull(row['주차_비용 부담여부']),
      parkingNote: strOrNull(row['주차_기타 안내사항']),
      closedSunday: strOrNull(row['휴진안내_일요일']),
      closedHoliday: strOrNull(row['휴진안내_공휴일']),
      erDayOpen: strOrNull(row['응급실_주간_운영여부']),
      erDayTel1: strOrNull(row['응급실_주간_전화번호1']),
      erDayTel2: strOrNull(row['응급실_주간_전화번호2']),
      erNightOpen: strOrNull(row['응급실_야간_운영여부']),
      erNightTel1: strOrNull(row['응급실_야간_전화번호1']),
      erNightTel2: strOrNull(row['응급실_야간_전화번호2']),
      lunchWeekday: strOrNull(row['점심시간_평일']),
      lunchSaturday: strOrNull(row['점심시간_토요일']),
      receptionWeekday: strOrNull(row['접수시간_평일']),
      receptionSaturday: strOrNull(row['접수시간_토요일']),
      openSun: hhmm(row['진료시작시간_일요일']),
      closeSun: hhmm(row['진료종료시간_일요일']),
      openMon: hhmm(row['진료시작시간_월요일']),
      closeMon: hhmm(row['진료종료시간_월요일']),
      openTue: hhmm(row['진료시작시간_화요일']),
      closeTue: hhmm(row['진료종료시간_화요일']),
      openWed: hhmm(row['진료시작시간_수요일']),
      closeWed: hhmm(row['진료종료시간_수요일']),
      openThu: hhmm(row['진료시작시간_목요일']),
      closeThu: hhmm(row['진료종료시간_목요일']),
      openFri: hhmm(row['진료시작시간_금요일']),
      closeFri: hhmm(row['진료종료시간_금요일']),
      openSat: hhmm(row['진료시작시간_토요일']),
      closeSat: hhmm(row['진료종료시간_토요일']),
    });
  }
  return result;
}

export function parseDeptRows(rows: Record<string, unknown>[]): NormalizedHospitalDept[] {
  const result: NormalizedHospitalDept[] = [];
  for (const row of rows) {
    const hospitalSourceId = str(row['암호화요양기호']);
    const deptCode = str(row['진료과목코드']);
    if (!hospitalSourceId || !deptCode) continue;
    result.push({
      hospitalSourceId,
      deptCode,
      deptName: str(row['진료과목코드명']),
      specialistCount: intOrNull(row['과목별 전문의수']),
      optionalDoctorCount: intOrNull(row['선택진료 의사수']),
    });
  }
  return result;
}

// HospitalTransit 각 컬럼의 varchar 한도. 정상 값은 최대 50자대인데,
// 심평원 교통 파일 일부 행이 여러 레코드가 ♣ 구분자로 뭉개진 3만자대 깨진 셀로 들어온다.
// 한도를 넘는 값은 손상 데이터이므로 해당 행을 버린다(클램프하면 base64 쓰레기만 남음).
const TRANSIT_LIMITS: Record<string, number> = {
  transitName: 50,
  routeNumber: 100,
  stopPoint: 100,
  direction: 100,
  distance: 50,
  note: 200,
};

export function parseTransitRows(rows: Record<string, unknown>[]): NormalizedHospitalTransit[] {
  const result: NormalizedHospitalTransit[] = [];
  for (const row of rows) {
    const hospitalSourceId = str(row['암호화요양기호']);
    if (!hospitalSourceId) continue;
    const rec: NormalizedHospitalTransit = {
      hospitalSourceId,
      transitName: strOrNull(row['교통편명']),
      routeNumber: strOrNull(row['노선번호']),
      stopPoint: strOrNull(row['하차지점']),
      direction: strOrNull(row['방향']),
      distance: strOrNull(row['거리']),
      note: strOrNull(row['비고']),
    };
    const corrupt = Object.entries(TRANSIT_LIMITS).some(([field, limit]) => {
      const v = (rec as Record<string, unknown>)[field];
      return typeof v === 'string' && v.length > limit;
    });
    if (corrupt) continue;
    result.push(rec);
  }
  return result;
}

export function parseEquipmentRows(rows: Record<string, unknown>[]): NormalizedHospitalEquipment[] {
  const result: NormalizedHospitalEquipment[] = [];
  for (const row of rows) {
    const hospitalSourceId = str(row['암호화요양기호']);
    const equipCode = str(row['장비코드']);
    if (!hospitalSourceId || !equipCode) continue;
    result.push({ hospitalSourceId, equipCode, equipName: str(row['장비코드명']), equipCount: intOrNull(row['장비대수']) });
  }
  return result;
}

export function parseMealSurchargeRows(rows: Record<string, unknown>[]): NormalizedHospitalMealSurcharge[] {
  const result: NormalizedHospitalMealSurcharge[] = [];
  for (const row of rows) {
    const hospitalSourceId = str(row['암호화요양기호']);
    const typeCode = str(row['유형코드']);
    if (!hospitalSourceId || !typeCode) continue;
    result.push({
      hospitalSourceId, typeCode,
      typeName: str(row['유형코드명']),
      hasGeneral: strOrNull(row['일반식 가산여부']),
      staffCount: intOrNull(row['산정인원수']),
      treatmentGrade: strOrNull(row['치료식 등급']),
    });
  }
  return result;
}

export function parseNursingGradeRows(rows: Record<string, unknown>[]): NormalizedHospitalNursingGrade[] {
  const result: NormalizedHospitalNursingGrade[] = [];
  for (const row of rows) {
    const hospitalSourceId = str(row['암호화요양기호']);
    const typeCode = str(row['유형코드']);
    if (!hospitalSourceId || !typeCode) continue;
    result.push({ hospitalSourceId, typeCode, typeName: str(row['유형코드명']), nursingGrade: strOrNull(row['간호등급']) });
  }
  return result;
}

export function parseSpecialTreatmentRows(rows: Record<string, unknown>[]): NormalizedHospitalSpecialTreatment[] {
  const result: NormalizedHospitalSpecialTreatment[] = [];
  for (const row of rows) {
    const hospitalSourceId = str(row['암호화요양기호']);
    const searchCode = str(row['검색코드']);
    if (!hospitalSourceId || !searchCode) continue;
    result.push({ hospitalSourceId, searchCode, searchName: str(row['검색코드명']) });
  }
  return result;
}

export function parseSpecialtyRows(rows: Record<string, unknown>[]): NormalizedHospitalSpecialty[] {
  const result: NormalizedHospitalSpecialty[] = [];
  for (const row of rows) {
    const hospitalSourceId = str(row['암호화요양기호']);
    const searchCode = str(row['검색코드']);
    if (!hospitalSourceId || !searchCode) continue;
    result.push({ hospitalSourceId, searchCode, searchName: str(row['검색코드명']) });
  }
  return result;
}

export function parseStaffRows(rows: Record<string, unknown>[]): NormalizedHospitalStaff[] {
  const result: NormalizedHospitalStaff[] = [];
  for (const row of rows) {
    const hospitalSourceId = str(row['암호화요양기호']);
    const staffCode = str(row['기타인력코드']);
    if (!hospitalSourceId || !staffCode) continue;
    result.push({ hospitalSourceId, staffCode, staffName: str(row['기타인력코드명']), staffCount: intOrNull(row['기타인력수']) });
  }
  return result;
}
