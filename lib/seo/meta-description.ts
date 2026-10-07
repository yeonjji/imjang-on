/**
 * description용 시설 표기 — `이름(주소)`.
 *
 * 이름 + 고정 문구 템플릿은 동명 시설(체인 매장·'공한지주차장'·'서울치과의원' 등)끼리 글자까지
 * 같아져 네이버 서치어드바이저 '동일 description' 경고를 받았다(2026-10). 주소로 가른다.
 */
export function nameWithAddress(name: string, address: string): string {
  const addr = address.trim();
  return addr ? `${name}(${addr})` : name;
}
