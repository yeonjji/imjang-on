export type HubScopeLevel = 'nation' | 'sido' | 'sigungu';

export interface HubRegionCount {
  name: string;
  count: number;
}

export interface HubSummaryData {
  kind: 'amenity' | 'medical' | 'property';
  categoryLabel: string;   // "카페", "병원·의원", "오피스텔"
  scopeLabel: string;      // "서울", "전국", "서울특별시 강남구"
  scopeLevel: HubScopeLevel;
  total: number;
  topRegions: HubRegionCount[]; // 집계 단위는 scopeLevel이 결정 (nation→시도, sido→시군구)
  concentrationPct?: number;    // 상위 3개 지역이 전체에서 차지하는 비중(%)
}
