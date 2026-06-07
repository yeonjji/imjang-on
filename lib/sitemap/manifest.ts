export interface SourceCount {
  key: string;
  count: number;
}

export interface Shard {
  id: number;
  key: string;
  offset: number;
  limit: number;
}

/**
 * 소스별 count를 chunkSize 단위로 끊어 연속 id를 부여한 샤드 목록을 만든다.
 * count가 0인 소스는 샤드를 만들지 않는다(빈 sitemap 노출 방지).
 */
export function buildManifest(counts: SourceCount[], chunkSize: number): Shard[] {
  const shards: Shard[] = [];
  let id = 0;
  for (const { key, count } of counts) {
    for (let offset = 0; offset < count; offset += chunkSize) {
      shards.push({ id: id++, key, offset, limit: Math.min(chunkSize, count - offset) });
    }
  }
  return shards;
}
