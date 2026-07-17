import type { FaqItem } from '@/lib/faq/data';
import { formatHospitalTime } from '@/lib/hospital/utils';

const HIRA = '건강보험심사평가원';

export interface HospitalFaqInput {
  name: string;
  typeName: string;
  sigungu: string | null;
  sido: string | null;
  depts: { deptName: string }[];
  totalDoctors: number | null;
  detail: {
    openMon: number | null;
    closeMon: number | null;
    erDayOpen: string | null;
    erNightOpen: string | null;
  } | null;
}

/** 병원 상세용 페이지-치환 FAQ(동적 항목만). */
export function buildHospitalFaq(h: HospitalFaqInput): FaqItem[] {
  const items: FaqItem[] = [];
  const name = h.name;
  const loc = h.sigungu ?? h.sido ?? '';
  const locPrefix = loc ? `${loc} ` : '';

  if (h.depts.length > 0) {
    const names = h.depts.slice(0, 5).map((d) => d.deptName).join(', ');
    const more = h.depts.length > 5 ? ` 등 ${h.depts.length}개 과` : '';
    items.push({
      q: `${name}은 어떤 진료과가 있나요?`,
      a: `${locPrefix}${name}(${h.typeName})의 진료과는 ${names}${more}입니다. 세부 진료 항목은 방문 전 병원에 확인하세요.`,
      source: HIRA,
    });
  }

  if (h.detail?.openMon != null && h.detail?.closeMon != null) {
    items.push({
      q: `${name}의 진료시간은 어떻게 되나요?`,
      a: `평일(월) 기준 ${formatHospitalTime(h.detail.openMon)}~${formatHospitalTime(h.detail.closeMon)}에 진료합니다. 요일별 진료시간·점심시간은 병원 사정으로 달라질 수 있어 방문 전 확인을 권장합니다.`,
      source: HIRA,
    });
  }

  if (h.detail?.erDayOpen != null || h.detail?.erNightOpen != null) {
    const day = h.detail?.erDayOpen === 'Y';
    const night = h.detail?.erNightOpen === 'Y';
    const er = day && night ? '주간·야간 모두 운영' : night ? '야간 운영' : day ? '주간 운영' : '운영하지 않음';
    items.push({
      q: `${name}에 응급실이 있나요?`,
      a: `등록 정보 기준 응급실은 ${er}입니다. 응급 상황은 국번없이 119 또는 응급의료포털을 함께 이용하세요.`,
      source: HIRA,
    });
  }

  if (h.totalDoctors != null && h.totalDoctors > 0) {
    items.push({
      q: `${name}의 의료진 규모는 어느 정도인가요?`,
      a: `심사평가원 신고 기준 총 의사 수는 ${h.totalDoctors.toLocaleString('ko-KR')}명입니다. 진료과별 세부 구성은 병원에 문의하세요.`,
      source: HIRA,
    });
  }

  return items;
}
