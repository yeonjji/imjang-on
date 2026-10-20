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
    return b !== '' && (b.includes(n) || n.includes(b));
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

  const purpose = chosen.mains.map((t) => `${str(t.mainPurpsCdNm)} ${str(t.etcPurps)}`).join(' ');
  const ok = input.type === 'OFFICETEL' ? /오피스텔|업무|공동주택/.test(purpose) : purpose.includes('주택');
  if (!ok) return { status: 'purpose_mismatch' };
  return { status: 'matched', ...chosen };
}
