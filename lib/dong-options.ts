import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

const KEY = 'dong_options';

export interface DongOption {
  umd: string;
  txCount: number;
}

/** sigunguCode → 그 시군구의 읍·면·동·리 목록. 가나다순으로 저장한다. */
type Payload = Record<string, DongOption[]>;

/**
 * ETL에서 호출. 실거래 데이터의 실제 (시군구, 동) 조합을 옵션으로 만든다.
 *
 * Region 테이블로 만들면 안 된다 — 실거래의 조합 5,285개 중 Region과 이름이 맞는 건
 * 40%뿐이다. 지방은 '읍면 + 리'가 통째로 들어오고 Region 쪽에 결손·행정동 혼재가 있다.
 * 데이터에서 만들면 모든 선택지가 구조적으로 결과를 갖는다(스펙 §3.2).
 *
 * 거래 건수로 거르지 않는다. 뜸한 동도 그 동네 사람에게는 유효한 조회 대상이고,
 * 건수는 데이터 오류를 판정하지 못한다(스펙 §3.3).
 *
 * `regionCode = "sigunguCode" || '00000'` 조건이 필수다 — lib/transaction/dong.ts의
 * getDongTransactions는 umd를 regionCode(시군구 코드+00000)로 찾지 sigunguCode 컬럼을
 * 직접 보지 않는다. 스펙 §3.1은 두 값이 99.7%만 일치한다고 적어 뒀는데, 운영 읽기전용
 * 프로브로 실측한 영향은 이렇다: 불일치 행 25,256건 중 조회로 못 잡는 (시군구, 동)
 * 쌍은 8개, 전부 세종(36110)이다 — 연동면 명학리(270건)가 가장 크고, 나머지 7개는
 * 76건 이하. 이 조건 없이 sigunguCode만으로 그룹핑하면 이 8개가 드롭다운엔 뜨는데
 * 조회하면 0건이 나온다(연동면 명학리는 실제로 270건이 있는데도) — §3.2가 약속한
 * "모든 선택지가 구조적으로 결과를 갖는다"가 깨진다. 세종에서만 나오는 이유는 세종이
 * 구가 없어 모든 읍·면·동이 LAWD_CD 36110 하나로 뭉쳐 조회되고(selectSigunguTargets가
 * code.slice(0,5) 키로 겹침), ETL이 그 LAWD_CD를 조회된 모든 행의 sigunguCode(plain
 * 컬럼)에 그대로 쓰기 때문이다 — 근본 해법은 세종 행정구역 코드 체계를 손보는
 * 것이지만 이 브랜치 범위 밖이다. 조회 쪽
 * (getDongTransactions)은 건드리지 않는다 — regionCode 인덱스 적중을 운영에서 실측했다.
 */
export async function writeDongOptions(): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ sigungu_code: string; umd: string; n: bigint }>>`
    SELECT "sigunguCode" AS sigungu_code, umd, COUNT(*) AS n
    FROM "Transaction"
    WHERE umd IS NOT NULL
      AND "sigunguCode" IS NOT NULL
      AND "regionCode" = "sigunguCode" || '00000'
    GROUP BY 1, 2
  `;

  const payload: Payload = {};
  for (const r of rows) {
    (payload[r.sigungu_code] ??= []).push({ umd: r.umd, txCount: Number(r.n) });
  }
  // 드롭다운은 가나다순이다. 거래량순은 사용자가 특정 동의 위치를 예측할 수 없다.
  for (const list of Object.values(payload)) {
    list.sort((a, b) => a.umd.localeCompare(b.umd, 'ko'));
  }

  await prisma.dashboardSnapshot.upsert({
    where: { key: KEY },
    create: { key: KEY, payload: payload as unknown as Prisma.InputJsonValue },
    update: { payload: payload as unknown as Prisma.InputJsonValue },
  });
}

async function readPayload(): Promise<Payload> {
  const row = await prisma.dashboardSnapshot.findUnique({ where: { key: KEY } });
  return (row?.payload as unknown as Payload) ?? {};
}

/** 가나다순 목록. 스냅샷이 없으면 빈 배열. */
export async function readDongOptions(sigunguCode: string): Promise<DongOption[]> {
  return (await readPayload())[sigunguCode] ?? [];
}

/**
 * 목록에서 거래량이 가장 많은 동을 고른다. 목록이 비면 null.
 * 드롭다운 정렬(가나다순)과 달리 여기서는 거래량이 기준이다 — 첫 화면에 빈 목록을
 * 띄우지 않기 위해서다.
 *
 * 순수 함수로 뽑아 둔다 — 호출부가 이미 readDongOptions로 목록을 갖고 있으면
 * (예: 홈 페이지) 같은 스냅샷을 두 번 읽지 않고 이걸로 파생할 수 있다.
 */
export function pickTopDong(list: DongOption[]): DongOption | null {
  if (list.length === 0) return null;
  return list.reduce((best, cur) => (cur.txCount > best.txCount ? cur : best));
}
