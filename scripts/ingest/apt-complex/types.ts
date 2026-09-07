/** IngestionRun.source 값. */
export const APT_COMPLEX_SOURCE = 'apt-complex';

/** 목록 API 1행 → AptComplex 목록 필드. */
export interface AptListRow {
  kaptCode: string;
  kaptName: string;
  nameNorm: string;
  bjdCode: string;
  sigunguCode: string;
  as3: string | null;
}

/** 기본정보+상세정보 병합 → AptComplex 상세 필드. */
export interface AptDetailRow {
  kaptCode: string;
  households: number | null;
  buildingCount: number | null;
  usedate: Date | null;
  hallType: string | null;
  heatType: string | null;
  aptKind: string | null;
  topFloor: number | null;
  baseFloor: number | null;
  area60: number | null;
  area85: number | null;
  area135: number | null;
  area136: number | null;
  parkingGround: number | null;
  parkingUnder: number | null;
  subwayLine: string | null;
  subwayStation: string | null;
  walkSubway: string | null;
  walkBus: string | null;
  evGround: number | null;
  evUnder: number | null;
  elevator: number | null;
  cctv: number | null;
  builder: string | null;
  welfareFacility: string | null;
  convenientFacility: string | null;
  educationFacility: string | null;
  inUse: boolean;
  rawJson: Record<string, unknown>;
}
