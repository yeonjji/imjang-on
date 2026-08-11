export interface AddressRegion { sido: string; sigungu: string | null }

/** 주소 앞 두 토큰을 시도·시군구로 본다. 청약 공고의 시군구는 주소 문자열에만 있다. */
export function parseAddressRegion(address: string): AddressRegion {
  const tokens = address.trim().split(/\s+/).filter(Boolean);
  return { sido: tokens[0] ?? '', sigungu: tokens[1] ?? null };
}

/** `서울` vs `서울특별시`처럼 표기가 달라도 한쪽이 다른 쪽의 접두사면 같은 지역으로 본다. */
function prefixEq(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  if (a.length < 2 || b.length < 2) return false; // 한 글자 접두사는 우연 일치가 잦다
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * 카카오가 준 지역이 주소의 지역과 맞는지. 어긋나면 좌표를 버린다 —
 * 엉뚱한 좌표는 그 페이지의 주변 실거래·인프라를 통째로 다른 동네 것으로 만든다.
 */
export function regionMatches(
  addr: AddressRegion,
  coord: { region1: string | null; region2: string | null },
): boolean {
  if (!prefixEq(addr.sido, coord.region1)) return false;
  if (addr.sigungu === null) return true; // 세종처럼 시군구 계층이 없는 주소
  return prefixEq(addr.sigungu, coord.region2);
}
