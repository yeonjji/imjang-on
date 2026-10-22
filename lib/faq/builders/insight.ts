import type { FaqItem } from '@/lib/faq/data';
import type { MaintenanceView } from '@/lib/insights/maintenance-cost';
import { won } from '@/lib/insights/maintenance-cost';
import type { SchoolZoneView } from '@/lib/insights/school-zone';
import type { BuildingView } from '@/lib/insights/building-register';
import type { SubscriptionResultsData } from '@/lib/insights/subscription-results';
import { josa } from '@/lib/seo/josa';

/**
 * 상세 FAQ 데이터 해석 문항(순수). spec: docs/superpowers/specs/2026-10-21-detail-faq-dedupe-design.md §2.2
 * 섹션 표시 모델 값을 그대로 문장으로 옮긴다 — 섹션과 FAQ가 다른 숫자를 말하지 않게.
 * 뷰가 없으면 null, 값 없는 문장은 생략. 평가 표현(좋다·유리) 없이 사실·비교만.
 */

// K-apt 난방방식 실측값: 개별·지역·중앙난방 외 '기타'·'개별난방+기타'는 문장으로 쓰면 뜻이 없다.
const HEAT_TYPES = new Set(['개별난방', '지역난방', '중앙난방']);

export function maintenanceFaq(name: string, v: MaintenanceView | null): FaqItem | null {
  if (!v || !v.comparison || v.commonPerM2 === null) return null;
  const c = v.comparison;
  const level =
    c.label === '비슷함'
      ? `${c.sigunguName} 아파트 중앙값(${won(c.medianPerM2)})과 비슷한 수준입니다.`
      : `${c.sigunguName} 아파트 중앙값(${won(c.medianPerM2)})보다 약 ${Math.abs(c.pct)}% ${c.label === '높음' ? '높은' : '낮은'} 수준입니다.`;
  const s = [
    `${v.monthLabel} 부과분 공용관리비는 ㎡당 ${won(v.commonPerM2)}으로, ${level}`,
    `비교 대상은 같은 달 관리비가 공개된 ${c.sigunguName} 아파트 ${c.sampleCount.toLocaleString('ko-KR')}개 단지입니다.`,
  ];
  // '기타'는 크기와 무관하게 맨 뒤에 붙으므로 전체에서 최대를 고르고, 그게 '기타'면 문장을 쓰지 않는다.
  const top = v.commonItems.reduce<(typeof v.commonItems)[number] | null>((m, i) => (!m || i.amount > m.amount ? i : m), null);
  if (top && top.label !== '기타') {
    s.push(`공용관리비 중 가장 큰 항목은 ${josa(top.label, '으로', '로')} ${v.perHousehold ? '세대당' : '단지 전체'} 월 ${won(top.amount)}입니다.`);
  }
  if (v.heatType && HEAT_TYPES.has(v.heatType)) s.push(`난방 방식은 ${v.heatType}입니다.`);
  return {
    q: `${name} 관리비는 같은 ${c.sigunguName} 아파트와 비교하면 어느 수준인가요?`,
    a: s.join(' '),
    source: '국토교통부 공동주택관리정보시스템(K-apt) · 임장ON 계산',
  };
}

export function schoolZoneFaq(name: string, v: SchoolZoneView | null): FaqItem | null {
  if (!v || v.primary.length === 0) return null;
  const s: string[] = [];
  if (v.primary.length === 1) {
    const p = v.primary[0];
    s.push(
      p.distanceLabel
        ? `학구도상 ${p.name} 통학구역에 속하며, 단지 대표 위치에서 직선거리로 ${p.distanceLabel}입니다(임장ON 계산).`
        : `학구도상 ${p.name} 통학구역에 속합니다.`,
    );
  } else {
    const names = v.primary.map((p) => p.name).join('·');
    s.push(
      v.kindLabel
        ? `${v.kindLabel}으로, 학구도상 ${josa(names, '이', '가')} 함께 지정돼 있습니다.`
        : `학구도상 ${josa(names, '이', '가')} 함께 지정된 구역입니다.`,
    );
  }
  if (v.others.length > 0) {
    s.push(`광역통학구역으로 함께 지정된 학교는 ${v.others.map((o) => o.name).join('·')}입니다.`);
  }
  s.push(
    `같은 단지라도 동·호수에 따라 배정이 다를 수 있어, 입학 전에는 ${v.eduName ?? '관할 교육지원청'}에 확인하세요(학구도 기준일 ${v.baseDateLabel}).`,
  );
  return {
    q: `${josa(name, '은', '는')} 어느 초등학교 통학구역인가요?`,
    a: s.join(' '),
    source: '학구도(한국지방교육행정연구재단)',
  };
}

export function buildingFaq(name: string, v: BuildingView | null): FaqItem | null {
  if (!v) return null;
  const tile = (label: string) => v.tiles.find((t) => t.label === label);
  const approved = tile('사용승인');
  const parking = tile('주차');
  if (!approved && !parking) return null;
  const s: string[] = [];
  if (approved) {
    s.push(approved.sub ? `건축물대장상 ${approved.sub}에 사용승인을 받아 ${approved.value}입니다.` : `건축물대장상 사용승인 ${approved.value}입니다.`);
  }
  if (parking) {
    s.push(parking.sub ? `주차는 ${parking.value}(${parking.sub}, 임장ON 계산)입니다.` : `주차는 ${parking.value}입니다.`);
  }
  const scale = tile('규모');
  const elev = tile('승강기');
  const noElev = elev?.value === '0대';
  if (scale && elev) s.push(noElev ? `${scale.value} 건물이고 승강기는 없습니다.` : `${scale.value} 건물에 승강기 ${josa(elev.value, '이', '가')} 있습니다.`);
  else if (scale) s.push(`${scale.value} 건물입니다.`);
  else if (elev) s.push(noElev ? '승강기는 없습니다.' : `승강기는 ${elev.value}입니다.`);
  const purpose = v.rows.find((r) => r.label === '주용도');
  if (purpose) {
    const etc = purpose.note?.startsWith('기타: ') ? `(기타 용도: ${purpose.note.slice(4)})` : '';
    s.push(`주용도는 ${purpose.value}${etc}입니다.`);
  }
  return {
    q: `${josa(name, '은', '는')} 언제 지어졌고 주차는 어떤가요?`,
    a: s.join(' '),
    source: `국토교통부 건축물대장 · ${v.fetchedLabel} 조회`,
  };
}

const rateNum = (r: string) => {
  const n = parseFloat(r.replace(/,/g, ''));
  return Number.isFinite(n) && /^[\d,.]+ : 1$/.test(r) ? n : null;
};
const rateText = (r: string) => r.replace(' : 1', '대 1');

export function subscriptionResultsFaq(name: string, d: SubscriptionResultsData | null): FaqItem | null {
  if (!d) return null;
  const v = d.view;
  const s: string[] = [];
  if (v.kind === 'apt') {
    const m = v.summary;
    if (m.overall) s.push(`1순위 해당지역 전체 경쟁률은 ${m.overall}대 1입니다(임장ON 계산: 접수 합 ÷ 일반공급 합).`);
    if (m.shortfall > 0) {
      s.push(`${v.columns.includes('2순위') ? '2순위까지 접수한 뒤에도' : '최종적으로'} ${m.shortfall.toLocaleString('ko-KR')}세대가 미달됐습니다(청약홈 공식 집계).`);
    } else if (m.top) {
      s.push(`가장 높은 주택형은 ${josa(m.top.type, '으로', '로')} ${m.top.rate}대 1이었습니다.`);
    }
    const special = (v.special ?? [])
      .map((r) => ({ ...r, n: rateNum(r.rate) }))
      .filter((r) => r.n !== null)
      .sort((a, b) => b.n! - a.n!)[0];
    if (special) s.push(`특별공급은 ${josa(special.label, '이', '가')} ${rateText(special.rate)}로 가장 높았습니다(임장ON 계산: 접수 ÷ 배정).`);
    const low = (v.scores?.rows ?? []).slice().sort((a, b) => Number(a.low) - Number(b.low))[0];
    if (low) s.push(`당첨 가점 최저는 ${low.low}점(${low.type}${low.region ? `, ${low.region}` : ''})이었습니다.`);
  } else {
    const label = (r: (typeof v.rows)[number]) =>
      `${v.typeHeader === '타입' ? `타입 ${r.type}` : r.type}${r.kind && r.kind !== '전체' ? `(${r.kind})` : ''}`;
    const top = v.rows
      .map((r) => ({ r, n: rateNum(r.rate) }))
      .filter((x) => x.n !== null)
      .sort((a, b) => b.n! - a.n!)[0];
    if (top) s.push(`가장 높은 곳은 ${josa(label(top.r), '으로', '로')} ${rateText(top.r.rate)}이었습니다.`);
    // 오피스텔은 구분(거주자우선→기타) 행이 이어지고, 앞 구분 미달을 뒤 구분이 채우기도 한다(실측) → 타입별 마지막 행만 센다.
    // 공공지원민간임대 공급유형 행은 각각 따로 배정된 물량이라 행마다 센다.
    const perType = v.typeHeader === '타입';
    const counted = perType ? [...new Map(v.rows.map((r) => [r.type, r])).values()] : v.rows;
    const short = counted.filter((r) => r.rate.startsWith('미달')).length;
    if (short > 0) {
      const unit = perType ? v.typeHeader : `${v.typeHeader}${v.kindHeader ? `·${v.kindHeader}` : ''}`;
      s.push(`${short}개 ${unit}에서 미달이 났습니다(청약홈 공식값).`);
    }
  }
  if (s.length === 0) return null;
  return { q: `${name} 청약 경쟁률은 어땠나요?`, a: s.join(' '), source: `한국부동산원 청약홈 · ${d.fetchedLabel} 조회` };
}
