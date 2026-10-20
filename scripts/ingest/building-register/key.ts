/**
 * 실거래 (시군구, 동 이름, 지번) → 건축물대장 조회 키. 단지의 모든 거래가 같은 키로 모여야 한다.
 * 변환하지 못하는 쌍이 하나라도 있으면 호출하지 않는다(엉뚱한 건물 연결 방지가 우선).
 */
export interface TxPair {
  sigunguCode: string;
  umd: string | null;
  jibun: string | null;
}

export interface RegisterKey {
  bjdCode: string;
  platGbCd: '0' | '1';
  bun: string;
  ji: string;
}

export type KeyResult = { status: 'ok'; key: RegisterKey } | { status: 'multi_pair' | 'bad_key' };

export const lookupKey = (sigunguCode: string, name: string) => `${sigunguCode}|${name}`;

const JIBUN = /^(산)?(\d+)(?:-(\d+))?$/;

export function buildRegisterKey(pairs: TxPair[], lookup: Map<string, string[]>): KeyResult {
  if (pairs.length === 0) return { status: 'bad_key' };
  const keys = new Map<string, RegisterKey>();
  for (const p of pairs) {
    const m = JIBUN.exec((p.jibun ?? '').trim());
    const codes = p.umd ? lookup.get(lookupKey(p.sigunguCode, p.umd.trim())) : undefined;
    if (!m || !codes || codes.length !== 1) return { status: 'bad_key' };
    const key: RegisterKey = {
      bjdCode: codes[0],
      platGbCd: m[1] ? '1' : '0',
      bun: m[2].padStart(4, '0'),
      ji: (m[3] ?? '0').padStart(4, '0'),
    };
    keys.set(`${key.bjdCode}${key.platGbCd}${key.bun}${key.ji}`, key);
  }
  if (keys.size > 1) return { status: 'multi_pair' };
  return { status: 'ok', key: [...keys.values()][0] };
}
