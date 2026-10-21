/**
 * 청약홈 경쟁률·가점·특별공급(ApplyhomeInfoCmpetRtSvc, odcloud). 기존 청약 수집과 같은 키·재시도를 쓴다.
 */
import { QuotaExceededError } from '@/scripts/ingest/apt-complex/http';
import { fetchJson, requireKey } from '@/scripts/ingest/subscriptions/http';

const CMPET_BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1';
const PER_PAGE = 500;

export type ResultOp =
  | 'getAPTLttotPblancCmpet'
  | 'getAptLttotPblancScore'
  | 'getAPTSpsplyReqstStus'
  | 'getUrbtyOfctlLttotPblancCmpet'
  | 'getPblPvtRentLttotPblancCmpet'
  | 'getRemndrLttotPblancCmpet'
  | 'getOPTLttotPblancCmpet';

/** 공고 유형별 오퍼레이션. competition은 필수, APT만 가점·특별공급을 더 받는다. */
export const RESULT_OPS: Record<string, { competition: ResultOp; scores?: ResultOp; special?: ResultOp }> = {
  APT: { competition: 'getAPTLttotPblancCmpet', scores: 'getAptLttotPblancScore', special: 'getAPTSpsplyReqstStus' },
  OFFICETEL_ETC: { competition: 'getUrbtyOfctlLttotPblancCmpet' },
  PUB_PRIV_RENT: { competition: 'getPblPvtRentLttotPblancCmpet' },
  REMNANT: { competition: 'getRemndrLttotPblancCmpet' },
  ARBITRARY: { competition: 'getOPTLttotPblancCmpet' },
};

export async function fetchResultRows(op: ResultOp, houseManageNo: string): Promise<object[]> {
  const url = new URL(`${CMPET_BASE}/${op}`);
  url.searchParams.set('serviceKey', requireKey());
  url.searchParams.set('page', '1');
  url.searchParams.set('perPage', String(PER_PAGE));
  url.searchParams.set('cond[HOUSE_MANAGE_NO::EQ]', houseManageNo);
  let json: { data?: unknown };
  try {
    json = await fetchJson(url.toString());
  } catch (err) {
    // fetchJson은 429를 백오프로 재시도한 뒤에도 남으면 'HTTP 429'로 던진다 → 일일 한도로 보고 중단.
    if (err instanceof Error && err.message.startsWith('HTTP 429')) throw new QuotaExceededError();
    throw err;
  }
  return Array.isArray(json.data) ? json.data : [];
}
