/**
 * 시설 상세 제목의 꼬리 명사구를 만든다.
 *
 * 제목 패턴은 `{이름} ({지역}) — {변별 키워드} {시설명}`이고 이 모듈은 뒤쪽
 * `{변별 키워드} {시설명}`만 담당한다. 조립 자체는 qualifiedTitle()이 한다.
 *
 * 모든 함수는 항상 문자열을 반환한다 — 키워드 소재가 없으면 시설명으로
 * 폴백해서 호출부에 null 분기를 만들지 않는다. DB를 타지 않는 순수 함수라
 * 단위 테스트가 픽스처 없이 돈다.
 */

/** 진료과목 2개를 이어붙일 수 있는 상한. 초과하면 1개만 쓴다. */
const DEPT_COMBINED_MAX = 10;

export interface DeptLike {
  deptName: string;
  specialistCount: number | null;
}

/**
 * 병원: 전문의 배치 수가 많은 진료과 상위 2개를 앞에 붙인다.
 *
 * getHospitalById는 depts를 deptName 오름차순으로 주므로(lib/hospital/index.ts:9)
 * 여기서 전문의 수로 다시 정렬한다. Array#sort가 안정 정렬이라 동수인 과들은
 * deptName 순서를 유지해 결과가 결정적이다.
 *
 * 전문의가 배치된 과가 없으면 전체 과목에서 앞의 2개를 쓴다 — 의원급은
 * specialistCount가 전부 0/null이라 이 경로를 탄다.
 */
export function hospitalDescriptor(depts: DeptLike[], typeName: string): string {
  const withSpecialist = depts.filter((d) => (d.specialistCount ?? 0) > 0);
  const pool = withSpecialist.length > 0 ? withSpecialist : depts;
  const picked = [...pool]
    .sort((a, b) => (b.specialistCount ?? 0) - (a.specialistCount ?? 0))
    .slice(0, 2)
    .map((d) => d.deptName);

  if (picked.length === 0) return typeName;

  const combined = picked.join('·');
  const keyword = combined.length > DEPT_COMBINED_MAX ? picked[0] : combined;
  return `${keyword} ${typeName}`;
}

/**
 * 단성 학교 표기. coeduType 저장값은 '남'·'여'·'남여공학' 셋으로 확정돼
 * 있다 — lib/school.ts:31-33의 목록 필터 WHERE 절과 lib/insights/school.ts:21-23의
 * 서술 분기가 이미 이 세 값에 고정 배선돼 있다. 그럼에도 화이트리스트 형태를
 * 유지하는 건, 상류(NEIS) 값이 표기를 바꿔 흘러들어도 오표기 대신 '키워드
 * 생략'으로 안전하게 degrade하기 때문이다. '공학이 아닌 것'을 부등호로
 * 걸러내지 않고, 남·여로 시작하고 '공학'을 포함하지 않는 값만 통과시킨다.
 * 예상 못한 값의 실패 모드는 '키워드가 빠진다'이지 오표기가 아니다.
 */
function singleGenderLabel(coeduType: string | null): string | null {
  const v = coeduType?.trim();
  if (!v || v.includes('공학') || /^남[녀여]/.test(v)) return null;
  if (v.startsWith('남')) return '남자';
  if (v.startsWith('여')) return '여자';
  return null;
}

/** 학교: 설립구분(공립/사립)과 단성 여부를 앞에 붙인다. 지금 description에만 있는 값을 제목으로 승격한다. */
export function schoolDescriptor(
  foundType: string | null,
  coeduType: string | null,
  schoolKind: string | null,
): string {
  const kind = schoolKind ?? '학교';
  const keyword = [foundType?.trim(), singleGenderLabel(coeduType)].filter(Boolean).join(' ');
  return keyword ? `${keyword} ${kind}` : kind;
}

/**
 * 약국: 읍면동을 앞에 붙인다. Pharmacy 모델에 영업시간·심야·공휴일 컬럼이
 * 없어 '심야약국' 같은 실검색어를 만들 소재가 없고, eupmyeondong이 유일한
 * 변별 축이다.
 */
export function pharmacyDescriptor(eupmyeondong: string | null): string {
  const dong = eupmyeondong?.trim();
  return dong ? `${dong} 약국` : '약국';
}

export interface AmenityFields {
  industryName?: string | null;
  marketType?: string | null;
}

/**
 * 상권·편의 4종. 호출 지점이 amenity/[category]/[id] 하나라 slug로 분기한다.
 * - market: marketType에서 상설·정기를 뽑는다(classifyMarketSub와 같은 기준)
 * - mart: industryName(슈퍼마켓·대형마트 등)이 '마트'를 흡수한다
 * - convenience·cafe: industryName이 '체인화 편의점'·'커피전문점'처럼 라벨과
 *   동어반복이라 키워드 없이 라벨만 낸다. 없는 변별력을 만들지 않는다.
 */
export function amenityDescriptor(slug: string, item: AmenityFields, label: string): string {
  if (slug === 'market') {
    const type = item.marketType ?? '';
    if (type.includes('상설')) return `상설 ${label}`;
    if (type.includes('정기') || type.includes('일장')) return `정기 ${label}`;
    return label;
  }
  if (slug === 'mart') {
    return item.industryName?.trim() || label;
  }
  return label;
}

/** 공원: parkType이 '근린공원'처럼 이미 '공원'으로 끝나 시설명을 흡수한다. */
export function urbanParkDescriptor(parkType: string | null): string {
  return parkType?.trim() || '공원';
}

/**
 * 주차장: 무료/유료 + 공영/민영. "무료 주차장"이 가장 강한 검색 의도다.
 * 무료/유료는 chargeInfo 컬럼이다(parkingchrgeInfo 매핑). feedingSe는
 * 급지구분이라 쓰지 않는다.
 */
export function urbanParkingDescriptor(chargeInfo: string | null, prkplceSe: string | null): string {
  const charge = chargeInfo?.trim();
  const operator = prkplceSe?.trim();
  if (charge && operator) return `${charge} ${operator}주차장`;
  if (charge) return `${charge} 주차장`;
  if (operator) return `${operator}주차장`;
  return '주차장';
}

/** 충전소: 급속·완속. '전기차 충전소'가 실검색어라 시설명을 '충전소'로 줄이지 않는다. */
export function urbanChargerDescriptor(chargeSpeed: string | null): string {
  const speed = chargeSpeed?.trim();
  return speed ? `${speed} 전기차충전소` : '전기차충전소';
}
