import { XMLParser } from 'fast-xml-parser';
import { env } from '@/lib/env';

const BASE_URL = 'https://apis.data.go.kr/B552584/EvCharger/getChargerStatus';

const STAT_LABELS: Record<string, string> = {
  '1': '이용가능',
  '2': '충전중',
  '3': '운영중지',
  '4': '점검중',
  '9': '미확인',
};

export interface ChargerUnitStatus {
  chgerId: string;
  stat: string;
  statLabel: string;
  lastTsdt: string | null;
}

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: true, trimValues: true });

export async function fetchChargerStatus(statId: string): Promise<ChargerUnitStatus[]> {
  const serviceKey = env.PUBLIC_DATA_KEY;
  if (!serviceKey) return [];

  const url = new URL(BASE_URL);
  url.searchParams.set('serviceKey', serviceKey);
  url.searchParams.set('statId', statId);
  url.searchParams.set('numOfRows', '9999');
  url.searchParams.set('pageNo', '1');

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const xml = await res.text();
    const parsed = parser.parse(xml) as { response?: { body?: { items?: unknown } } };
    const items = parsed?.response?.body?.items as Record<string, unknown> | string | undefined;
    if (!items || items === '') return [];
    const raw = (items as Record<string, unknown>).item;
    if (!raw) return [];
    const itemArr: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw];
    return itemArr.map((item) => {
      const chgerId = String(item.chgerId ?? '').padStart(2, '0');
      const stat = String(item.stat ?? '9');
      return {
        chgerId,
        stat,
        statLabel: STAT_LABELS[stat] ?? '미확인',
        lastTsdt: item.lastTsdt ? String(item.lastTsdt) : null,
      };
    });
  } catch {
    return [];
  }
}
