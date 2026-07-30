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
