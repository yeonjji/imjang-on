// 국립중앙의료원 기관을 우리 Hospital에 붙인다. 확실할 때(1:1)만 — 잘못 붙이는 것보다 비워 두는 게 낫다.
// 경남 실측(2026-10-27): 이름+도로명 주소로 95% 이상 1:1.
import type { NemcHospital } from './nemc';

export interface OurHospital {
  id: bigint;
  name: string;
  address: string;
  tel: string | null;
}

export const normName = (s: string) => s.replace(/\(.*?\)/g, '').replace(/\s+/g, '');
export const normRoad = (s: string) =>
  s.replace(/\(.*?\)/g, '').split(',')[0].replace(/\s+/g, ' ').trim();
export const normTel = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

export function buildMatcher(ours: OurHospital[]): (n: NemcHospital) => bigint | null {
  const byNameAddr = new Map<string, bigint[]>();
  const byNameTel = new Map<string, bigint[]>();
  const push = (m: Map<string, bigint[]>, k: string, id: bigint) => m.set(k, [...(m.get(k) ?? []), id]);
  for (const h of ours) {
    push(byNameAddr, `${normName(h.name)}|${normRoad(h.address)}`, h.id);
    const t = normTel(h.tel);
    if (t) push(byNameTel, `${normName(h.name)}|${t}`, h.id);
  }
  return (n) => {
    const a = byNameAddr.get(`${normName(n.name)}|${normRoad(n.addr)}`);
    if (a) return a.length === 1 ? a[0] : null;
    const t = normTel(n.tel);
    const b = t ? byNameTel.get(`${normName(n.name)}|${t}`) : undefined;
    return b && b.length === 1 ? b[0] : null;
  };
}
