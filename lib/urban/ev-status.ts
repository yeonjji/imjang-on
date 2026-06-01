import { XMLParser } from 'fast-xml-parser';
import { env } from '@/lib/env';

// getChargerInfo를 사용해 특정 충전소의 현재 상태를 조회한다.
// getChargerStatus는 period(최대 10분) 이내 갱신된 충전기만 반환하므로
// 최근 갱신 없는 충전기는 빈 응답을 보내 모두 "미확인"처럼 보이는 문제가 생긴다.
const BASE_URL = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo';

// 공식 API 가이드 v1.23 기준 stat 코드
const STAT_LABELS: Record<string, string> = {
  '0': '알수없음',
  '1': '통신이상',
  '2': '사용가능',
  '3': '충전중',
  '4': '운영중지',
  '5': '점검중',
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
      const stat = String(item.stat ?? '0');
      return {
        chgerId,
        stat,
        statLabel: STAT_LABELS[stat] ?? '알수없음',
        lastTsdt: item.lastTsdt ? String(item.lastTsdt) : null,
      };
    });
  } catch {
    return [];
  }
}
