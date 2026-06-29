import { GuideCategory } from '@prisma/client';

export interface GuideSeed {
  key: string;            // dedupeKey(고유). 재생성 방지.
  category: GuideCategory;
  title: string;          // 가이드 제목(상록)
  angle: string;          // 생성 프롬프트에 줄 서술 방향
  source: { name: string; url: string; date: string; excerpt: string }; // 근거(출처) — 필수
}

// 지역 곱 금지: 주제별 고유 1편. 운영에서 카테고리당 2~3개로 확장.
export const GUIDE_SEEDS: GuideSeed[] = [
  {
    key: 'medical-night-holiday-pharmacy',
    category: GuideCategory.MEDICAL,
    title: '야간·공휴일에 문 여는 약국·병원 찾는 법',
    angle: '심야·공휴일에 이용 가능한 약국과 병원을 찾는 공식 경로(응급의료포털 등)와 확인 절차를 단계별로 설명한다.',
    source: { name: '보건복지부 응급의료포털', url: 'https://www.e-gen.or.kr', date: '2026-01-01', excerpt: '전국 병원·약국 운영시간 및 야간·공휴일 운영 정보 제공.' },
  },
  {
    key: 'childcare-types-and-choosing',
    category: GuideCategory.CHILDCARE,
    title: '어린이집 유형과 고르는 법',
    angle: '국공립·민간·가정 등 어린이집 유형의 차이와 입소 대기·보육료 지원의 일반 구조를 설명한다.',
    source: { name: '보건복지부 어린이집정보공개포털', url: 'https://info.childcare.go.kr', date: '2026-01-01', excerpt: '어린이집 유형·정원·평가 정보 공개.' },
  },
  {
    key: 'school-district-assignment',
    category: GuideCategory.SCHOOL,
    title: '학군과 학교 배정 이해하기',
    angle: '초·중학교 학교군/통학구역 배정의 일반 원리와 확인 방법을 설명한다.',
    source: { name: '교육부 학교알리미', url: 'https://www.schoolinfo.go.kr', date: '2026-01-01', excerpt: '학교별 학구·현황 정보 공개.' },
  },
  {
    key: 'realestate-read-transaction-price',
    category: GuideCategory.REALESTATE,
    title: '실거래가, 어떻게 읽어야 할까',
    angle: '국토부 실거래가의 의미, 호가와의 차이, 면적·층·계약일을 함께 봐야 하는 이유를 설명한다.',
    source: { name: '국토교통부 실거래가 공개시스템', url: 'https://rt.molit.go.kr', date: '2026-01-01', excerpt: '아파트·연립·오피스텔 등 실거래 신고가 공개.' },
  },
  {
    key: 'subscription-eligibility-points',
    category: GuideCategory.SUBSCRIPTION,
    title: '청약 자격과 가점제 이해하기',
    angle: '주택청약 자격 요건과 가점제(무주택기간·부양가족·청약통장 가입기간)의 일반 구조를 설명한다.',
    source: { name: '한국부동산원 청약홈', url: 'https://www.applyhome.co.kr', date: '2026-01-01', excerpt: '청약 자격·가점·일정 안내.' },
  },
  {
    key: 'finance-jeonse-guarantee-limit',
    category: GuideCategory.FINANCE,
    title: '전세보증금 반환보증 한도 이해하기',
    angle: '전세보증금 반환보증의 목적과 한도가 정해지는 일반 원리, 신청 시 확인할 점을 설명한다.',
    source: { name: '주택도시보증공사(HUG)', url: 'https://www.khug.or.kr', date: '2026-01-01', excerpt: '전세보증금 반환보증 상품·한도 안내.' },
  },
  {
    key: 'life-subway-access',
    category: GuideCategory.LIFE,
    title: '역세권, 무엇을 따져봐야 할까',
    angle: '도보 거리·환승·노선 등 역세권을 판단할 때 고려하는 일반 기준을 설명한다.',
    source: { name: '국가철도공단', url: 'https://www.kr.or.kr', date: '2026-01-01', excerpt: '전국 철도역 위치·노선 정보.' },
  },
];

export function validateGuideSeeds(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const s of GUIDE_SEEDS) {
    if (keys.has(s.key)) errors.push(`중복 key: ${s.key}`);
    keys.add(s.key);
  }
  const covered = new Set(GUIDE_SEEDS.map((s) => s.category));
  for (const c of Object.values(GuideCategory)) {
    if (!covered.has(c)) errors.push(`카테고리 미커버: ${c}`);
  }
  return { ok: errors.length === 0, errors };
}
