/** 건축HUB 건축물대장정보 서비스 호출. 재시도·한도 초과 감지는 apt-complex의 getJson을 쓴다. */
import { getJson } from '@/scripts/ingest/apt-complex/http';
import type { RegisterKey } from './key';
import type { Rec } from './select';

const BASE = 'https://apis.data.go.kr/1613000/BldRgstHubService';
const PAGE_SIZE = 100;
const MAX_PAGES = 10; // 대단지(표제부 100건 초과) 대비

export type BrOp = 'getBrRecapTitleInfo' | 'getBrTitleInfo' | 'getBrJijiguInfo';

export function readItems(payload: unknown): { items: Rec[]; totalCount: number } {
  const res = (payload && typeof payload === 'object' ? (payload as Rec).response : undefined) as Rec | undefined;
  const code = (res?.header as Rec | undefined)?.resultCode;
  if (code !== '00') throw new Error(`건축HUB 응답 오류: ${String(code ?? 'no response')}`);
  const body = (res?.body ?? {}) as Rec;
  const items = body.items as Rec | '' | null | undefined;
  const raw = items && typeof items === 'object' ? items.item : undefined;
  const list = Array.isArray(raw) ? (raw as Rec[]) : raw && typeof raw === 'object' ? [raw as Rec] : [];
  return { items: list, totalCount: Number(body.totalCount ?? list.length) || 0 };
}

export async function fetchBrItems(op: BrOp, key: RegisterKey): Promise<Rec[]> {
  const out: Rec[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(`${BASE}/${op}`);
    url.searchParams.set('sigunguCd', key.bjdCode.slice(0, 5));
    url.searchParams.set('bjdongCd', key.bjdCode.slice(5));
    url.searchParams.set('platGbCd', key.platGbCd);
    url.searchParams.set('bun', key.bun);
    url.searchParams.set('ji', key.ji);
    url.searchParams.set('_type', 'json');
    url.searchParams.set('numOfRows', String(PAGE_SIZE));
    url.searchParams.set('pageNo', String(page));
    const { items, totalCount } = readItems(await getJson(url, `br ${op} ${key.bjdCode}-${key.bun}-${key.ji} p${page}`));
    out.push(...items);
    if (out.length >= totalCount || items.length < PAGE_SIZE) break;
  }
  return out;
}
