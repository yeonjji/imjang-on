export interface LifeSubItem {
  label: string;
  href: string;
  /** false면 클릭 시 SoonModal — 페이지 완성 시 true로만 전환하면 라이브 */
  live: boolean;
  /** 데이터 자체가 없는 항목(보건소·주차장)에 'Soon' 배지 */
  soon?: boolean;
}

export interface LifeGroup {
  label: string;
  /** 그룹 최상위 라우트 — href 접두 불변식 검증 + 추후 그룹 랜딩 페이지에 사용 */
  route: string;
  items: LifeSubItem[];
}

export const LIFE_GROUPS: LifeGroup[] = [
  {
    label: '학교',
    route: '/school',
    items: [
      { label: '초등', href: '/school?kind=elem', live: true },
      { label: '중학교', href: '/school?kind=mid', live: true },
      { label: '고등', href: '/school?kind=high', live: true },
      { label: '특수', href: '/school?kind=special', live: true },
    ],
  },
  {
    label: '의료시설',
    route: '/medical',
    items: [
      { label: '병원·의원', href: '/medical?type=hospital', live: false },
      { label: '약국', href: '/medical?type=pharmacy', live: false },
      { label: '보건소', href: '/medical?type=health-center', live: false, soon: true },
    ],
  },
  {
    label: '상권·편의',
    route: '/amenity',
    items: [
      { label: '편의점', href: '/amenity?type=convenience', live: false },
      { label: '마트', href: '/amenity?type=mart', live: false },
      { label: '카페', href: '/amenity?type=cafe', live: false },
      { label: '전통시장', href: '/amenity?type=market', live: false },
    ],
  },
  {
    label: '도시인프라',
    route: '/urban',
    items: [
      { label: '공원', href: '/urban?type=park', live: false },
      { label: '충전소', href: '/urban?type=charger', live: false },
      { label: '주차장', href: '/urban?type=parking', live: false, soon: true },
    ],
  },
];
