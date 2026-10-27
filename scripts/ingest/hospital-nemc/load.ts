import { prisma } from '@/lib/db';
import { buildMatcher } from '@/lib/hospital/nemc-match';
import type { NemcHospital } from '@/lib/hospital/nemc';

export interface LoadResult { received: number; matched: number; unmatched: number; duplicate: number; upserted: number; deleted: number }

/** 매칭된 기관만 upsert. complete일 때만 이번 실행에서 못 본 행을 지운다(폐업·매칭 해제). */
export async function loadNemcHours(items: NemcHospital[], opts: { complete: boolean; fetchedAt: Date }): Promise<LoadResult> {
  const ours = await prisma.hospital.findMany({ select: { id: true, name: true, address: true, tel: true } });
  const match = buildMatcher(ours);
  const seen = new Map<bigint, NemcHospital>();
  const collided = new Set<bigint>();
  let unmatched = 0;
  for (const it of items) {
    const id = match(it);
    if (id == null) unmatched++;
    else if (seen.has(id)) collided.add(id);
    else seen.set(id, it);
  }
  // 두 기관이 같은 병원에 붙으면 어느 쪽이 맞는지 모른다 — 둘 다 버린다(잘못 붙이는 것보다 비워 두는 게 낫다).
  for (const id of collided) seen.delete(id);
  const rows = [...seen.entries()];
  for (let i = 0; i < rows.length; i += 500) {
    await prisma.$transaction(rows.slice(i, i + 500).map(([hospitalId, it]) => {
      const data = { hpid: it.hpid.slice(0, 20), ...it.hours, note: it.note, fetchedAt: opts.fetchedAt };
      return prisma.hospitalNemcHours.upsert({ where: { hospitalId }, create: { hospitalId, ...data }, update: data });
    }));
  }
  let deleted = 0;
  if (opts.complete) {
    deleted = (await prisma.hospitalNemcHours.deleteMany({ where: { fetchedAt: { lt: opts.fetchedAt } } })).count;
  }
  return { received: items.length, matched: rows.length, unmatched, duplicate: collided.size, upserted: rows.length, deleted };
}
