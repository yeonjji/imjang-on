import { prisma } from '@/lib/db';
import { PropertyType, DealType } from '@prisma/client';
import { createHash } from 'node:crypto';
import { updatePropertyAggregates } from '@/scripts/ingest/aggregator';

async function main() {
  await prisma.transaction.deleteMany();
  await prisma.property.deleteMany();
  await prisma.region.deleteMany();

  await prisma.region.create({
    data: {
      code: '1100000000',
      sido: '서울특별시',
      fullName: '서울특별시',
      level: 1,
      sourceVersion: 'e2e',
    },
  });
  await prisma.region.create({
    data: {
      code: '1165010100',
      sido: '서울특별시',
      sigungu: '서초구',
      eupmyeondong: '서초동',
      fullName: '서울특별시 서초구 서초동',
      level: 3,
      sourceVersion: 'e2e',
    },
  });
  await prisma.region.create({
    data: {
      code: '1165000000',
      sido: '서울특별시',
      sigungu: '서초구',
      fullName: '서울특별시 서초구',
      level: 2,
      sourceVersion: 'e2e',
    },
  });

  const p = await prisma.property.create({
    data: {
      propertyType: PropertyType.APARTMENT,
      name: '래미안서초에스티지',
      nameNorm: '래미안서초에스티지',
      regionCode: '1165010100',
      address: '서울특별시 서초구 서초동',
      builtYear: 2009,
      households: 1184,
    },
  });

  const types = [DealType.SALE, DealType.JEONSE, DealType.WOLSE];
  const now = Date.now();
  for (const dealType of types) {
    for (let i = 0; i < 12; i++) {
      // i주 전 — 모두 최근 12개월 안에 들어옴
      const date = new Date(now - i * 7 * 86_400_000);
      const hash = createHash('sha256').update(`${p.id}-${dealType}-${i}`).digest('hex');
      await prisma.transaction.create({
        data: {
          propertyId: p.id,
          propertyType: PropertyType.APARTMENT,
          regionCode: '1165010100',
          sigunguCode: '11650',
          dealType,
          contractDate: date,
          exclusiveArea: 84.99,
          floor: 12,
          dealAmount: dealType === DealType.SALE ? 300_000 + i * 1000 : null,
          deposit: dealType !== DealType.SALE ? 150_000 : null,
          monthlyRent: dealType === DealType.WOLSE ? 120 : 0,
          source: 'e2e',
          rawHash: hash,
        },
      });
    }
  }

  await updatePropertyAggregates([p.id]);

  // list perPage=30 → 2페이지 테스트용 추가 매물 30개
  // txCount12m: 1 설정 → getPropertyList의 txCount12m > 0 필터 통과
  await prisma.property.createMany({
    data: Array.from({ length: 30 }, (_, i) => ({
      propertyType: PropertyType.APARTMENT,
      name: `테스트아파트${i + 1}`,
      nameNorm: `테스트아파트${i + 1}`,
      regionCode: '1165010100',
      address: '서울특별시 서초구 서초동',
      txCount12m: 1,
    })),
  });

  console.log('e2e seed done. propertyId =', String(p.id));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
