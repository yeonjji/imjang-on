/** 관리비 오퍼레이션 1회 호출. 재시도·한도 초과 감지는 apt-complex의 getJson을 그대로 쓴다. */
import { getJson } from '@/scripts/ingest/apt-complex/http';
import type { CostOp } from './ops';

const BASE = 'https://apis.data.go.kr/1613000';

export async function fetchCostItem(op: CostOp, kaptCode: string, yearMonth: string): Promise<unknown> {
  const url = new URL(`${BASE}/${op.service}/${op.op}`);
  url.searchParams.set('kaptCode', kaptCode);
  url.searchParams.set('searchDate', yearMonth);
  return getJson(url, `maintenance-cost ${op.op} ${kaptCode} ${yearMonth}`);
}
