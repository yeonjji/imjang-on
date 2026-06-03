import { prisma } from '@/lib/db';

async function main() {
  const [pharmacy, hospital, dept, facility, detail] = await Promise.all([
    prisma.pharmacy.count(),
    prisma.hospital.count(),
    prisma.hospitalDept.count(),
    prisma.hospitalFacility.count(),
    prisma.hospitalDetail.count(),
  ]);

  console.log({ pharmacy, hospital, dept, facility, detail });
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
