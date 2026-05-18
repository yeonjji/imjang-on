import { parseXml, getItems, getTotalCount, parseCommaNumber, parseYmd } from '@/scripts/ingest/xml-parse';
import { PropertyType, DealType } from '@prisma/client';
import type { Adapter, NormalizedTransaction } from '@/scripts/ingest/types';

export const adapterAptRent: Adapter = {
  apiType: 'apt-rent',
  endpoint: 'RTMSDataSvcAptRent',
  source: 'molit-apt-rent',
  parseRows(xml: string, sigunguCode: string) {
    const parsed = parseXml(xml);
    const items = getItems(parsed);
    const totalCount = getTotalCount(parsed);
    const rows: NormalizedTransaction[] = items.map((item: any) => {
      const monthlyRent = parseCommaNumber(item.monthlyRent) ?? 0;
      const dealType = monthlyRent > 0 ? DealType.WOLSE : DealType.JEONSE;
      return {
        propertyType: PropertyType.APARTMENT,
        dealType,
        name: String(item.aptNm ?? '').trim(),
        buildYear: item.buildYear ? Number(item.buildYear) : null,
        contractDate: parseYmd(item.dealYear, item.dealMonth, item.dealDay) ?? new Date(),
        exclusiveArea: Number(item.excluUseAr ?? 0),
        floor: item.floor ? Number(item.floor) : null,
        dealAmount: null,
        registerDate: null,
        dealingType: null,
        buyerType: null,
        sellerType: null,
        cancelDate: null,
        cancelType: null,
        deposit: parseCommaNumber(item.deposit),
        monthlyRent,
        contractTerm: item.contractTerm ? String(item.contractTerm) : null,
        contractType: item.contractType ? String(item.contractType) : null,
        useRRRight: item.useRRRight ? String(item.useRRRight) === 'Y' : null,
        preDeposit: parseCommaNumber(item.preDeposit),
        preMonthlyRent: parseCommaNumber(item.preMonthlyRent),
        sigunguCode,
        umd: item.umdNm ? String(item.umdNm) : null,
        jibun: item.jibun ? String(item.jibun) : null,
        roadName: item.roadNm ? String(item.roadNm) : null,
        externalKey: null,
      };
    });
    return { rows, totalCount };
  },
};
