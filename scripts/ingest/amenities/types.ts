// scripts/ingest/amenities/types.ts

export interface NormalizedEvCharger {
  sourceId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  chargeSpeed: string;
  chargerCount: number;
  operatorName: string | null;
}

export interface NormalizedEvChargerUnit {
  sourceId: string;        // statId-chgerId
  stationSourceId: string; // statId
  chgerId: string;
  chgerType: string;
  isFast: boolean;
}

export interface NormalizedTraditionalMarket {
  sourceId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  marketType: string | null;
}

export interface NormalizedStore {
  sourceId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  industryCode: string | null;
  industryName: string | null;
  sigunguCode: string;
}

export interface NormalizedPark {
  sourceId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  parkType: string | null;
  area: number | null;
  referenceDate: Date | null;
}

export interface NormalizedSchool {
  sourceId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  schoolKind: string | null;
  foundType: string | null;
  coeduType: string | null;
  region: string | null;
  eduOffice: string | null;
  tel: string | null;
  homepage: string | null;
}

export interface NormalizedChildcare {
  sourceId: string;
  name: string;
  crType: string | null;
  status: string | null;
  vehicleOp: string | null;
  services: string | null;
  sido: string | null;
  sigungu: string | null;
  sigunguCode: string;
  zipcode: string | null;
  address: string;
  tel: string | null;
  fax: string | null;
  homepage: string | null;
  repName: string | null;
  lat: number | null;
  lng: number | null;
  roomCount: number | null;
  roomSize: number | null;
  playgroundCount: number | null;
  cctvCount: number | null;
  staffCount: number | null;
  capacity: number | null;
  currentCount: number | null;
  confirmDate: Date | null;
  pauseBeginDate: Date | null;
  pauseEndDate: Date | null;
  abolishDate: Date | null;
  dataStdDate: Date | null;
  classCnt00: number | null;
  classCnt01: number | null;
  classCnt02: number | null;
  classCnt03: number | null;
  classCnt04: number | null;
  classCnt05: number | null;
  classCntM2: number | null;
  classCntM3: number | null;
  classCntM5: number | null;
  classCntSp: number | null;
  classCntTot: number | null;
  childCnt00: number | null;
  childCnt01: number | null;
  childCnt02: number | null;
  childCnt03: number | null;
  childCnt04: number | null;
  childCnt05: number | null;
  childCntM2: number | null;
  childCntM3: number | null;
  childCntM5: number | null;
  childCntSp: number | null;
  childCntTot: number | null;
  emTenure0y: number | null;
  emTenure1y: number | null;
  emTenure2y: number | null;
  emTenure4y: number | null;
  emTenure6y: number | null;
  emRoleDirector: number | null;
  emRoleTeacher: number | null;
  emRoleSpecial: number | null;
  emRoleTherapy: number | null;
  emRoleNutrition: number | null;
  emRoleNurse: number | null;
  emRoleNurseAssist: number | null;
  emRoleCook: number | null;
  emRoleOffice: number | null;
  emRoleTot: number | null;
  waitCnt00: number | null;
  waitCnt01: number | null;
  waitCnt02: number | null;
  waitCnt03: number | null;
  waitCnt04: number | null;
  waitCnt05: number | null;
  waitCntM6: number | null;
  waitCntTot: number | null;
}

export interface NormalizedParking {
  sourceId: string;
  name: string;
  prkplceSe: string | null;
  prkplceType: string | null;
  rdnmadr: string | null;
  lnmadr: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  prkcmprt: number | null;
  feedingSe: string | null;
  enforceSe: string | null;
  operDay: string | null;
  weekdayOpenHhmm: string | null;
  weekdayCloseHhmm: string | null;
  satOpenHhmm: string | null;
  satCloseHhmm: string | null;
  holidayOpenHhmm: string | null;
  holidayCloseHhmm: string | null;
  chargeInfo: string | null;
  basicTime: number | null;
  basicCharge: number | null;
  addUnitTime: number | null;
  addUnitCharge: number | null;
  dayCmmtkt: number | null;
  monthCmmtkt: number | null;
  metpay: string | null;
  spcmnt: string | null;
  pwdbsPpkZoneYn: boolean | null;
  institutionNm: string | null;
  phoneNumber: string | null;
  insttCode: string | null;
  insttNm: string | null;
  referenceDate: Date | null;
}

export interface NormalizedHospital {
  sourceId: string;
  name: string;
  typeCode: string;
  typeName: string;
  sido: string | null;
  sigungu: string | null;
  sigunguCode: string | null;
  eupmyeondong: string | null;
  zipcode: string | null;
  address: string;
  tel: string | null;
  homepage: string | null;
  openedAt: Date | null;
  totalDoctors: number | null;
  drMedGeneral: number | null;
  drMedIntern: number | null;
  drMedResident: number | null;
  drMedSpecialist: number | null;
  drDentGeneral: number | null;
  drDentIntern: number | null;
  drDentResident: number | null;
  drDentSpecialist: number | null;
  drKorGeneral: number | null;
  drKorIntern: number | null;
  drKorResident: number | null;
  drKorSpecialist: number | null;
  midwifeCount: number | null;
  lat: number | null;
  lng: number | null;
}

export interface NormalizedHospitalFacility {
  hospitalSourceId: string;
  foundTypeCode: string | null;
  foundTypeName: string | null;
  generalBedPremium: number | null;
  generalBedNormal: number | null;
  icuAdultBed: number | null;
  icuPediatricBed: number | null;
  icuNeonatalBed: number | null;
  deliveryBed: number | null;
  operatingRoomBed: number | null;
  erBed: number | null;
  physicalTherapyBed: number | null;
  psychiatryClosedPremium: number | null;
  psychiatryClosedNormal: number | null;
  psychiatryOpenPremium: number | null;
  psychiatryOpenNormal: number | null;
  isolationBed: number | null;
  sterileRoomBed: number | null;
}

export interface NormalizedHospitalDetail {
  hospitalSourceId: string;
  locationBuilding: string | null;
  locationDirection: string | null;
  locationDistance: string | null;
  parkingCapacity: number | null;
  parkingFee: string | null;
  parkingNote: string | null;
  closedSunday: string | null;
  closedHoliday: string | null;
  erDayOpen: string | null;
  erDayTel1: string | null;
  erDayTel2: string | null;
  erNightOpen: string | null;
  erNightTel1: string | null;
  erNightTel2: string | null;
  lunchWeekday: string | null;
  lunchSaturday: string | null;
  receptionWeekday: string | null;
  receptionSaturday: string | null;
  openSun: number | null;
  closeSun: number | null;
  openMon: number | null;
  closeMon: number | null;
  openTue: number | null;
  closeTue: number | null;
  openWed: number | null;
  closeWed: number | null;
  openThu: number | null;
  closeThu: number | null;
  openFri: number | null;
  closeFri: number | null;
  openSat: number | null;
  closeSat: number | null;
}

export interface NormalizedHospitalDept {
  hospitalSourceId: string;
  deptCode: string;
  deptName: string;
  specialistCount: number | null;
  optionalDoctorCount: number | null;
}

export interface NormalizedHospitalTransit {
  hospitalSourceId: string;
  transitName: string | null;
  routeNumber: string | null;
  stopPoint: string | null;
  direction: string | null;
  distance: string | null;
  note: string | null;
}

export interface NormalizedHospitalEquipment {
  hospitalSourceId: string;
  equipCode: string;
  equipName: string;
  equipCount: number | null;
}

export interface NormalizedHospitalMealSurcharge {
  hospitalSourceId: string;
  typeCode: string;
  typeName: string;
  hasGeneral: string | null;
  staffCount: number | null;
  treatmentGrade: string | null;
}

export interface NormalizedHospitalNursingGrade {
  hospitalSourceId: string;
  typeCode: string;
  typeName: string;
  nursingGrade: string | null;
}

export interface NormalizedHospitalSpecialTreatment {
  hospitalSourceId: string;
  searchCode: string;
  searchName: string;
}

export interface NormalizedHospitalSpecialty {
  hospitalSourceId: string;
  searchCode: string;
  searchName: string;
}

export interface NormalizedHospitalStaff {
  hospitalSourceId: string;
  staffCode: string;
  staffName: string;
  staffCount: number | null;
}

export interface NormalizedPharmacy {
  sourceId: string;
  name: string;
  typeCode: string | null;
  typeName: string | null;
  sido: string | null;
  sigungu: string | null;
  sigunguCode: string | null;
  eupmyeondong: string | null;
  zipcode: string | null;
  address: string;
  tel: string | null;
  openedAt: Date | null;
  lat: number | null;
  lng: number | null;
}

export type AmenitySourceKey =
  | 'ev-charger'
  | 'traditional-market'
  | 'store'
  | 'park'
  | 'school'
  | 'childcare'
  | 'parking';

export const AMENITY_INGEST_SOURCE: Record<AmenitySourceKey, string> = {
  'ev-charger': 'amenity-ev-charger',
  'traditional-market': 'amenity-traditional-market',
  'store': 'amenity-store',
  'park': 'amenity-park',
  'school': 'amenity-school',
  'childcare': 'amenity-childcare',
  'parking': 'amenity-parking',
};
