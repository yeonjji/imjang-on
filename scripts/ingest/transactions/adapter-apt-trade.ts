import { parseXml, getItems, getTotalCount, parseCommaNumber, parseYmd } from '@/scripts/ingest/xml-parse';
import { PropertyType, DealType } from '@prisma/client';
import type { Adapter, NormalizedTransaction } from '@/scripts/ingest/types';

function parseYmdString(s: string): Date | null {
  if (s.length !== 8) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

export const adapterAptTrade: Adapter = {
  apiType: 'apt-trade',
  endpoint: 'RTMSDataSvcAptTrade',
  source: 'molit-apt-trade',
  parseRows(xml: string, sigunguCode: string) {
    const parsed = parseXml(xml);
    const items = getItems(parsed);
    const totalCount = getTotalCount(parsed);
    const rows: NormalizedTransaction[] = items.map((item: any) => ({
      propertyType: PropertyType.APARTMENT,
      dealType: DealType.SALE,
      name: String(item.aptNm ?? '').trim(),
      buildYear: item.buildYear ? Number(item.buildYear) : null,
      contractDate: parseYmd(item.dealYear, item.dealMonth, item.dealDay) ?? new Date(),
      exclusiveArea: Number(item.excluUseAr ?? 0),
      floor: item.floor ? Number(item.floor) : null,
      dealAmount: parseCommaNumber(item.dealAmount),
      registerDate: item.rgstDate ? parseYmdString(String(item.rgstDate)) : null,
      dealingType: item.dealingGbn ? String(item.dealingGbn) : null,
      buyerType: item.buyerGbn ? String(item.buyerGbn) : null,
      sellerType: item.slerGbn ? String(item.slerGbn) : null,
      cancelDate: item.cdealDay ? parseYmdString(String(item.cdealDay)) : null,
      cancelType: item.cdealType ? String(item.cdealType) : null,
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
      externalKey: item.aptSeq ? String(item.aptSeq) : null,
    }));
    return { rows, totalCount };
  },
};
