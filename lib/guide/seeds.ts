import { GuideCategory } from '@prisma/client';

export interface GuideSeed {
  key: string;            // dedupeKey(고유). 재생성 방지.
  category: GuideCategory;
  title: string;          // 가이드 제목(상록)
  angle: string;          // 생성 프롬프트에 줄 서술 방향
  source: { name: string; url: string; date: string; excerpt: string }; // 근거(출처) — 필수
  related: { label: string; href: string }; // 마무리 '더 알아보기' CTA 내부 링크
}

// 지역 곱 금지: 주제별 고유 1편. 운영에서 카테고리당 2~3개로 확장.
export const GUIDE_SEEDS: GuideSeed[] = [
  {
    key: 'medical-night-holiday-pharmacy',
    category: GuideCategory.MEDICAL,
    title: '야간·공휴일에 문 여는 약국·병원 찾는 법',
    angle: '심야·공휴일에 이용 가능한 약국과 병원을 찾는 공식 경로(응급의료포털 등)와 확인 절차를 단계별로 설명한다.',
    source: { name: '보건복지부 응급의료포털', url: 'https://www.e-gen.or.kr', date: '2026-01-01', excerpt: '전국 병원·약국 운영시간 및 야간·공휴일 운영 정보 제공.' },
    related: { label: '약국 찾기', href: '/medical/pharmacy' },
  },
  {
    key: 'childcare-types-and-choosing',
    category: GuideCategory.CHILDCARE,
    title: '어린이집 유형과 고르는 법',
    angle: '국공립·민간·가정 등 어린이집 유형의 차이와 입소 대기·보육료 지원의 일반 구조를 설명한다.',
    source: { name: '보건복지부 어린이집정보공개포털', url: 'https://info.childcare.go.kr', date: '2026-01-01', excerpt: '어린이집 유형·정원·평가 정보 공개.' },
    related: { label: '어린이집 찾기', href: '/childcare' },
  },
  {
    key: 'school-district-assignment',
    category: GuideCategory.SCHOOL,
    title: '학군과 학교 배정 이해하기',
    angle: '초·중학교 학교군/통학구역 배정의 일반 원리와 확인 방법을 설명한다.',
    source: { name: '교육부 학교알리미', url: 'https://www.schoolinfo.go.kr', date: '2026-01-01', excerpt: '학교별 학구·현황 정보 공개.' },
    related: { label: '학교 정보 보기', href: '/school' },
  },
  {
    key: 'realestate-read-transaction-price',
    category: GuideCategory.REALESTATE,
    title: '실거래가, 어떻게 읽어야 할까',
    angle: '국토부 실거래가의 의미, 호가와의 차이, 면적·층·계약일을 함께 봐야 하는 이유를 설명한다.',
    source: { name: '국토교통부 실거래가 공개시스템', url: 'https://rt.molit.go.kr', date: '2026-01-01', excerpt: '아파트·연립·오피스텔 등 실거래 신고가 공개.' },
    related: { label: '실거래가 조회하기', href: '/list' },
  },
  {
    key: 'subscription-eligibility-points',
    category: GuideCategory.SUBSCRIPTION,
    title: '청약 자격과 가점제 이해하기',
    angle: '주택청약 자격 요건과 가점제(무주택기간·부양가족·청약통장 가입기간)의 일반 구조를 설명한다.',
    source: { name: '한국부동산원 청약홈', url: 'https://www.applyhome.co.kr', date: '2026-01-01', excerpt: '청약 자격·가점·일정 안내.' },
    related: { label: '청약 일정 보기', href: '/subscription' },
  },
  {
    key: 'finance-jeonse-guarantee-limit',
    category: GuideCategory.FINANCE,
    title: '전세보증금 반환보증 한도 이해하기',
    angle: '전세보증금 반환보증의 목적과 한도가 정해지는 일반 원리, 신청 시 확인할 점을 설명한다.',
    source: { name: '주택도시보증공사(HUG)', url: 'https://www.khug.or.kr', date: '2026-01-01', excerpt: '전세보증금 반환보증 상품·한도 안내.' },
    related: { label: '전세자금보증 추천 보기', href: '/jeonse-guarantee' },
  },
  {
    key: 'life-subway-access',
    category: GuideCategory.LIFE,
    title: '역세권, 무엇을 따져봐야 할까',
    angle: '도보 거리·환승·노선 등 역세권을 판단할 때 고려하는 일반 기준을 설명한다.',
    source: { name: '국가철도공단', url: 'https://www.kr.or.kr', date: '2026-01-01', excerpt: '전국 철도역 위치·노선 정보.' },
    related: { label: '생활 인프라 보기', href: '/school' },
  },
  {
    key: 'realestate-area-pyeong-explained',
    category: GuideCategory.REALESTATE,
    title: '전용·공급면적과 평수 계산 이해하기',
    angle: '전용면적·공급면적·계약면적의 차이와 ㎡↔평 환산의 일반 원리를 설명한다.',
    source: { name: '국토교통부 실거래가 공개시스템', url: 'https://rt.molit.go.kr', date: '2026-01-01', excerpt: '실거래 신고에 전용면적이 표기된다.' },
    related: { label: '실거래가 조회하기', href: '/list' },
  },
  {
    key: 'subscription-account-types-rank',
    category: GuideCategory.SUBSCRIPTION,
    title: '청약통장 종류와 1순위 조건 이해하기',
    angle: '주택청약종합저축 등 청약통장의 종류와 1순위 요건(가입기간·납입)의 일반 구조를 설명한다.',
    source: { name: '한국부동산원 청약홈', url: 'https://www.applyhome.co.kr', date: '2026-01-01', excerpt: '청약통장 종류·1순위 요건 안내.' },
    related: { label: '청약 일정 보기', href: '/subscription' },
  },
  {
    key: 'finance-policy-housing-loans',
    category: GuideCategory.FINANCE,
    title: '디딤돌·보금자리 등 정책대출 한눈에 보기',
    angle: '내집마련 디딤돌대출·보금자리론 등 정책 모기지의 일반 목적과 자격 구조를 설명한다.',
    source: { name: '주택도시기금', url: 'https://nhuf.molit.go.kr', date: '2026-01-01', excerpt: '디딤돌대출 등 정책대출 상품 안내.' },
    related: { label: '정책대출 상품 보기', href: '/finance' },
  },
  {
    key: 'medical-find-hospital-by-specialty',
    category: GuideCategory.MEDICAL,
    title: '동네 병원과 전문과목 찾는 법',
    angle: '진료과목·운영시간 등으로 가까운 병원을 찾는 공식 경로와 확인 절차를 설명한다.',
    source: { name: '건강보험심사평가원', url: 'https://www.hira.or.kr', date: '2026-01-01', excerpt: '병원·약국 진료과목·운영 정보 공개.' },
    related: { label: '병원 찾기', href: '/medical/hospital' },
  },
  {
    key: 'childcare-admission-waiting-process',
    category: GuideCategory.CHILDCARE,
    title: '어린이집 입소 대기와 신청 절차',
    angle: '입소 대기 신청·우선순위·대기 순번 확인의 일반 절차를 설명한다.',
    source: { name: '아이사랑보육포털', url: 'https://www.childcare.go.kr', date: '2026-01-01', excerpt: '어린이집 입소 대기 신청·관리 안내.' },
    related: { label: '어린이집 찾기', href: '/childcare' },
  },
  {
    key: 'school-schoolinfo-howto',
    category: GuideCategory.SCHOOL,
    title: '학교알리미로 학교 정보 확인하는 법',
    angle: '학교알리미에서 학교 현황·학급수·학생수 등 공개 정보를 확인하는 방법을 설명한다.',
    source: { name: '교육부 학교알리미', url: 'https://www.schoolinfo.go.kr', date: '2026-01-01', excerpt: '학교별 현황·공시 정보 공개.' },
    related: { label: '학교 정보 보기', href: '/school' },
  },
  {
    key: 'life-infra-checklist',
    category: GuideCategory.LIFE,
    title: '생활 인프라, 무엇을 따져봐야 할까',
    angle: '마트·공원·주차 등 생활 인프라를 살펴볼 때 고려하는 일반 기준을 설명한다.',
    source: { name: '공공데이터포털', url: 'https://www.data.go.kr', date: '2026-01-01', excerpt: '생활편의시설 위치·현황 공공데이터 제공.' },
    related: { label: '생활 인프라 보기', href: '/school' },
  },
  {
    key: 'realestate-official-price-vs-transaction',
    category: GuideCategory.REALESTATE,
    title: '공시가격과 실거래가는 어떻게 다를까',
    angle: '부동산 공시가격의 의미와 실거래가와의 차이, 보유세·건강보험료 등 산정 기준으로 쓰이는 이유를 설명한다.',
    source: { name: '국토교통부 부동산공시가격알리미', url: 'https://www.realtyprice.kr', date: '2026-01-01', excerpt: '공동주택·개별주택 공시가격을 열람할 수 있다.' },
    related: { label: '실거래가 조회하기', href: '/list' },
  },
  {
    key: 'subscription-special-supply-types',
    category: GuideCategory.SUBSCRIPTION,
    title: '특별공급 유형 이해하기',
    angle: '신혼부부·생애최초·다자녀·노부모부양 등 특별공급 유형별 대상과 일반 요건 구조를 설명한다.',
    source: { name: '한국부동산원 청약홈', url: 'https://www.applyhome.co.kr', date: '2026-01-01', excerpt: '특별공급 유형·대상·일정 안내.' },
    related: { label: '청약 일정 보기', href: '/subscription' },
  },
  {
    key: 'finance-ltv-dsr-mortgage-regulation',
    category: GuideCategory.FINANCE,
    title: 'LTV·DSR 등 주택담보대출 규제 이해하기',
    angle: 'LTV(담보인정비율)·DSR(총부채원리금상환비율)의 개념과 주택담보대출 한도에 영향을 주는 일반 원리를 설명한다.',
    source: { name: '금융위원회', url: 'https://www.fsc.go.kr', date: '2026-01-01', excerpt: '주택담보대출 규제(LTV·DSR 등) 정책 안내.' },
    related: { label: '정책대출 상품 보기', href: '/finance' },
  },
  {
    key: 'medical-public-health-center',
    category: GuideCategory.MEDICAL,
    title: '보건소·보건지소는 어떤 곳일까',
    angle: '보건소·보건지소에서 제공하는 예방접종·건강검진 등 공공보건 서비스의 일반 내용과 이용 방법을 설명한다.',
    source: { name: '공공데이터포털', url: 'https://www.data.go.kr', date: '2026-01-01', excerpt: '전국 보건소·보건지소 위치·운영 정보 공공데이터 제공.' },
    related: { label: '병원 찾기', href: '/medical/hospital' },
  },
  {
    key: 'childcare-support-subsidy',
    category: GuideCategory.CHILDCARE,
    title: '보육료·양육수당 등 보육 지원 이해하기',
    angle: '어린이집 이용 시 보육료 지원과 가정 양육 시 양육수당 등 보육 관련 지원의 일반 구조를 설명한다.',
    source: { name: '복지로', url: 'https://www.bokjiro.go.kr', date: '2026-01-01', excerpt: '보육료·양육수당 등 보육 지원 대상·신청 안내.' },
    related: { label: '어린이집 찾기', href: '/childcare' },
  },
  {
    key: 'school-highschool-types',
    category: GuideCategory.SCHOOL,
    title: '고등학교 유형 이해하기',
    angle: '일반고·자율고·특수목적고·특성화고 등 고등학교 유형의 차이와 확인 방법을 설명한다.',
    source: { name: '교육부 학교알리미', url: 'https://www.schoolinfo.go.kr', date: '2026-01-01', excerpt: '학교 유형·현황 정보 공개.' },
    related: { label: '학교 정보 보기', href: '/school' },
  },
  {
    key: 'life-neighborhood-safety',
    category: GuideCategory.LIFE,
    title: '동네 치안, 무엇으로 확인할까',
    angle: 'CCTV·범죄 통계 등 공공데이터로 지역 치안 수준을 살펴볼 때 고려하는 일반 기준을 설명한다.',
    source: { name: '공공데이터포털', url: 'https://www.data.go.kr', date: '2026-01-01', excerpt: '경찰청 범죄 통계·CCTV 설치 현황 등 공공데이터 제공.' },
    related: { label: '생활 인프라 보기', href: '/school' },
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
