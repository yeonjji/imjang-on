import { parseXml, getItems, getTotalCount, parseCommaNumber, parseYmd } from '@/scripts/ingest/xml-parse';
import { PropertyType, DealType } from '@prisma/client';
import type { Adapter, NormalizedTransaction } from '@/scripts/ingest/types';

/**
 * 국토부 날짜 문자열 → Date(UTC). 등기일(rgstDate)·해제일(cdealDay)은 'YY.MM.DD'(예: 26.09.09)로 온다.
 * 예전 파서는 8자리 YYYYMMDD만 가정해 'YY.MM.DD'를 19YY년으로 읽었다(운영 해제일 32,821건이 전부 1923~1926년).
 * YYYYMMDD도 계속 받는다. 실재하지 않는 날짜(13월 등)는 null.
 */
export function parseMolitDate(raw: string): Date | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(s);
  if (match) {
    y = 2000 + Number(match[1]); m = Number(match[2]); d = Number(match[3]);
  } else if ((match = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) {
    y = Number(match[1]); m = Number(match[2]); d = Number(match[3]);
  } else {
    return null;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
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
      registerDate: item.rgstDate ? parseMolitDate(String(item.rgstDate)) : null,
      dealingType: item.dealingGbn ? String(item.dealingGbn) : null,
      buyerType: item.buyerGbn ? String(item.buyerGbn) : null,
      sellerType: item.slerGbn ? String(item.slerGbn) : null,
      cancelDate: item.cdealDay ? parseMolitDate(String(item.cdealDay)) : null,
      cancelType: item.cdealType && String(item.cdealType).trim() ? String(item.cdealType).trim() : null,
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
