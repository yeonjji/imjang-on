import type { FaqItem } from '@/lib/faq/data';
import { josa } from '@/lib/seo/josa';
import { formatParkArea } from '@/lib/urban/adapters/park';
import { parkFacilityGroups, soccerFieldCount } from '@/lib/urban/park-display';
import { normalizeFees, type FeeInput } from '@/lib/urban/parking-fees';
import { formatHourRange, isAllDayOpen24 } from '@/lib/urban/parking-hours';
import { parkingHourBlocks } from '@/lib/urban/parking-display';
import { maxOutputKw } from '@/lib/urban/charger-display';

// 상세 화면과 같은 표시 헬퍼를 써서 FAQ 값이 카드 값과 어긋나지 않게 한다. 값이 없으면 문항 생략.

const PARK_SRC = '행정안전부(전국도시공원표준데이터)';
const PARKING_SRC = '행정안전부(전국주차장표준데이터)';
const EV_SRC = '한국환경공단(전기차 충전소 정보)';

const MAX_FACILITIES = 5;

export interface ParkFaqInput {
  name: string;
  parkType: string | null;
  area: number | null;
  managingOrg: string | null;
  tel: string | null;
  facilityPlay: string | null;
  facilitySport: string | null;
  facilityConvenience: string | null;
  facilityCulture: string | null;
  /** 공원 기본정보 카드와 같은 면적 순위(scope 예: '강남구 근린공원') */
  areaRank: { rank: number; total: number; scope: string } | null;
}

export function buildParkFaq(p: ParkFaqInput): FaqItem[] {
  const items: FaqItem[] = [];
  const nameIs = josa(p.name, '은', '는');

  const area = formatParkArea(p.area);
  if (p.parkType || area) {
    const fields = soccerFieldCount(p.area);
    const sentences: string[] = [];
    if (p.parkType && area) sentences.push(`${nameIs} ${josa(p.parkType, '으로', '로')} 면적은 ${area}입니다.`);
    else if (p.parkType) sentences.push(`${nameIs} ${p.parkType}입니다.`);
    else sentences.push(`${p.name} 면적은 ${area}입니다.`);
    if (fields) sentences.push(`축구장 약 ${fields.toLocaleString('ko-KR')}개 크기입니다.`);
    if (p.areaRank) sentences.push(`${p.areaRank.scope} ${p.areaRank.total}곳 중 면적 ${p.areaRank.rank}위입니다.`);
    items.push({ q: `${nameIs} 어떤 공원인가요?`, a: sentences.join(' '), source: PARK_SRC });
  }

  const groups = parkFacilityGroups(p);
  if (groups.length > 0) {
    const sentences = groups.map((g) => {
      const shown = g.items.slice(0, MAX_FACILITIES).join(', ');
      const more = g.items.length > MAX_FACILITIES ? ` 등 ${g.items.length}종` : '';
      return `${g.label}은 ${shown}${more}입니다.`;
    });
    items.push({
      q: `${p.name}에는 어떤 시설이 있나요?`,
      a: `${sentences.join(' ')} 지자체 등록 기준이라 현장과 다를 수 있습니다.`,
      source: PARK_SRC,
    });
  }

  if (p.managingOrg || p.tel) {
    const a = p.managingOrg
      ? `${josa(p.managingOrg, '이', '가')} 관리합니다.${p.tel ? ` 문의 전화는 ${p.tel}입니다.` : ''}`
      : `문의 전화는 ${p.tel}입니다.`;
    items.push({ q: `${p.name} 관리기관과 문의처는 어디인가요?`, a, source: PARK_SRC });
  }

  return items;
}

export interface ParkingFaqInput extends FeeInput {
  name: string;
  prkplceSe: string | null;
  prkplceType: string | null;
  prkcmprt: number | null;
  weekdayOpenHhmm: string | null;
  weekdayCloseHhmm: string | null;
  satOpenHhmm: string | null;
  satCloseHhmm: string | null;
  holidayOpenHhmm: string | null;
  holidayCloseHhmm: string | null;
}

export function buildParkingFaq(r: ParkingFaqInput): FaqItem[] {
  const items: FaqItem[] = [];
  const nameIs = josa(r.name, '은', '는');

  const fees = normalizeFees(r);
  if (fees.free) {
    items.push({
      q: `${r.name} 요금은 얼마인가요?`,
      a: `${nameIs} 무료 주차장으로 등록돼 있습니다. 요금 정책은 바뀔 수 있어 방문 전 운영기관에 확인하세요.`,
      source: PARKING_SRC,
    });
  } else if (fees.items.length > 0) {
    items.push({
      q: `${r.name} 요금은 얼마인가요?`,
      a: `${fees.items.map((i) => `${i.label} ${i.value}`).join(', ')}입니다. 지자체 등록 기준이라 최근 요금 개정은 늦게 반영될 수 있습니다.`,
      source: PARKING_SRC,
    });
  }

  const b = parkingHourBlocks(r);
  if (isAllDayOpen24(b)) {
    items.push({
      q: `${r.name} 운영시간은 어떻게 되나요?`,
      a: `평일·토요일·공휴일 모두 24시간 운영으로 등록돼 있습니다.`,
      source: PARKING_SRC,
    });
  } else {
    const days: [string, string | null][] = [
      ['평일', formatHourRange(b.weekdayOpen, b.weekdayClose)],
      ['토요일', formatHourRange(b.satOpen, b.satClose)],
      ['공휴일', formatHourRange(b.holidayOpen, b.holidayClose)],
    ];
    const parts = days.filter((x): x is [string, string] => x[1] !== null);
    if (parts.length > 0) {
      items.push({
        q: `${r.name} 운영시간은 어떻게 되나요?`,
        a: `${parts.map(([k, v]) => `${k} ${v}`).join(', ')}입니다.${
          parts.length < days.length ? ' 빠진 요일은 운영시간이 등록되지 않았거나 운영하지 않는 날입니다.' : ''
        }`,
        source: PARKING_SRC,
      });
    }
  }

  if (r.prkcmprt != null && r.prkcmprt > 0) {
    const kind = [r.prkplceSe, r.prkplceType].filter(Boolean).join(' ');
    items.push({
      q: `${r.name}에는 몇 대를 주차할 수 있나요?`,
      a: `주차구획은 ${r.prkcmprt.toLocaleString('ko-KR')}면입니다.${kind ? ` ${kind}주차장으로 등록돼 있습니다.` : ''}`,
      source: PARKING_SRC,
    });
  }

  return items;
}

export interface ChargerFaqInput {
  name: string;
  useTime: string | null;
  parkingFree: boolean | null;
  accessLimited: boolean | null;
  limitDetail: string | null;
  operatorTel: string | null;
  units: { isFast: boolean; outputKw: number | null }[];
}

export function buildChargerFaq(c: ChargerFaqInput): FaqItem[] {
  const items: FaqItem[] = [];
  const nameIs = josa(c.name, '은', '는');

  if (c.units.length > 0) {
    const fast = c.units.filter((u) => u.isFast).length;
    const slow = c.units.length - fast;
    const kw = maxOutputKw(c.units);
    const count = fast > 0
      ? `급속 ${fast}기${slow > 0 ? `, 완속 ${slow}기` : ''}가 있습니다.`
      : `급속 충전기는 없고 완속 ${slow}기가 있습니다.`;
    items.push({
      q: `${c.name}에 급속 충전기가 있나요?`,
      a: `${count}${kw !== null ? ` 최대 출력은 ${kw}kW입니다.` : ''}`,
      source: EV_SRC,
    });
  }

  if (c.useTime || c.parkingFree !== null) {
    // useTime은 원문 그대로라 뒤에 조사를 붙이지 않는다.
    const parts: string[] = [];
    if (c.useTime) parts.push(`등록된 이용 시간은 ${c.useTime}입니다.`);
    if (c.parkingFree !== null) parts.push(`주차료는 ${c.parkingFree ? '무료' : '유료'}로 등록돼 있습니다.`);
    items.push({
      q: `${c.name} 이용 시간과 주차료는 어떻게 되나요?`,
      a: parts.join(' '),
      source: EV_SRC,
    });
  }

  if (c.accessLimited !== null) {
    const tel = c.operatorTel ? ` 운영사 연락처는 ${c.operatorTel}입니다.` : '';
    items.push({
      q: `${nameIs} 누구나 이용할 수 있나요?`,
      a: c.accessLimited
        ? `이용 제한이 있는 충전소입니다. ${c.limitDetail ?? '운영기관에 이용 가능 여부를 확인하세요.'}${tel}`
        : `등록 정보상 이용 제한이 없는 충전소입니다.${tel}`,
      source: EV_SRC,
    });
  }

  return items;
}
