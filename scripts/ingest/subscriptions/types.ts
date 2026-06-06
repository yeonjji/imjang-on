import type { SubscriptionSource, SubscriptionCategory } from '@prisma/client';

// 정규화된 공고 1건 (DB SubscriptionNotice 와 1:1, location 은 lat/lng 로 보관)
export interface NormalizedNotice {
  source: SubscriptionSource;
  category: SubscriptionCategory;
  sourceKey: string;
  houseManageNo: string | null;
  pblancNo: string | null;
  panId: string | null;
  origNoticeKey: string | null;
  name: string;
  status: string | null;
  regionCode: string | null;
  regionName: string | null;
  address: string | null;
  totalSupply: number | null;
  noticeDate: Date | null;
  receiptBegin: Date | null;
  receiptEnd: Date | null;
  winnerDate: Date | null;
  contractBegin: Date | null;
  contractEnd: Date | null;
  moveInYm: string | null;
  homepage: string | null;
  noticeUrl: string | null;
  developer: string | null;
  constructor: string | null;
  tel: string | null;
  lat: number | null;
  lng: number | null;
  rawJson: unknown;
  contentHash?: string;
}

// 정규화된 주택형별 1건 (notice 와 함께 묶여 전달됨)
export interface NormalizedUnit {
  modelNo: string | null;
  houseType: string | null;
  area: number | null;
  generalSupply: number | null;
  specialSupply: number | null;
  topAmount: number | null;
  rawJson: unknown;
}

// 한 공고 + 그 주택형별
export interface NoticeWithUnits {
  notice: NormalizedNotice;
  units: NormalizedUnit[];
}

// DB에서 diff 비교용으로 가볍게 로드한 기존 공고 상태
export interface ExistingNotice {
  contentHash: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

// runner --source 값
export type SubscriptionSourceKey =
  | 'apt'
  | 'urbty'
  | 'remndr'
  | 'pblpvt'
  | 'opt'
  | 'lh';

// IngestionRun.source 식별자
export const SUBSCRIPTION_INGEST_SOURCE: Record<SubscriptionSourceKey, string> = {
  apt: 'subscription-apt',
  urbty: 'subscription-urbty',
  remndr: 'subscription-remndr',
  pblpvt: 'subscription-pblpvt',
  opt: 'subscription-opt',
  lh: 'subscription-lh',
};
