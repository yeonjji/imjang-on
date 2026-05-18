import { parseXml, getItems, getTotalCount, parseCommaNumber, parseYmd } from '@/scripts/ingest/xml-parse';
import { PropertyType, DealType } from '@prisma/client';
import type { Adapter, NormalizedTransaction } from '@/scripts/ingest/types';

export const adapterOffiTrade: Adapter = {
  apiType: 'offi-trade',
  endpoint: 'RTMSDataSvcOffiTrade',
  source: 'molit-offi-trade',
  parseRows(xml: string, sigunguCode: string) {
    const parsed = parseXml(xml);
    const items = getItems(parsed);
    const totalCount = getTotalCount(parsed);
    const rows: NormalizedTransaction[] = items.map((item: any) => ({
      propertyType: PropertyType.OFFICETEL,
      dealType: DealType.SALE,
      name: String(item.offiNm ?? item.aptNm ?? '').trim(),
      buildYear: item.buildYear ? Number(item.buildYear) : null,
      contractDate: parseYmd(item.dealYear, item.dealMonth, item.dealDay) ?? new Date(),
      exclusiveArea: Number(item.excluUseAr ?? 0),
      floor: item.floor ? Number(item.floor) : null,
      dealAmount: parseCommaNumber(item.dealAmount),
      registerDate: null,
      dealingType: item.dealingGbn ? String(item.dealingGbn) : null,
      buyerType: item.buyerGbn ? String(item.buyerGbn) : null,
      sellerType: item.slerGbn ? String(item.slerGbn) : null,
      cancelDate: null,
      cancelType: null,
      deposit: null,
      monthlyRent: null,
      contractTerm: null,
      contractType: null,
      useRRRight: null,
      preDeposit: null,
      preMonthlyRent: null,
      sigunguCode,
      umd: item.umdNm ? String(item.umdNm) : null,
      jibun: item.jibun ? String(item.jibun) : null,
      roadName: item.roadNm ? String(item.roadNm) : null,
      externalKey: null,
    }));
    return { rows, totalCount };
  },
};
