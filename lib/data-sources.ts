// 데이터 출처 레지스트리 — 중앙 페이지(/data-source), 푸터, 섹션 인라인 캡션이 모두 참조하는 단일 출처.
// 새 데이터 소스를 추가하면 여기에만 한 줄 추가한다.

export type DataSourceId =
  | 'molit-rtms'
  | 'applyhome'
  | 'lh-presub'
  | 'hira'
  | 'neis'
  | 'childcare'
  | 'kepco-ev'
  | 'semas-store'
  | 'mois-park'
  | 'mois-parking'
  | 'mois-market'
  | 'subway'
  | 'mois-bdong'
  | 'kakao-local';

export type DataSourceCategory =
  | '부동산 거래'
  | '청약'
  | '의료'
  | '교육·보육'
  | '생활편의'
  | '교통'
  | '공통';

export interface DataSource {
  id: DataSourceId;
  /** 제공기관 */
  provider: string;
  /** 데이터셋 명칭 */
  dataset: string;
  /** 공개 출처 URL (선택) */
  url?: string;
  category: DataSourceCategory;
}

export const DATA_SOURCES: Record<DataSourceId, DataSource> = {
  'molit-rtms': {
    id: 'molit-rtms',
    provider: '국토교통부',
    dataset: '실거래가 공개시스템 (아파트·오피스텔·연립다세대 매매·전월세)',
    url: 'https://rt.molit.go.kr',
    category: '부동산 거래',
  },
  applyhome: {
    id: 'applyhome',
    provider: '한국부동산원',
    dataset: '청약홈 분양정보',
    url: 'https://www.applyhome.co.kr',
    category: '청약',
  },
  'lh-presub': {
    id: 'lh-presub',
    provider: '한국토지주택공사(LH)',
    dataset: '사전청약·임대공고 정보',
    url: 'https://apply.lh.or.kr',
    category: '청약',
  },
  hira: {
    id: 'hira',
    provider: '건강보험심사평가원',
    dataset: '전국 병원·약국 정보',
    url: 'https://www.data.go.kr',
    category: '의료',
  },
  neis: {
    id: 'neis',
    provider: '교육부',
    dataset: 'NEIS 학교 기본정보',
    url: 'https://open.neis.go.kr',
    category: '교육·보육',
  },
  childcare: {
    id: 'childcare',
    provider: '보건복지부(한국사회보장정보원)',
    dataset: '어린이집 정보공개',
    url: 'https://www.childcare.go.kr',
    category: '교육·보육',
  },
  'kepco-ev': {
    id: 'kepco-ev',
    provider: '한국환경공단',
    dataset: '전기차 충전소 정보',
    url: 'https://www.data.go.kr',
    category: '생활편의',
  },
  'semas-store': {
    id: 'semas-store',
    provider: '소상공인시장진흥공단',
    dataset: '상가(상권)정보',
    url: 'https://www.data.go.kr',
    category: '생활편의',
  },
  'mois-park': {
    id: 'mois-park',
    provider: '행정안전부',
    dataset: '전국도시공원표준데이터',
    url: 'https://www.data.go.kr',
    category: '생활편의',
  },
  'mois-parking': {
    id: 'mois-parking',
    provider: '행정안전부',
    dataset: '전국주차장표준데이터',
    url: 'https://www.data.go.kr',
    category: '생활편의',
  },
  'mois-market': {
    id: 'mois-market',
    provider: '행정안전부',
    dataset: '전국전통시장표준데이터',
    url: 'https://www.data.go.kr',
    category: '생활편의',
  },
  subway: {
    id: 'subway',
    provider: '국가철도공단',
    dataset: '도시철도역사 정보',
    url: 'https://www.data.go.kr',
    category: '교통',
  },
  'mois-bdong': {
    id: 'mois-bdong',
    provider: '행정안전부',
    dataset: '법정동코드',
    url: 'https://www.data.go.kr',
    category: '공통',
  },
  'kakao-local': {
    id: 'kakao-local',
    provider: '카카오',
    dataset: '로컬 API (주소 좌표 변환)',
    url: 'https://developers.kakao.com',
    category: '공통',
  },
};

/** 중앙 페이지 그룹 렌더 순서 */
export const DATA_SOURCE_CATEGORY_ORDER: DataSourceCategory[] = [
  '부동산 거래',
  '청약',
  '의료',
  '교육·보육',
  '생활편의',
  '교통',
  '공통',
];

/** 카테고리별로 묶어 순서대로 반환 (빈 카테고리 제외) */
export function dataSourcesByCategory(): Array<{ category: DataSourceCategory; sources: DataSource[] }> {
  return DATA_SOURCE_CATEGORY_ORDER.map((category) => ({
    category,
    sources: Object.values(DATA_SOURCES).filter((s) => s.category === category),
  })).filter((g) => g.sources.length > 0);
}

/** 캡션용 짧은 라벨 (제공기관명) */
export function sourceShortLabel(id: DataSourceId): string {
  return DATA_SOURCES[id].provider;
}
