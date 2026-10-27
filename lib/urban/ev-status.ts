import { XMLParser } from 'fast-xml-parser';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { ChargerUnitStatus } from './ev-status-shared';

// 클라이언트에서도 쓰는 순수 헬퍼·타입은 env를 끌고 가지 않도록 ev-status-shared에 둔다.
export * from './ev-status-shared';

// getChargerInfo를 사용해 특정 충전소의 현재 상태를 조회한다.
// getChargerStatus는 period(최대 10분) 이내 갱신된 충전기만 반환하므로
// 최근 갱신 없는 충전기는 빈 응답을 보내 모두 "미확인"처럼 보이는 문제가 생긴다.
const BASE_URL = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo';

// 공식 API 가이드 v1.25 기준 stat 코드. 2(가이드 표기 '충전대기')는 이용자에게 익숙한 '사용가능'으로 쓴다.
const STAT_LABELS: Record<string, string> = {
  '0': '알수없음',
  '1': '통신이상',
  '2': '사용가능',
  '3': '충전중',
  '4': '운영중지',
  '5': '점검중',
  '6': '예약중',
  '9': '상태미확인',
};

// 원천 API가 가끔 응답 없이 수십 초 멈춘다(2026-10-27 실측: 같은 충전소가 0.2초~30초 이상).
// 사용자를 붙잡지 않도록 짧게 끊고 한 번만 다시 시도한다.
const TIMEOUT_MS = 6_000;
const ATTEMPTS = 2;

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });

type Parsed = { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: unknown } } };

/**
 * 충전소의 충전기별 현재 상태. 조회 결과 0건은 빈 배열(원천에 그 충전소가 없음),
 * 시간 초과·HTTP 오류·resultCode≠00(한도 초과 등)은 null(일시 실패)로 구분한다.
 */
export async function fetchChargerStatus(statId: string): Promise<ChargerUnitStatus[] | null> {
  const serviceKey = env.PUBLIC_DATA_KEY;
  if (!serviceKey) return null;

  const url = new URL(BASE_URL);
  url.searchParams.set('serviceKey', serviceKey);
  url.searchParams.set('statId', statId);
  url.searchParams.set('numOfRows', '9999');
  url.searchParams.set('pageNo', '1');

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        logger.warn({ statId, attempt, status: res.status }, 'ev-status http error');
        continue;
      }
      const parsed = parser.parse(await res.text()) as Parsed;
      const header = parsed?.response?.header;
      if (String(header?.resultCode ?? '') !== '00') {
        logger.warn({ statId, attempt, resultCode: header?.resultCode, resultMsg: header?.resultMsg }, 'ev-status api error');
        continue;
      }
      return toStatuses(parsed.response?.body?.items);
    } catch (err) {
      logger.warn({ statId, attempt, err }, 'ev-status fetch failed');
    }
  }
  return null;
}

function toStatuses(items: unknown): ChargerUnitStatus[] {
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
}
