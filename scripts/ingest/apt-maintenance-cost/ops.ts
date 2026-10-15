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

/**
 * sum: item의 fields(명세 Swagger의 금액 필드)만 더해 group에 누적. 명세에 없는 필드는 무시한다 —
 * 응답에 일련번호·날짜 같은 숫자 필드가 끼면 합계가 부풀기 때문이다.
 * ltr: item[key] 하나를 field에 그대로.
 */
export type CostOp =
  | { service: string; op: string; kind: 'sum'; group: SumGroup; fields: readonly string[] }
  | { service: string; op: string; kind: 'ltr'; field: LtrField; key: string };

const sum = (service: string, op: string, group: SumGroup, fields: readonly string[]): CostOp => ({
  service, op, kind: 'sum', group, fields,
});
const ltr = (op: string, field: LtrField, key: string): CostOp => ({ service: REP, op, kind: 'ltr', field, key });

export const COST_OPS: readonly CostOp[] = [
  sum(CMN, 'getHsmpLaborCostInfoV3', 'labor', ['pay', 'sundryCost', 'bonus', 'pension', 'welfareBenefit', 'accidentPremium', 'employPremium', 'nationalPension', 'healthPremium']),
  sum(CMN, 'getHsmpTaxdueInfoV3', 'commonEtc', ['taxrestCost', 'electCost', 'telCost', 'postageCost']),
  sum(CMN, 'getHsmpVhcleMntncCostInfoV3', 'commonEtc', ['fuelCost', 'refairCost', 'carInsurance', 'carEtc']),
  sum(CMN, 'getHsmpEtcCostInfoV3', 'commonEtc', ['hiddenCost', 'careItemCost', 'accountingCost']),
  sum(CMN, 'getHsmpOfcrkCostInfoV3', 'commonEtc', ['officeSupply', 'bookSupply', 'transportCost']),
  sum(CMN, 'getHsmpClothingCostInfoV3', 'commonEtc', ['clothesCost']),
  sum(CMN, 'getHsmpEduTraingCostInfoV3', 'commonEtc', ['eduCost']),
  sum(CMN, 'getHsmpCleaningCostInfoV3', 'cleaning', ['cleanCost']),
  sum(CMN, 'getHsmpGuardCostInfoV3', 'guard', ['guardCost']),
  sum(CMN, 'getHsmpDisinfectionCostInfoV3', 'disinfection', ['disinfCost']),
  sum(CMN, 'getHsmpElevatorMntncCostInfoV3', 'elevator', ['elevCost']),
  sum(CMN, 'getHsmpHomeNetworkMntncCostInfoV3', 'homeNetwork', ['hnetwCost']),
  sum(CMN, 'getHsmpRepairsCostInfoV3', 'repairs', ['lrefCost1']),
  sum(CMN, 'getHsmpFacilityMntncCostInfoV3', 'repairs', ['lrefCost2']),
  sum(CMN, 'getHsmpSafetyCheckUpCostInfoV3', 'repairs', ['lrefCost3']),
  sum(CMN, 'getHsmpDisasterPreventionCostInfoV3', 'repairs', ['lrefCost4']),
  sum(CMN, 'getHsmpConsignManageFeeInfoV3', 'consignFee', ['manageCost']),
  sum(IND, 'getHsmpHeatCostInfoV3', 'heat', ['heatP', 'heatC']),
  sum(IND, 'getHsmpHotWaterCostInfoV3', 'hotWater', ['waterHotP', 'waterHotC']),
  sum(IND, 'getHsmpGasRentalFeeInfoV3', 'gas', ['gasP', 'gasC']),
  sum(IND, 'getHsmpElectricityCostInfoV3', 'electricity', ['electP', 'electC']),
  sum(IND, 'getHsmpWaterCostInfoV3', 'water', ['waterCoolP', 'waterCoolC']),
  sum(IND, 'getHsmpDomesticWasteFeeInfoV3', 'individualEtc', ['scrap']),
  sum(IND, 'getHsmpMovingInRepresentationMtgInfoV3', 'individualEtc', ['preMeet']),
  sum(IND, 'getHsmpBuildingInsuranceFeeInfoV3', 'individualEtc', ['buildInsu']),
  sum(IND, 'getHsmpElectionOrpnsInfoV3', 'individualEtc', ['electionMng']),
  sum(IND, 'getHsmpWaterPurifierTankFeeInfoV3', 'individualEtc', ['purifi']),
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
