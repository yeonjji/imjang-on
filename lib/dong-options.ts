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
 */
export async function writeDongOptions(): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ sigungu_code: string; umd: string; n: bigint }>>`
    SELECT "sigunguCode" AS sigungu_code, umd, COUNT(*) AS n
    FROM "Transaction"
    WHERE umd IS NOT NULL AND "sigunguCode" IS NOT NULL
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
