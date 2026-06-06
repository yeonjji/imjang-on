import { createHash } from 'node:crypto';
import type { NormalizedNotice } from './types';

// 해시에 포함할 영속 필드(정렬됨). lat/lng/rawJson/sourceKey/contentHash 는 제외.
const HASH_FIELDS = [
  'category',
  'houseManageNo',
  'pblancNo',
  'panId',
  'origNoticeKey',
  'name',
  'status',
  'regionCode',
  'regionName',
  'address',
  'totalSupply',
  'noticeDate',
  'receiptBegin',
  'receiptEnd',
  'winnerDate',
  'contractBegin',
  'contractEnd',
  'moveInYm',
  'homepage',
  'noticeUrl',
  'developer',
  'constructor',
  'tel',
].sort() as (keyof NormalizedNotice)[];

export function computeContentHash(notice: NormalizedNotice): string {
  const canonical: Record<string, unknown> = {};
  for (const key of HASH_FIELDS) {
    const v = notice[key];
    canonical[key as string] = v instanceof Date ? v.toISOString() : (v ?? null);
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
