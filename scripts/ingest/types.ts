import type { DealType, PropertyType } from '@prisma/client';

export type ApiType =
  | 'apt-trade'
  | 'apt-rent'
  | 'offi-trade'
  | 'offi-rent'
  | 'rh-trade'
  | 'rh-rent';

export interface NormalizedTransaction {
  propertyType: PropertyType;
  dealType: DealType;
  name: string;
  buildYear: number | null;
  contractDate: Date;
  exclusiveArea: number;
  floor: number | null;

  dealAmount: number | null;
  registerDate: Date | null;
  dealingType: string | null;
  buyerType: string | null;
  sellerType: string | null;
  cancelDate: Date | null;
  cancelType: string | null;

  deposit: number | null;
  monthlyRent: number | null;
  contractTerm: string | null;
  contractType: string | null;
  useRRRight: boolean | null;
  preDeposit: number | null;
  preMonthlyRent: number | null;

  sigunguCode: string;
  umd: string | null;
  jibun: string | null;
  roadName: string | null;
  externalKey: string | null;
}

export interface FetchPage {
  rows: NormalizedTransaction[];
  totalCount: number;
}

export interface Adapter {
  apiType: ApiType;
  endpoint: string;
  source: string;
  parseRows: (xml: string, sigunguCode: string) => FetchPage;
}

export type Mode = 'daily' | 'backfill';
