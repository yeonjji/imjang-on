/**
 * 공동주택 단지정보 API 응답 → 정규화 행. 순수 함수.
 *
 * 실제 응답(2026-09-07)의 함정 세 가지를 여기서 흡수한다.
 *  - 목록의 `items`가 배열로 직접 온다({item:[...]} 래핑이 아니다).
 *  - 같은 성격의 숫자가 타입이 갈린다: kaptdaCnt=9510.0(실수), kaptDongCnt="84"(문자열),
 *    kaptTopFloor=35(정수).
 *  - 빈 값이 null·""·" " 세 형태로 온다.
 */
import { normalizeName } from '@/lib/slug';
import type { AptListRow, AptDetailRow } from './types';

type Rec = Record<string, unknown>;

function body(payload: unknown): Rec {
  const p = payload as Rec | undefined;
  const res = p?.response as Rec | undefined;
  return (res?.body as Rec) ?? {};
}

/** null·""·" " 를 전부 null로. 0은 살린다. */
function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function int(v: unknown): number | null {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** "20181228" → Date. 형식이 아니면 null. */
function ymd(v: unknown): Date | null {
  const s = str(v);
  if (!s || !/^\d{8}$/.test(s)) return null;
  const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseAptList(payload: unknown): { rows: AptListRow[]; totalCount: number } {
  const b = body(payload);
  // 실제 응답은 items가 배열이다. {item:[...]}·{item:{}} 래핑도 방어적으로 받는다.
  const items = b.items;
  let raw: unknown;
  if (Array.isArray(items)) raw = items;
  else if (items && typeof items === 'object') raw = (items as Rec).item;
  if (raw == null) raw = [];
  const arr = (Array.isArray(raw) ? raw : [raw]) as Rec[];

  const rows: AptListRow[] = [];
  for (const it of arr) {
    const kaptCode = str(it.kaptCode);
    const kaptName = str(it.kaptName);
    const bjdCode = str(it.bjdCode);
    if (!kaptCode || !kaptName || !bjdCode) continue;
    rows.push({
      kaptCode,
      kaptName,
      nameNorm: normalizeName(kaptName),
      bjdCode,
      sigunguCode: bjdCode.slice(0, 5),
      as3: str(it.as3),
    });
  }
  return { rows, totalCount: int(b.totalCount) ?? 0 };
}

export function parseAptDetail(kaptCode: string, basis: unknown, dtl: unknown): AptDetailRow {
  const b = (body(basis).item as Rec) ?? {};
  const d = (body(dtl).item as Rec) ?? {};
  const merged: Rec = { ...b, ...d };

  return {
    kaptCode,
    households: int(b.kaptdaCnt),
    buildingCount: int(b.kaptDongCnt),
    usedate: ymd(b.kaptUsedate),
    hallType: str(b.codeHallNm),
    heatType: str(b.codeHeatNm),
    aptKind: str(b.codeAptNm),
    topFloor: int(b.kaptTopFloor),
    baseFloor: int(b.kaptBaseFloor),
    area60: int(b.kaptMparea60),
    area85: int(b.kaptMparea85),
    area135: int(b.kaptMparea135),
    area136: int(b.kaptMparea136),
    parkingGround: int(d.kaptdPcnt),
    parkingUnder: int(d.kaptdPcntu),
    subwayLine: str(d.subwayLine),
    subwayStation: str(d.subwayStation),
    walkSubway: str(d.kaptdWtimesub),
    walkBus: str(d.kaptdWtimebus),
    // EV는 상세정보의 지상/지하 분리 필드다. 기본정보의 kaptdEcntp(헬리오시티 183)는
    // 승강기 계열 값이라 EV가 아니다 — 설계 단계에서 이걸 EV로 착각했었다.
    evGround: int(d.groundElChargerCnt),
    evUnder: int(d.undergroundElChargerCnt),
    elevator: int(d.kaptdEcnt),
    cctv: int(d.kaptdCccnt),
    builder: str(b.kaptBcompany),
    welfareFacility: str(d.welfareFacility),
    convenientFacility: str(d.convenientFacility),
    educationFacility: str(d.educationFacility),
    // useYn이 없으면 사용중으로 본다(응답에 필드가 없는 경우가 있다).
    inUse: str(d.useYn) !== 'N',
    rawJson: merged,
  };
}

/**
 * 면적별 세대수를 비율로 쓸 수 있는지. **허용오차 없음.**
 * 완화(±1 또는 ≤0.1%)는 audit 리포트의 분포를 본 뒤 별도로 결정한다.
 */
export function areaSumMatches(
  row: Pick<AptDetailRow, 'area60' | 'area85' | 'area135' | 'area136' | 'households'>,
): boolean {
  const parts = [row.area60, row.area85, row.area135, row.area136];
  if (parts.some((p) => p == null) || row.households == null) return false;
  return parts.reduce((a, b) => (a ?? 0) + (b ?? 0), 0) === row.households;
}
