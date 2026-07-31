// lib/amenity/store-name.ts

/**
 * 공공데이터 상가업소 정보는 지점명을 bizesNm(상호명)과 brchNm(지점명)에 쪼개 내려준다.
 * brchNm은 독립된 지점명이 아니라 bizesNm에서 잘려나간 꼬리라, 공백 없이 이어붙여야
 * 원래 상호가 복원된다. (예: '씨유켄싱턴리조트' + '남원점' → '씨유켄싱턴리조트남원점')
 */

/** brchNm에 지점명 대신 운영사 상호가 흘러든 값. 코리아세븐㈜(세븐일레븐 운영사). */
const OPERATOR_NOISE = new Set(['코리아']);

/**
 * 편의점 브랜드 접두. 최장 일치로 매칭해야 '세븐일레븐'이 '세븐'보다,
 * '지에스25'가 '지에스'보다 먼저 잡힌다.
 */
const BRANDS = [
  '세븐일레븐',
  '씨유',
  '지에스25',
  '지에스',
  '이마트24',
  '미니스톱',
  '스토리웨이',
  'emart24',
  'GS25',
  'CU',
  '세븐',
];

const BRANDS_LONGEST_FIRST = [...BRANDS].sort((a, b) => b.length - a.length);

/**
 * 목록·상세에 노출할 상가 이름을 만든다.
 * splitBrand가 참이면 브랜드 접두 뒤에 공백을 넣어 '씨유 포이사거리점' 형태로 만든다.
 * 규칙이 어디서든 실패하면 원본 name으로 되돌아가며, 공백 제거 후 비어있지 않은 name에 대해서는
 * 빈 문자열을 반환하지 않는다. name이 공백뿐이거나 비어있으면 빈 문자열을 반환한다 (표시할 이름이 없음).
 */
export function displayStoreName(
  store: { name: string; branchName?: string | null },
  opts?: { splitBrand?: boolean },
): string {
  const name = store.name?.trim() ?? '';
  if (!name) return name;

  const branch = store.branchName?.trim() ?? '';
  const usableBranch = OPERATOR_NOISE.has(branch) ? '' : branch;

  // 공백 없이 결합한 뒤, 운영사 상호가 붙어 생긴 '…점주' 꼬리를 '…점'으로 되돌린다.
  const combined = (name + usableBranch).replace(/점주$/, '점');
  if (!combined) return name;
  if (!opts?.splitBrand) return combined;

  for (const brand of BRANDS_LONGEST_FIRST) {
    if (combined.toUpperCase().startsWith(brand.toUpperCase())) {
      const rest = combined.slice(brand.length);
      // 브랜드만 있고 지점부가 없으면 '씨유 ' 같은 값이 되므로 원본을 쓴다.
      if (!rest) return name;
      return `${combined.slice(0, brand.length)} ${rest}`;
    }
  }
  return combined;
}
