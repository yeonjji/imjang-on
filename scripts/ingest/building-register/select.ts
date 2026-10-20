/**
 * 조회된 건축물대장에서 단지에 해당하는 건물을 특정한다(spec §3 조건 2~4).
 * 확실하지 않으면 채택하지 않는다 — 틀린 건물 정보를 보여주는 것보다 섹션을 숨기는 편이 낫다.
 */
export type Rec = Record<string, unknown>;
export type PropertyKind = 'APARTMENT' | 'OFFICETEL' | 'ROW_HOUSE' | 'MULTIPLEX';
export type RejectStatus = 'not_found' | 'ambiguous' | 'year_unknown' | 'year_mismatch' | 'purpose_mismatch';
export type SelectResult = { status: 'matched'; recap: Rec | null; mains: Rec[] } | { status: RejectStatus };

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
export const isMain = (t: Rec) => str(t.mainAtchGbCd) === '0';
const yearOf = (v: unknown) => {
  const s = str(v);
  return /^\d{4}/.test(s) ? Number(s.slice(0, 4)) : null;
};
const norm = (s: string) => s.replace(/[\s()\-·.]/g, '').replace(/아파트/g, '');

function pick(type: PropertyKind, name: string, recap: Rec[], mains: Rec[]): { recap: Rec | null; mains: Rec[] } | null {
  if (type === 'APARTMENT' && recap.length === 1) return { recap: recap[0], mains };
  if (mains.length === 1) return { recap: recap.length === 1 ? recap[0] : null, mains };
  if (type !== 'APARTMENT' && recap.length === 1) return { recap: recap[0], mains };
  const n = norm(name);
  if (!n) return null;
  const hits = mains.filter((t) => {
    const b = norm(str(t.bldNm));
    // 한두 글자 건물명('A', '1')은 아무 이름에나 포함되므로 쓰지 않는다
    return b.length >= 2 && (b.includes(n) || n.includes(b));
  });
  if (hits.length === 0 || new Set(hits.map((t) => str(t.bldNm))).size !== 1) return null;
  return { recap: null, mains: hits };
}

export function selectTarget(input: { type: PropertyKind; name: string; builtYear: number | null; recap: Rec[]; titles: Rec[] }): SelectResult {
  const mainsAll = input.titles.filter(isMain);
  if (input.recap.length === 0 && mainsAll.length === 0) return { status: 'not_found' };
  const chosen = pick(input.type, input.name, input.recap, mainsAll);
  if (!chosen || chosen.mains.length === 0) return { status: 'ambiguous' };

  const years = [...chosen.mains.map((t) => yearOf(t.useAprDay)), chosen.recap ? yearOf(chosen.recap.useAprDay) : null]
    .filter((y): y is number => y !== null);
  if (input.builtYear === null || years.length === 0) return { status: 'year_unknown' };
  if (!years.some((y) => Math.abs(y - input.builtYear!) <= 1)) return { status: 'year_mismatch' };

  const purposeOk = (t: Rec) => {
    const p = `${str(t.mainPurpsCdNm)} ${str(t.etcPurps)}`;
    return input.type === 'OFFICETEL' ? /오피스텔|업무|공동주택/.test(p) : p.includes('주택');
  };
  if (input.type === 'APARTMENT') {
    // 아파트는 상가동·관리동까지 단지의 주건축물로 둔다(동 수·내진 집계용). 하나라도 주택이면 통과.
    if (!chosen.mains.some(purposeOk)) return { status: 'purpose_mismatch' };
    return { status: 'matched', ...chosen };
  }
  // 비아파트는 같은 필지의 상가동·지식산업센터가 섞이지 않도록 용도가 맞는 건물만 남긴다
  // (근린생활시설 안내·주용도는 '바로 그 건물' 기준이어야 한다).
  const mains = chosen.mains.filter(purposeOk);
  if (mains.length === 0) return { status: 'purpose_mismatch' };
  return { status: 'matched', recap: chosen.recap, mains };
}
