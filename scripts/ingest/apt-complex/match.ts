/**
 * 공동주택 단지(AptComplex) ↔ Property 매칭 판정. **DB를 모른다.**
 *
 * 매칭 규칙은 앞으로 계속 손볼 부분이라 순수 함수로 떼어 둔다. 픽스처만으로 회귀를 잡는다.
 * 임계값·게이트의 근거는 스펙 §5(2026-09-07 실측)에 있다.
 */
import { normalizeName } from '@/lib/slug';

/** 이름 완전일치가 32%에 그치는 첫 번째 이유 — API가 "…아파트"를 달고 온다. */
function stripAptSuffix(nameNorm: string): string {
  return nameNorm.replace(/(아파트|apt)$/, '');
}

/** 남는 이름이 2자 미만이면 벗기지 않는다. "잠실동"(동명과 같은 단지명)이 "동"이 되는 걸 막는다. */
const MIN_STEM_LEN = 2;

/**
 * 두 번째 이유 — 읍면동명이 이름 앞에 붙는다("잠실동트리지움", "범어에일린의뜰").
 * 전체 동명과 어간("잠실동" → "잠실") 순으로 시도한다.
 */
function stripDongPrefix(nameNorm: string, dong: string | null): string {
  if (!dong) return nameNorm;
  const full = normalizeName(dong);
  for (const p of [full, full.replace(/[0-9]*(동|읍|면|리|가)$/, '')]) {
    if (p && nameNorm.startsWith(p) && nameNorm.length - p.length >= MIN_STEM_LEN) {
      return nameNorm.slice(p.length);
    }
  }
  return nameNorm;
}

/** API 단지명 → 대표 매칭 키(동명 접두 제거본). */
export function complexKey(kaptName: string, as3: string | null): string {
  return stripDongPrefix(stripAptSuffix(normalizeName(kaptName)), as3);
}

/** Property.nameNorm → 대표 매칭 키. */
export function propertyKey(nameNorm: string): string {
  return stripAptSuffix(nameNorm);
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

/**
 * 동명 접두는 **양쪽 어디에도** 붙을 수 있다. API가 "잠실동트리지움"으로 주는가 하면,
 * 우리 쪽이 "범어에일린의뜰"인데 API는 "에일린의뜰"인 경우도 있다. 한쪽만 벗기면
 * 키가 갈려 완전일치가 실패한다(표본에서 완전일치가 48%에 그친 이유).
 * 그래서 양쪽 다 "벗긴 것/안 벗긴 것" 두 형태를 만들어 교차 비교한다.
 */
export function complexKeys(kaptName: string, as3: string | null): string[] {
  const base = stripAptSuffix(normalizeName(kaptName));
  return uniq([base, stripDongPrefix(base, as3)]);
}

export function propertyKeys(nameNorm: string, address: string): string[] {
  const base = stripAptSuffix(nameNorm);
  return uniq([base, stripDongPrefix(base, dongOfAddress(address))]);
}

/**
 * Property.address 선두의 동명. "범어동 2305" → "범어동".
 * 한글 뒤 `\b`는 JS에서 동작하지 않는다(ASCII 단어경계) — 전방탐색으로 경계를 만든다.
 */
export function dongOfAddress(address: string): string | null {
  const m = address.trim().match(/^([가-힣]+[0-9]*(?:동|읍|면|리|가))(?=[\s0-9-]|$)/);
  return m ? m[1] : null;
}

/** "수성동1가" ↔ "수성동" 같은 표기 깊이 차이는 같은 동으로 본다. */
export function dongMatches(as3: string | null, addressDong: string | null): boolean {
  if (!as3 || !addressDong) return false;
  if (as3 === addressDong) return true;
  const trim = (s: string) => s.replace(/[0-9]+가$/, '');
  if (trim(as3) === trim(addressDong)) return true;
  return as3.startsWith(addressDong) || addressDong.startsWith(as3);
}

/** Dice 계수(bigram 기반). 한 글자 문자열은 bigram이 없어 0이다. */
export function diceSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const g = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
    return g;
  };
  const A = grams(a);
  const B = grams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

export const SIMILARITY_THRESHOLD = 0.85;

/** 로마숫자 차수 표기. normalizeName이 소문자화하므로 Ⅰ은 ⅰ로 들어온다. */
const ROMAN: Record<string, string> = { 'ⅰ': '1', 'ⅱ': '2', 'ⅲ': '3', 'ⅳ': '4', 'ⅴ': '5' };

/**
 * 이름 끝의 차수. "…2차"·"…1단지"·"…215동"·"…ⅱ" → "2"·"1"·"215"·"2". 없으면 null.
 *
 * 유사도만으로는 차수가 다른 이웃 단지가 붙는다(실측: "동탄파라곤2" → "동탄파라곤",
 * "더샵신문그리니티1차" → "더샵신문그리니티"). 동명 게이트는 같은 동이라 통과시킨다.
 */
export function phaseOf(key: string): string | null {
  const m = key.match(/([0-9]+|[ⅰ-ⅴ])(차|단지|동)?$/);
  if (!m) return null;
  return ROMAN[m[1]] ?? m[1];
}

export interface MatchCandidate {
  id: bigint;
  nameNorm: string;
  address: string;
}

export interface MatchResult {
  propertyId: bigint;
  tier: 1 | 2;
}

/**
 * 계단식 판정. 애매하면 **버린다** — 부가정보라 놓치면 빈칸이지만 틀리면 거짓말이다.
 * (거래 적재의 findOrCreateProperty가 모호할 때 첫 번째를 고르는 것과 판단 기준이 반대다.)
 */
export function decideMatch(
  complex: { kaptName: string; as3: string | null },
  candidates: MatchCandidate[],
  threshold: number = SIMILARITY_THRESHOLD,
): MatchResult | null {
  const cKeys = complexKeys(complex.kaptName, complex.as3);
  if (cKeys.length === 0) return null;

  // 동명 게이트는 Tier1에도 건다. 동명 접두를 벗기면("풍납동신동아" → "신동아")
  // 다른 동의 흔한 이름과 완전일치해 버린다. 전수 실측에서 Tier1 11,296건 중
  // 342건(3%)이 이 경로로 잘못 붙었다 — "숭의현대"(숭의동) → "현대"(주안동) 식이다.
  const sameDong = (c: MatchCandidate) => dongMatches(complex.as3, dongOfAddress(c.address));

  const exact = candidates.filter(
    (c) => sameDong(c) && propertyKeys(c.nameNorm, c.address).some((pk) => cKeys.includes(pk)),
  );
  if (exact.length === 1) return { propertyId: exact[0].id, tier: 1 };
  if (exact.length > 1) return null;

  let best: MatchCandidate | null = null;
  let bestScore = 0;
  let tied = false;
  for (const c of candidates) {
    const pKeys = propertyKeys(c.nameNorm, c.address);
    let s = 0;
    for (const ck of cKeys) {
      for (const pk of pKeys) {
        // 차수가 어긋나면 유사도가 아무리 높아도 다른 단지다.
        if (phaseOf(ck) !== phaseOf(pk)) continue;
        s = Math.max(s, diceSimilarity(ck, pk));
      }
    }
    if (s > bestScore) {
      bestScore = s;
      best = c;
      tied = false;
    } else if (s === bestScore && s > 0) {
      tied = true;
    }
  }
  if (!best || tied || bestScore < threshold) return null;
  if (!sameDong(best)) return null;
  return { propertyId: best.id, tier: 2 };
}
