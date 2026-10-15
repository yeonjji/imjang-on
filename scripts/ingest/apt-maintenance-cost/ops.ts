/**
 * K-apt 관리비 API 3종의 오퍼레이션. 단지 × 연월 1회 수집에 31번 호출한다.
 *
 * 개별사용료 오퍼레이션명은 Swagger 명세에 `...InfoV2`로 적혀 있지만 실제로는 V3다
 * (V2는 NO_OPENAPI_SERVICE_ERROR, 2026-10-15 실호출 확인).
 */
export const CMN = 'AptCmnuseManageCostServiceV3';
export const IND = 'AptIndvdlzManageCostServiceV3';
export const REP = 'AptRepairsCostServiceV3';

export type SumGroup =
  | 'labor' | 'cleaning' | 'guard' | 'disinfection' | 'elevator' | 'homeNetwork' | 'consignFee' | 'repairs' | 'commonEtc'
  | 'heat' | 'hotWater' | 'gas' | 'electricity' | 'water' | 'individualEtc';

export type LtrField = 'ltrLevy' | 'ltrUse' | 'ltrBalance' | 'ltrRate';

/** sum: item의 금액 필드를 모두 더해 group에 누적. ltr: item[key] 하나를 field에 그대로. */
export type CostOp =
  | { service: string; op: string; kind: 'sum'; group: SumGroup }
  | { service: string; op: string; kind: 'ltr'; field: LtrField; key: string };

const sum = (service: string, op: string, group: SumGroup): CostOp => ({ service, op, kind: 'sum', group });
const ltr = (op: string, field: LtrField, key: string): CostOp => ({ service: REP, op, kind: 'ltr', field, key });

export const COST_OPS: readonly CostOp[] = [
  sum(CMN, 'getHsmpLaborCostInfoV3', 'labor'),
  sum(CMN, 'getHsmpTaxdueInfoV3', 'commonEtc'),
  sum(CMN, 'getHsmpVhcleMntncCostInfoV3', 'commonEtc'),
  sum(CMN, 'getHsmpEtcCostInfoV3', 'commonEtc'),
  sum(CMN, 'getHsmpOfcrkCostInfoV3', 'commonEtc'),
  sum(CMN, 'getHsmpClothingCostInfoV3', 'commonEtc'),
  sum(CMN, 'getHsmpEduTraingCostInfoV3', 'commonEtc'),
  sum(CMN, 'getHsmpCleaningCostInfoV3', 'cleaning'),
  sum(CMN, 'getHsmpGuardCostInfoV3', 'guard'),
  sum(CMN, 'getHsmpDisinfectionCostInfoV3', 'disinfection'),
  sum(CMN, 'getHsmpElevatorMntncCostInfoV3', 'elevator'),
  sum(CMN, 'getHsmpHomeNetworkMntncCostInfoV3', 'homeNetwork'),
  sum(CMN, 'getHsmpRepairsCostInfoV3', 'repairs'),
  sum(CMN, 'getHsmpFacilityMntncCostInfoV3', 'repairs'),
  sum(CMN, 'getHsmpSafetyCheckUpCostInfoV3', 'repairs'),
  sum(CMN, 'getHsmpDisasterPreventionCostInfoV3', 'repairs'),
  sum(CMN, 'getHsmpConsignManageFeeInfoV3', 'consignFee'),
  sum(IND, 'getHsmpHeatCostInfoV3', 'heat'),
  sum(IND, 'getHsmpHotWaterCostInfoV3', 'hotWater'),
  sum(IND, 'getHsmpGasRentalFeeInfoV3', 'gas'),
  sum(IND, 'getHsmpElectricityCostInfoV3', 'electricity'),
  sum(IND, 'getHsmpWaterCostInfoV3', 'water'),
  sum(IND, 'getHsmpDomesticWasteFeeInfoV3', 'individualEtc'),
  sum(IND, 'getHsmpMovingInRepresentationMtgInfoV3', 'individualEtc'),
  sum(IND, 'getHsmpBuildingInsuranceFeeInfoV3', 'individualEtc'),
  sum(IND, 'getHsmpElectionOrpnsInfoV3', 'individualEtc'),
  sum(IND, 'getHsmpWaterPurifierTankFeeInfoV3', 'individualEtc'),
  ltr('getHsmpMonthFeeInfoV3', 'ltrLevy', 'sLevy'),
  ltr('getHsmpMonthRetalFeeInfoV3', 'ltrUse', 'sUse'),
  ltr('getHsmpReserveBalanceInfoV3', 'ltrBalance', 'sTot'),
  ltr('getHsmpAccumulationTariffInfoV3', 'ltrRate', 'sPer'),
];

/** 공용관리비 = 이 묶음의 합(㎡당 비교의 분자). */
export const COMMON_GROUPS: readonly SumGroup[] = [
  'labor', 'cleaning', 'guard', 'disinfection', 'elevator', 'homeNetwork', 'consignFee', 'repairs', 'commonEtc',
];
export const INDIVIDUAL_GROUPS: readonly SumGroup[] = ['heat', 'hotWater', 'gas', 'electricity', 'water', 'individualEtc'];
