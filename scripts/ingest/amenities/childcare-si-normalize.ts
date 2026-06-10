import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getIlbanguToSiMap } from './sigungu-normalize';

/**
 * 일회성: 통합시 구코드(41111 등)로 저장된 어린이집을 부모 시코드(41110)로 정규화한다.
 * 시 단위 드롭다운에서 통합시 어린이집이 일부만 노출되던 시/구 섞임 버그를 메운다.
 * `--dry-run` 으로 변경 대상만 집계.
 */
async function main() {
  const dry = process.argv.includes('--dry-run');
  const map = await getIlbanguToSiMap();
  logger.info({ ilbangu: map.size, dry }, 'childcare 시 단위 정규화 시작');

  let total = 0;
  for (const [gu, si] of map) {
    const count = await prisma.childcare.count({ where: { sigunguCode: gu } });
    if (count === 0) continue;
    total += count;
    if (dry) {
      logger.info({ gu, si, count }, 'would re-key');
      continue;
    }
    await prisma.childcare.updateMany({
      where: { sigunguCode: gu },
      data: { sigunguCode: si },
    });
    logger.info({ gu, si, count }, 're-keyed');
  }

  logger.info({ total, dry }, dry ? '대상 집계 완료(미적용)' : 'childcare 시 단위 정규화 완료');
  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'childcare 시 단위 정규화 fatal');
  process.exit(1);
});
