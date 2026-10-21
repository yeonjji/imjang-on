/**
 * 청약 결과 섹션 표시 모델(순수). UI 확정본: docs/superpowers/mockups/2026-10-20-subscription-results.html
 * - 경쟁률·미달은 청약홈 공식값 그대로. '(△n)'은 앞 단계부터 누적한 잔여 세대라 다시 계산하지 않는다.
 * - 요약(1순위 해당지역 전체)과 특별공급 경쟁률만 임장ON 계산이다.
 * - SUPLY_HSHLDCO는 순위·지역 행마다 반복되므로 주택형당 1번만 더한다.
 */

type Row = Record<string, unknown>;

export type Rate = { kind: 'rate'; value: number } | { kind: 'short'; n: number } | { kind: 'none' };

export function parseRate(raw: unknown): Rate {
  const s = String(raw ?? '').trim();
  const short = /^\(△\s*([\d,]+)\)$/.exec(s);
  if (short) return { kind: 'short', n: Number(short[1].replace(/,/g, '')) };
  const clean = s.replace(/,/g, '');
  if (/^\d+(\.\d+)?$/.test(clean)) return { kind: 'rate', value: Number(clean) };
  return { kind: 'none' };
}

const fixed2 = (n: number) =>
  n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = (n: number) => n.toLocaleString('ko-KR');

export function formatRate(r: Rate): string {
  if (r.kind === 'rate') return `${fixed2(r.value)} : 1`;
  if (r.kind === 'short') return `미달 ${int(r.n)}세대`;
  return '—';
}

export function houseTypeLabel(raw: unknown): string {
  const s = String(raw ?? '').trim();
  const m = /^(\d{2,3}\.\d+)\s*([A-Za-z0-9]*)$/.exec(s);
  if (!m) return s;
  const area = Number(m[1]).toFixed(2);
  return m[2] ? `${area}㎡ ${m[2]}` : `${area}㎡`;
}

function num(v: unknown): number {
  const n = Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function rowsOf(v: unknown): Row[] {
  return Array.isArray(v) ? (v.filter((r) => r && typeof r === 'object') as Row[]) : [];
}

function groupByType(rows: Row[]): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const key = String(r.HOUSE_TY ?? '').trim();
    const list = m.get(key);
    if (list) list.push(r);
    else m.set(key, [r]);
  }
  return m;
}

export interface AptResultsView {
  kind: 'apt';
  summary: {
    requests: number;
    supply: number;
    /** 1순위 해당지역 Σ접수 ÷ Σ공급(임장ON 계산), 소수 둘째 자리 */
    overall: string | null;
    top: { type: string; rate: string } | null;
    /** 주택형별 마지막 값이 미달인 세대 합(공식값) */
    shortfall: number;
  };
  columns: string[];
  rows: { type: string; cells: string[] }[];
  hasDash: boolean;
  hasShort: boolean;
  scores: {
    showRegion: boolean;
    region: string;
    rows: { type: string; region: string; low: string; avg: string; top: string }[];
  } | null;
  special: { label: string; alloc: string; req: string; rate: string }[] | null;
}

export interface SimpleResultsView {
  kind: 'simple';
  typeHeader: string;
  kindHeader: string | null;
  rows: { type: string; kind: string | null; supply: string; req: string; rate: string }[];
}

export type ResultsView = AptResultsView | SimpleResultsView;

export interface SubscriptionResultsData {
  view: ResultsView;
  fetchedLabel: string;
}

// 해당지역 → 기타경기 → 기타지역: 미달 누적이 이 순서로 진행된다.
const REGION_ORDER = ['01', '03', '02'];
const REGION_LABEL: Record<string, string> = { '01': '해당지역', '03': '기타경기', '02': '기타지역' };

const SPECIAL_TYPES: { label: string; alloc: string; cnt: string }[] = [
  { label: '생애최초', alloc: 'LFE_FRST_HSHLDCO', cnt: 'LFE_FRST' },
  { label: '신혼부부', alloc: 'NWWDS_NMTW_HSHLDCO', cnt: 'NWWDS_NMTW' },
  { label: '신생아', alloc: 'NWBB_NWBBSHR_HSHLDCO', cnt: 'NWBB_NWBBSHR' },
  { label: '다자녀', alloc: 'MNYCH_HSHLDCO', cnt: 'MNYCH' },
  { label: '청년', alloc: 'YGMN_HSHLDCO', cnt: 'YGMN' },
  { label: '노부모', alloc: 'OLD_PARNTS_SUPORT_HSHLDCO', cnt: 'OPS' },
];

const positive = (v: unknown) => {
  const s = String(v ?? '').trim();
  return /^\d+(\.\d+)?$/.test(s) && Number(s) > 0;
};

function buildApt(competition: Row[], scores: Row[], special: Row[]): AptResultsView {
  const types = groupByType(competition);
  const rank1 = competition.filter((r) => num(r.SUBSCRPT_RANK_CODE) === 1);
  const otherRegions = REGION_ORDER.filter(
    (c) => c !== '01' && rank1.some((r) => String(r.RESIDE_SECD) === c),
  );
  const hasRank2 = competition.some(
    (r) => num(r.SUBSCRPT_RANK_CODE) === 2 && parseRate(r.CMPET_RATE).kind !== 'none',
  );

  let requests = 0;
  let supply = 0;
  let shortfall = 0;
  let top: { type: string; value: number } | null = null;
  let hasDash = false;
  let hasShort = false;
  const rows: AptResultsView['rows'] = [];

  for (const [ty, list] of types) {
    const label = houseTypeLabel(ty);
    const sup = num(list[0].SUPLY_HSHLDCO);
    supply += sup;
    const find = (rank: number, secd: string) =>
      list.find((r) => num(r.SUBSCRPT_RANK_CODE) === rank && String(r.RESIDE_SECD) === secd);

    const local = find(1, '01');
    const localReq = num(local?.REQ_CNT);
    requests += localReq;
    const localRate = parseRate(local?.CMPET_RATE);
    if (localRate.kind === 'rate' && (!top || localRate.value > top.value))
      top = { type: label, value: localRate.value };

    const rates: Rate[] = [localRate, ...otherRegions.map((c) => parseRate(find(1, c)?.CMPET_RATE))];
    const rank2 = REGION_ORDER.map((c) => parseRate(find(2, c)?.CMPET_RATE)).filter(
      (r) => r.kind !== 'none',
    );
    const rank2Final: Rate = rank2.length ? rank2[rank2.length - 1] : { kind: 'none' };
    if (hasRank2) rates.push(rank2Final);

    const last = [...rates].reverse().find((r) => r.kind !== 'none');
    if (last?.kind === 'short') shortfall += last.n;
    for (const r of rates) {
      if (r.kind === 'none') hasDash = true;
      if (r.kind === 'short') hasShort = true;
    }
    rows.push({ type: label, cells: [int(sup), int(localReq), ...rates.map(formatRate)] });
  }

  const columns = [
    '공급',
    '해당지역 접수',
    '해당지역 경쟁률',
    ...otherRegions.map((c) => REGION_LABEL[c]),
    ...(hasRank2 ? ['2순위'] : []),
  ];

  const scoreRows = scores
    .filter((r) => positive(r.LWET_SCORE) && positive(r.AVRG_SCORE) && positive(r.TOP_SCORE))
    .map((r) => ({
      type: houseTypeLabel(r.HOUSE_TY),
      region: String(r.RESIDE_SENM ?? '').trim(),
      low: String(r.LWET_SCORE).trim(),
      avg: String(r.AVRG_SCORE).trim(),
      top: String(r.TOP_SCORE).trim(),
    }));
  const regions = new Set(scoreRows.map((r) => r.region));

  const specialRows = SPECIAL_TYPES.map((t) => {
    let alloc = 0;
    let req = 0;
    for (const r of special) {
      alloc += num(r[t.alloc]);
      req += num(r[`CRSPAREA_${t.cnt}_CNT`]) + num(r[`CTPRVN_${t.cnt}_CNT`]) + num(r[`ETC_AREA_${t.cnt}_CNT`]);
    }
    return { label: t.label, alloc, req };
  })
    .filter((t) => t.alloc > 0)
    .map((t) => ({
      label: t.label,
      alloc: int(t.alloc),
      req: int(t.req),
      rate: formatRate({ kind: 'rate', value: t.req / t.alloc }),
    }));

  return {
    kind: 'apt',
    summary: {
      requests,
      supply,
      overall: supply > 0 ? fixed2(requests / supply) : null,
      top: top ? { type: top.type, rate: fixed2(top.value) } : null,
      shortfall,
    },
    columns,
    rows,
    hasDash,
    hasShort,
    scores: scoreRows.length
      ? { showRegion: regions.size > 1, region: scoreRows[0].region, rows: scoreRows }
      : null,
    special: specialRows.length ? specialRows : null,
  };
}

function buildSimple(category: string, competition: Row[]): SimpleResultsView {
  const pubPriv = category === 'PUB_PRIV_RENT';
  const officetel = category === 'OFFICETEL_ETC';
  const rows = competition
    .filter((r) => !pubPriv || num(r.SPSPLY_KND_HSHLDCO) > 0 || num(r.REQ_CNT) > 0)
    .map((r) => ({
      type: houseTypeLabel(r.HOUSE_TY),
      kind: pubPriv
        ? String(r.SPSPLY_KND_NM ?? '').trim()
        : officetel
          ? String(r.RESIDNT_PRIOR_SENM ?? '').trim()
          : null,
      supply: int(num(pubPriv ? r.SPSPLY_KND_HSHLDCO : r.SUPLY_HSHLDCO)),
      req: int(num(r.REQ_CNT)),
      rate: formatRate(parseRate(r.CMPET_RATE)),
    }));
  return {
    kind: 'simple',
    typeHeader: officetel ? '타입' : '주택형',
    kindHeader: pubPriv ? '공급유형' : officetel ? '구분' : null,
    rows,
  };
}

const SIMPLE = new Set(['OFFICETEL_ETC', 'PUB_PRIV_RENT', 'REMNANT', 'ARBITRARY']);

export function buildResultsView(
  category: string,
  competition: unknown,
  scores: unknown,
  special: unknown,
): ResultsView | null {
  const cmp = rowsOf(competition);
  if (!cmp.length) return null;
  if (category === 'APT') return buildApt(cmp, rowsOf(scores), rowsOf(special));
  if (SIMPLE.has(category)) {
    const v = buildSimple(category, cmp);
    return v.rows.length ? v : null;
  }
  return null;
}
