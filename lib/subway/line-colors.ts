export interface LineBadge {
  label: string;
  color: string;
}

// 라벨이 호선 번호와 다른 명칭 노선의 약어 매핑
const NAMED_LABEL: Record<string, string> = {
  신분당선: '신분당',
  수인분당선: '수인분당',
  경의중앙선: '경의중앙',
  우이신설선: '우이신설',
  서해선: '서해',
  공항철도: '공항',
  경춘선: '경춘',
  경강선: '경강',
  김포골드라인: '김포',
  신림선: '신림',
};

const LINE_COLORS: Record<string, string> = {
  '1호선': '#0052A4', '2호선': '#00A84D', '3호선': '#EF7C1C', '4호선': '#00A5DE',
  '5호선': '#996CAC', '6호선': '#CD7C2F', '7호선': '#747F00', '8호선': '#E6186C',
  '9호선': '#BDB092',
  신분당선: '#D4003B', 수인분당선: '#F5A200', 경의중앙선: '#77C4A3',
  우이신설선: '#B7C452', 서해선: '#8FC31F', 공항철도: '#0090D2',
  경춘선: '#0C8E72', 경강선: '#003DA5', 김포골드라인: '#A17E46',
  신림선: '#6789CA',
};

const DEFAULT_COLOR = '#6B7280';

export function lineBadge(lineName: string): LineBadge {
  const numeric = /^(\d+)호선$/.exec(lineName);
  const label = numeric ? numeric[1] : (NAMED_LABEL[lineName] ?? lineName.slice(0, 2));
  const color = LINE_COLORS[lineName] ?? DEFAULT_COLOR;
  return { label, color };
}
