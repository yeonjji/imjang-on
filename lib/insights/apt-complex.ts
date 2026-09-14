/**
 * 단지정보 파생 지표. **DB를 모른다.**
 *
 * 원자료를 그대로 쓰지 않는다. "주차 12,096대"가 아니라 "세대당 1.27대",
 * "승강기 384대"가 아니라 "25세대당 1대"로 바꾼다. 나눗셈 방향은 값마다 다르다 —
 * 주차·EV·CCTV는 세대당이 직관적이고, 승강기는 역수라야 읽힌다(0.04대 vs 25세대당 1대).
 */

export type BandLabel = '60㎡ 이하' | '60~85㎡' | '85~135㎡' | '135㎡ 초과';

export interface ComplexFacts {
  households: number | null;
  buildingCount: number | null;
  usedate: Date | null;
  hallType: string | null;
  topFloor: number | null;
  baseFloor: number | null;
  area60: number | null;
  area85: number | null;
  area135: number | null;
  area136: number | null;
  parkingGround: number | null;
  parkingUnder: number | null;
  evGround: number | null;
  evUnder: number | null;
  elevator: number | null;
  cctv: number | null;
  builder: string | null;
  /** 출처 캡션의 기준일. 수집이 수동이라 데이터는 이 시점 기준이다. */
  fetchedAt: Date | null;
}

export interface UnitMix {
  /** 항상 4개. units 0인 밴드도 남긴다(구성 바에서 자리를 차지해야 한다). */
  bands: { label: BandLabel; units: number; pct: number }[];
  /** 85㎡ 이하 비중 — 중소형/중대형 판정 근거. */
  smallMidPct: number;
  /** 최대 밴드. 동률이면 작은 면적 우선. */
  dominant: { label: BandLabel; pct: number };
}

export interface DensityFacts {
  parkingPerHousehold: number | null;
  /** 지상 0 **그리고** 지하 > 0. 둘 다 0인 빈 레코드를 '전면 지하'로 읽으면 안 된다. */
  parkingAllUnderground: boolean;
  evPer100: number | null;
  /** 역수 — "N세대당 1대". */
  householdsPerElevator: number | null;
  cctvPer100: number | null;
}

const BANDS: BandLabel[] = ['60㎡ 이하', '60~85㎡', '85~135㎡', '135㎡ 초과'];

/**
 * 면적 구성. **4칸 완비 + 합이 세대수와 정확히 일치할 때만** 만든다.
 * 운영 실측(2026-09-08, 22,301건)에서 불일치는 0건이라 이 검사는 통과 전용이지만,
 * 비중을 %로 보이는 순간 합이 100%가 아니면 들통나므로 가드를 남긴다.
 *
 * 비중 계산은 최대 잔여 배분(largest remainder method)을 쓴다. 각 밴드를 따로
 * 반올림하면 합이 100이 아닐 수 있기 때문(운영 실측 6.0%). 이 비중은 화면 구성
 * 바의 폭으로 그대로 쓰이므로 합이 100이어야 한다.
 */
export function buildUnitMix(f: ComplexFacts): UnitMix | null {
  const units = [f.area60, f.area85, f.area135, f.area136];
  if (units.some((u) => u == null)) return null;
  if (f.households == null || f.households <= 0) return null;
  const total = units.reduce((a, b) => a! + b!, 0)!;
  if (total !== f.households) return null;

  // 최대 잔여 배분: 각 밴드의 정확한 백분율에서 내림값을 취하고,
  // 100에서 내림값 합을 뺀 나머지를 소수부가 큰 밴드부터 1씩 나눠 준다.
  const percentages = units.map((u) => (u! / total) * 100);
  const floors = percentages.map((p) => Math.floor(p));
  const fractionals = percentages.map((p) => p - Math.floor(p));
  const remainder = 100 - floors.reduce((a, b) => a + b, 0);

  // 소수부가 큰 순으로 정렬. 동률이면: units 큼 우선, 그것도 같으면 인덱스 작음 우선
  const sortedIndices = [0, 1, 2, 3].sort((i, j) => {
    if (fractionals[i] !== fractionals[j]) {
      return fractionals[j] - fractionals[i]; // 내림차순
    }
    if (units[i]! !== units[j]!) {
      return units[j]! - units[i]!; // units 큰 것 우선
    }
    return i - j; // 인덱스 작은 것 우선
  });

  const allocations = [...floors];
  for (let i = 0; i < remainder; i++) {
    allocations[sortedIndices[i]]++;
  }

  const bands = BANDS.map((label, i) => ({
    label,
    units: units[i]!,
    pct: allocations[i],
  }));

  let dominant = bands[0];
  for (const b of bands) if (b.units > dominant.units) dominant = b; // 동률이면 앞(작은 면적) 유지
  return {
    bands,
    smallMidPct: bands[0].pct + bands[1].pct,
    dominant: { label: dominant.label, pct: dominant.pct },
  };
}

const per = (n: number | null, households: number | null): number | null =>
  n == null || households == null || households <= 0 ? null : n / households;

export function buildDensity(f: ComplexFacts): DensityFacts {
  // 지상·지하 중 하나라도 없으면 총합을 알 수 없다. 모르는 값을 0으로 치면 과소 집계다.
  const parkTotal = f.parkingGround != null && f.parkingUnder != null ? f.parkingGround + f.parkingUnder : null;
  const evTotal = f.evGround != null && f.evUnder != null ? f.evGround + f.evUnder : null;
  const evRatio = per(evTotal, f.households);
  const cctvRatio = per(f.cctv, f.households);

  return {
    parkingPerHousehold: per(parkTotal, f.households),
    parkingAllUnderground: f.parkingGround === 0 && (f.parkingUnder ?? 0) > 0,
    evPer100: evRatio == null ? null : evRatio * 100,
    householdsPerElevator:
      f.elevator == null || f.elevator <= 0 || f.households == null
        ? null
        : Math.round(f.households / f.elevator),
    cctvPer100: cctvRatio == null ? null : cctvRatio * 100,
  };
}

/**
 * 준공 연차. **기준일을 인자로 받는다** — 안에서 new Date()를 부르면 해가 바뀔 때
 * 테스트가 저절로 깨진다. 월 단위를 버리는 건 ISR 때문이다: 렌더 시점 값이 캐시에
 * 박제되므로 정밀할수록 오래 틀린다.
 */
export function buildingAgeYears(usedate: Date | null, now: Date): number | null {
  if (!usedate) return null;
  let years = now.getUTCFullYear() - usedate.getUTCFullYear();
  const before =
    now.getUTCMonth() < usedate.getUTCMonth() ||
    (now.getUTCMonth() === usedate.getUTCMonth() && now.getUTCDate() < usedate.getUTCDate());
  if (before) years--;
  return Math.max(0, years);
}

/**
 * 「단지 정보」 섹션을 띄울지. **타일 3개 미만이면 숨긴다.**
 * 한두 칸짜리 카드는 정보가 아니라 빈칸으로 읽히고, 그런 페이지가 느는 것이 곧 얇은 콘텐츠다.
 * 본문과 사이드바 네비가 갈리지 않도록 판정을 여기 하나로 모은다.
 */
export function shouldRenderComplexInfo(f: ComplexFacts | null, now: Date): boolean {
  if (!f) return false;
  const d = buildDensity(f);
  const tiles = [
    d.parkingPerHousehold,
    buildingAgeYears(f.usedate, now),
    d.householdsPerElevator,
    d.evPer100,
    d.cctvPer100,
    f.households,
  ];
  return tiles.filter((t) => t != null).length >= 3;
}
