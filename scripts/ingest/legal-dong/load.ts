import { prisma } from '@/lib/db';
import { lookupKey } from '@/scripts/ingest/building-register/key';
import type { LegalDongRow } from './parse';

const MIN_KEEP_RATIO = 0.9;
const CHUNK = 5_000;

/** 트랜잭션 교체. 이전의 90% 미만이면 거부(빈·잘린 다운로드 사고 방지). */
export async function replaceLegalDongs(rows: LegalDongRow[]): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      const prev = await tx.legalDong.count();
      if (prev > 0 && rows.length < prev * MIN_KEEP_RATIO) {
        throw new Error(`법정동 ${rows.length}개 < 이전 ${prev}개의 90% — 적재 거부`);
      }
      await tx.legalDong.deleteMany();
      for (let i = 0; i < rows.length; i += CHUNK) {
        await tx.legalDong.createMany({ data: rows.slice(i, i + CHUNK), skipDuplicates: true });
      }
      return tx.legalDong.count();
    },
    { timeout: 10 * 60_000, maxWait: 60_000 },
  );
}

/** (시군구코드|동 이름) → 법정동 코드들. 같은 이름이 여러 코드면 키 생성에서 거부된다. */
export async function loadLegalDongLookup(): Promise<Map<string, string[]>> {
  const rows = await prisma.legalDong.findMany({ select: { code: true, sigunguCode: true, name: true } });
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const k = lookupKey(r.sigunguCode, r.name);
    map.set(k, [...(map.get(k) ?? []), r.code]);
  }
  return map;
}
