import type { FaqItem } from '@/lib/faq/data';
import type { PharmacyDong } from '@/lib/pharmacy/context';
import { josaName as josa } from '@/lib/seo/josa';

const HIRA = '건강보험심사평가원';

export interface PharmacyFaqInput {
  name: string;
  tel: string | null;
  /** pharmacyYears 결과 — '동네 속 이 약국' 카드와 같은 값 */
  years: number | null;
  openedYear: number | null;
  dong: PharmacyDong | null;
  /** 반경 500m 일요일 진료 병·의원 수(countSundayClinicsNearby) */
  sundayClinics: number;
}

/** 약국 상세용 페이지 값 FAQ(값 없으면 문항 생략). */
export function buildPharmacyFaq(p: PharmacyFaqInput): FaqItem[] {
  const items: FaqItem[] = [];
  const nameIs = josa(p.name, '은', '는');

  if (p.tel) {
    items.push({
      q: `${p.name} 전화번호는 무엇인가요?`,
      a: `${p.name} 전화번호는 ${p.tel}입니다. 임장ON은 약국 운영시간을 아직 제공하지 않아, 방문 전 이 번호로 영업 여부를 확인하세요.`,
      source: HIRA,
    });
  }

  if (p.years !== null && p.openedYear !== null) {
    const rank = p.dong ? ` ${p.dong.dong} 약국 ${p.dong.count}곳 중 ${p.dong.openedRank}번째로 문을 열었습니다.` : '';
    items.push({
      q: `${nameIs} 언제 문을 열었나요?`,
      a: `${p.openedYear}년에 개설해 올해 ${p.years}년차입니다.${rank}`,
      source: HIRA,
    });
  }

  // 0곳은 '없다'가 아니라 '공개된 곳이 없다'일 수 있어 문항을 만들지 않는다.
  if (p.sundayClinics > 0) {
    items.push({
      q: `${p.name} 근처에 일요일에 진료하는 병원이 있나요?`,
      a: `반경 500m 안에 일요일 진료시간을 공개한 병·의원이 ${p.sundayClinics}곳 있습니다. 진료시간을 공개하지 않은 곳은 빠져 있어 실제로는 더 있을 수 있습니다.`,
      source: HIRA,
    });
  }

  return items;
}
