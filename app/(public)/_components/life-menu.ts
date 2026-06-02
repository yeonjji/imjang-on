export interface LifeSubItem {
  label: string;
  href: string;
  /** false면 클릭 시 SoonModal — 페이지 완성 시 true로만 전환하면 라이브 */
  live: boolean;
  /** 데이터 자체가 없는 항목에 'Soon' 배지 */
  soon?: boolean;
}

export type LifeGroupSlug = 'education' | 'medical' | 'amenity' | 'urban';

export interface LifeGroup {
  slug: LifeGroupSlug;
  label: string;
  /** 그룹 허브 페이지 hero용 1줄 설명 */
  intro: string;
  items: LifeSubItem[];
}

export const LIFE_GROUPS: LifeGroup[] = [
  {
    slug: 'education',
    label: '교육시설',
    intro: '아이의 통학 동선과 학군을 한 화면에서.',
    items: [
      { label: '학교', href: '/school', live: true },
      { label: '어린이집', href: '/childcare', live: true },
    ],
  },
  {
    slug: 'medical',
    label: '의료시설',
    intro: '병원·약국·보건소까지, 우리 동네 의료 인프라.',
    items: [
      { label: '병원·의원', href: '/medical?type=hospital', live: false },
      { label: '약국', href: '/medical?type=pharmacy', live: false },
      { label: '보건소', href: '/medical?type=health-center', live: false, soon: true },
    ],
  },
  {
    slug: 'amenity',
    label: '상권·편의',
    intro: '편의점·마트·카페·전통시장 — 일상 동선을 한눈에.',
    items: [
      { label: '편의점', href: '/amenity/convenience', live: true },
      { label: '마트', href: '/amenity/mart', live: true },
      { label: '카페', href: '/amenity/cafe', live: true },
      { label: '전통시장', href: '/amenity/market', live: true },
    ],
  },
  {
    slug: 'urban',
    label: '도시인프라',
    intro: '공원·충전소·주차장 — 동네 인프라 한눈에.',
    items: [
      { label: '주차장', href: '/urban/parking', live: true },
      { label: '공원', href: '/urban/park', live: true },
      { label: '충전소', href: '/urban/charger', live: true },
    ],
  },
];

/** 하위 항목 label → emoji 매핑 (그룹 허브, /life 인덱스, sibling 탭 공용) */
export const LIFE_ITEM_EMOJI: Record<string, string> = {
  '학교': '🏫', '어린이집': '👶',
  '병원·의원': '🏥', '약국': '💊', '보건소': '🩺',
  '편의점': '🏪', '마트': '🛒', '카페': '☕', '전통시장': '🏬',
  '공원': '🌳', '충전소': '⚡', '주차장': '🅿️',
};
