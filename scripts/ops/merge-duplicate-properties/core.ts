export interface MergeRow {
  id: bigint;
  builtYear: number | null;
}

export interface MergePlan<T extends MergeRow> {
  survivor: T;
  losers: T[];
  /** 생존자에 적용할 builtYear. 생존자가 비었을 때만 패자 값으로 채운다. */
  builtYear: number | null;
}

/**
 * 한 중복 그룹의 병합 계획을 세운다. 생존자는 최소 id —
 * 먼저 생성된 쪽이 색인·외부링크를 가졌을 가능성이 높아 301로 밀 때 손실이 가장 작고,
 * 규칙이 결정적이라 재실행해도 같은 결과가 나온다.
 */
export function planGroupMerge<T extends MergeRow>(rows: T[]): MergePlan<T> | null {
  if (rows.length < 2) return null;
  const sorted = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const [survivor, ...losers] = sorted;
  const builtYear = survivor.builtYear ?? losers.find((l) => l.builtYear != null)?.builtYear ?? null;
  return { survivor, losers, builtYear };
}

export interface TxHashInput {
  dealType: string;
  contractDate: Date;
  exclusiveArea: unknown;
  floor: number | null;
  dealAmount: number | null;
  deposit: number | null;
  monthlyRent: number | null;
}

/**
 * DB에서 읽은 Transaction 행을 computeHash가 기대하는 형태로 맞춘다.
 *
 * computeHash는 JSON.stringify를 쓰므로 타입이 다르면 같은 값이라도 해시가 달라진다.
 * Prisma Decimal은 {"a":"84.9"}로, ETL의 number는 {"a":84.9}로 직렬화된다.
 * Number()는 후행 0도 정규화해 ETL과 일치시킨다(Decimal('84.00') → 84).
 */
export function hashInputFromDbRow(tx: TxHashInput) {
  return {
    dealType: tx.dealType,
    contractDate: tx.contractDate,
    exclusiveArea: Number(tx.exclusiveArea),
    floor: tx.floor,
    dealAmount: tx.dealAmount,
    deposit: tx.deposit,
    monthlyRent: tx.monthlyRent,
  };
}
