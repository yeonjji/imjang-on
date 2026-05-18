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
  for (const dealType of types) {
    for (let i = 0; i < 12; i++) {
      const date = new Date(2025, 4, 12 - i);
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

  console.log('e2e seed done. propertyId =', String(p.id));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
