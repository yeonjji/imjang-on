import { SIDO_NAMES, canonicalSido } from '@/lib/region';

export interface AddressRegion { sido: string; sigungu: string | null }

/** 시군구 접미사. */
const SGG_SUFFIX = /(시|군|구)$/;
/** 동/리/가 토큰. */
const DONG = /^[가-힣0-9]+(동|리|가)$/;
/** 지번. `90-3`, `432번지` 형태. */
const JIBUN = /^\d+(-\d+)?(번지)?$/;
/** 사업지구·단지 명칭. `구`로 끝나지만 행정구역이 아니다. */
const NOT_SGG = /(지구|단지|블록|블럭)$/;
/**
 * 2026-07-01 인천 구 재편. 공고 주소는 개편 이전 이름을 쓰는데 카카오는 신 구명을 준다.
 * 신 구는 옛 구의 일부이므로 좌표는 맞다 — 이 조합만 예외로 통과시킨다.
 * 일반적인 구 불일치는 그대로 거부한다.
 */
const REORG_SIGUNGU: Record<string, readonly string[]> = {
  중구: ['중구', '제물포구', '영종구'],
  동구: ['동구', '제물포구'],
  서구: ['서구', '서해구', '검단구'],
};

/** 괄호·쉼표를 공백으로 바꿔 전체를 토큰화한다. 진짜 주소가 괄호 안에 있는 공고가 많다. */
function tokenize(address: string): string[] {
  return address.replace(/[(),]/g, ' ').split(/\s+/).filter(Boolean);
}

/** 시도 이름의 정확한 멤버십 확인. 강화도 같은 장소명이나 지구명과 혼동되지 않는다. */
function isSido(t: string): boolean {
  return SIDO_NAMES.has(t);
}

/**
 * 주소에서 시도·시군구를 뽑는다.
 *
 * 앞 두 토큰을 쓰지 않는다 — 시도가 문자열 앞에 없는 공고가 있고(`파주메디컬클러스터 … (경기도 파주시 …)`),
 * 일반구 도시는 `수원시 영통구`처럼 두 토큰을 합쳐야 카카오 `region2`와 같은 축이 된다.
 */
export function parseAddressRegion(address: string): AddressRegion {
  const toks = tokenize(address);
  const si = toks.findIndex(isSido);
  if (si === -1) return { sido: '', sigungu: null };

  const sido = toks[si];
  const rest = toks.slice(si + 1);
  const gi = rest.findIndex((t) => SGG_SUFFIX.test(t) && !NOT_SGG.test(t));
  if (gi === -1) return { sido, sigungu: null };

  const first = rest[gi];
  const next = rest[gi + 1];
  const next2 = rest[gi + 2];
  // 일반구: `수원시` 다음이 `영통구`면 합친다.
  // 지구 같은 사업명이 끼어 있으면 그 다음을 본다 (`수원시 광교지구 영통구`).
  if (/시$/.test(first)) {
    if (next && /구$/.test(next) && !NOT_SGG.test(next)) return { sido, sigungu: `${first} ${next}` };
    if (next2 && /구$/.test(next2) && !NOT_SGG.test(next2)) return { sido, sigungu: `${first} ${next2}` };
  }
  return { sido, sigungu: first };
}

/** `서울` vs `서울특별시`처럼 표기가 달라도 한쪽이 다른 쪽의 접두사면 같다고 본다. */
function prefixEq(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  if (a.length < 2 || b.length < 2) return false; // 한 글자 접두사는 우연 일치가 잦다
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * 시군구 비교. 양쪽 다 일반구까지 밝힌 경우에만 구를 정확히 대조한다.
 * 접두사 비교를 쓰면 `수원시`가 `수원시 팔달구`를 통과시켜, 틀린 구의 좌표가 들어온다.
 * 인천 구 재편(2026-07-01)은 예외: 옛 구가 신 구 여러 개로 나뉘었고,
 * 공고는 개편 이전 이름을 쓰지만 카카오 좌표는 신 구명을 준다. 두 조합이 모두 인천이면 허용한다.
 */
function sigunguMatches(a: string, b: string, sidoCanonical: string | null): boolean {
  const [aCity, aGu] = a.split(/\s+/);
  const [bCity, bGu] = b.split(/\s+/);
  // 인천 구 재편 예외: 한쪽이 단일 토큰(구명만) 또는 양쪽 다 구명을 가진 경우 확인
  if (sidoCanonical === '인천광역시' && (REORG_SIGUNGU[aCity] || REORG_SIGUNGU[aGu])) {
    const addrGu = aGu || aCity; // 단일 토큰이면 aCity가 구명
    const coordGu = bGu || bCity; // 단일 토큰이면 bCity가 구명
    if (REORG_SIGUNGU[addrGu]?.includes(coordGu)) return true;
  }
  if (!prefixEq(aCity, bCity)) return false;
  if (aGu && bGu) {
    if (aGu === bGu) return true;
    return false;
  }
  return true; // 한쪽이 구를 안 밝히면 시 단위까지만 확인 가능하다
}

/**
 * 카카오가 준 지역이 주소의 지역과 맞는지. 어긋나면 좌표를 버린다 —
 * 엉뚱한 좌표는 그 페이지의 주변 실거래·인프라를 통째로 다른 동네 것으로 만든다.
 */
export function regionMatches(
  addr: AddressRegion,
  coord: { region1: string | null; region2: string | null },
): boolean {
  const addrSidoCanonical = canonicalSido(addr.sido);
  const coordSidoCanonical = coord.region1 ? canonicalSido(coord.region1) : null;
  if (!addrSidoCanonical || !coordSidoCanonical || addrSidoCanonical !== coordSidoCanonical) return false;
  if (addr.sigungu === null) return true; // 세종처럼 시군구 계층이 없는 주소
  if (!coord.region2) return false;
  return sigunguMatches(addr.sigungu, coord.region2 as string, addrSidoCanonical);
}

/**
 * 지오코딩에 넣을 질의 후보. 넓은 것부터가 아니라 **좁은 것부터** 시도한다.
 *
 * 원문 주소를 그대로 넣으면 카카오가 못 찾는다(운영 40건 표본에서 0/40) — 청약 주소가
 * `… 김포신곡6지구 도시개발사업구역 A3BL`처럼 사업지구 서술형이기 때문이다.
 * 괄호 안까지 훑어 `동/리 + 지번`을 재조립하면 39/40이 찾힌다.
 */
export function geocodeCandidates(address: string): string[] {
  const { sido, sigungu } = parseAddressRegion(address);
  if (!sido) return [];
  const head = [sido, sigungu?.split(/\s+/)[0]].filter(Boolean).join(' ');

  const toks = tokenize(address);
  const out: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    if (!DONG.test(toks[i])) continue;
    const jibun = toks[i + 1] && JIBUN.test(toks[i + 1]) ? toks[i + 1].replace('번지', '') : '';
    if (jibun) out.push(`${head} ${toks[i]} ${jibun}`);
    out.push(`${head} ${toks[i]}`);
  }
  if (out.length === 0) out.push(head);

  return [...new Set(out)].slice(0, 3);
}
