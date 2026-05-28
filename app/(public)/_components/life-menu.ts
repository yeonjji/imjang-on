export interface LifeSubItem {
  label: string;
  href: string;
  /** false면 클릭 시 SoonModal — 페이지 완성 시 true로만 전환하면 라이브 */
  live: boolean;
  /** 데이터 자체가 없는 항목에 'Soon' 배지 */
  soon?: boolean;
}

export interface LifeGroup {
  label: string;
  items: LifeSubItem[];
}

export const LIFE_GROUPS: LifeGroup[] = [
  {
    label: '교육시설',
    items: [
      { label: '학교', href: '/school', live: true },
      { label: '어린이집', href: '/childcare', live: false, soon: true },
    ],
  },
  {
    label: '의료시설',
    items: [
      { label: '병원·의원', href: '/medical?type=hospital', live: false },
      { label: '약국', href: '/medical?type=pharmacy', live: false },
      { label: '보건소', href: '/medical?type=health-center', live: false, soon: true },
    ],
  },
  {
    label: '상권·편의',
    items: [
      { label: '편의점', href: '/amenity?type=convenience', live: false },
      { label: '마트', href: '/amenity?type=mart', live: false },
      { label: '카페', href: '/amenity?type=cafe', live: false },
      { label: '전통시장', href: '/amenity?type=market', live: false },
    ],
  },
  {
    label: '도시인프라',
    items: [
      { label: '공원', href: '/urban?type=park', live: false },
      { label: '충전소', href: '/urban?type=charger', live: false },
      { label: '주차장', href: '/urban?type=parking', live: false, soon: true },
    ],
  },
];
