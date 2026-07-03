import { prisma } from '@/lib/db';
import { PropertyType, DealType } from '@prisma/client';
import { createHash } from 'node:crypto';
import { updatePropertyAggregates } from '@/scripts/ingest/aggregator';
import { assertLocalDatabase } from './assert-local-db';
import { normalizeName } from '@/lib/slug';

export async function seedChildcare() {
  const SIGUNGU = '11710';
  await prisma.childcare.deleteMany({ where: { sourceId: { startsWith: 'E2E_' } } });
  await prisma.childcare.create({
    data: {
      sourceId: 'E2E_CC_0001',
      name: 'E2E 천사어린이집',
      crType: '국공립',
      status: '정상',
      sido: '서울특별시',
      sigungu: '송파구',
      sigunguCode: SIGUNGU,
      address: '서울특별시 송파구 거마로24길 11',
      tel: '02-409-1406',
      capacity: 60,
      currentCount: 40,
      cctvCount: 7,
      staffCount: 13,
      classCntTot: 10,
      childCntTot: 70,
      emRoleDirector: 1,
      emRoleTeacher: 4,
      emRoleTot: 13,
    },
  });
  await prisma.$executeRaw`UPDATE "Childcare" SET location = ST_SetSRID(ST_MakePoint(127.1043, 37.5045), 4326)::geography WHERE "sourceId" = 'E2E_CC_0001'`;
}

// 매물 1건 + 12개월치 매매/전세/월세 거래 + 좌표 부여 + 집계 갱신.
// 주변 생활 인프라 e2e용으로 시드 주차장(E2E-PRK-1/2) 반경 500m 내에 위치시킨다.
async function seedPropertyWithDeals(opts: {
  propertyType: PropertyType;
  name: string;
  lng: number;
  lat: number;
  builtYear: number;
}) {
  const prop = await prisma.property.create({
    data: {
      propertyType: opts.propertyType,
      name: opts.name,
      nameNorm: opts.name,
      regionCode: '1165010100', // sigunguCode는 generated column (앞 5자리 '11650')
      address: '서울특별시 서초구 서초동',
      builtYear: opts.builtYear,
    },
  });
  await prisma.$executeRaw`
    UPDATE "Property"
    SET location = ST_SetSRID(ST_MakePoint(${opts.lng}, ${opts.lat}), 4326)::geography
    WHERE id = ${prop.id}
  `;

  const types = [DealType.SALE, DealType.JEONSE, DealType.WOLSE];
  const now = Date.now();
  for (const dealType of types) {
    for (let i = 0; i < 12; i++) {
      const date = new Date(now - i * 7 * 86_400_000);
      const hash = createHash('sha256').update(`${prop.id}-${dealType}-${i}`).digest('hex');
      await prisma.transaction.create({
        data: {
          propertyId: prop.id,
          propertyType: opts.propertyType,
          regionCode: '1165010100',
          sigunguCode: '11650',
          dealType,
          contractDate: date,
          exclusiveArea: 59.99,
          floor: 8,
          dealAmount: dealType === DealType.SALE ? 200_000 + i * 1000 : null,
          deposit: dealType !== DealType.SALE ? 100_000 : null,
          monthlyRent: dealType === DealType.WOLSE ? 90 : 0,
          source: 'e2e',
          rawHash: hash,
        },
      });
    }
  }
  await updatePropertyAggregates([prop.id]);
  return prop;
}

async function seedSubway() {
  await prisma.subwayStation.deleteMany({ where: { name: { startsWith: 'E2E' } } });
  await prisma.$executeRaw`
    INSERT INTO "SubwayStation" (name, "nameNorm", lines, operators, address, "isTransfer", location, "sourceKey", "updatedAt")
    VALUES (
      'E2E중앙역', ${normalizeName('E2E중앙역')}, ARRAY['2호선']::text[], ARRAY['E2E운영']::text[],
      '서울특별시 서초구 서초동', false,
      ST_SetSRID(ST_MakePoint(127.026, 37.4965), 4326)::geography,
      'E2E_STATION_0001', NOW()
    )
    ON CONFLICT ("sourceKey") DO NOTHING
  `;
}

// finance 페이지네이션 e2e용 — PER_PAGE(20) 초과하도록 25건. seq는 e2e 전용 대역.
// e2e DB의 대출상품을 알려진 25건으로 "전량 교체" — 잔여 loanProduct 행이 /finance 카운트를
// 흔들지 않도록(다른 시드/인제스트 테스트가 남긴 행 대비). 로컬 docker(.env.test) 전용이라 안전.
async function seedLoans() {
  await prisma.loanProduct.deleteMany();
  await prisma.loanProduct.createMany({
    data: Array.from({ length: 25 }, (_, i) => ({
      seq: 900001 + i,
      finprdnm: `E2E 대출상품 ${String(i + 1).padStart(2, '0')}`,
      rawJson: {},
    })),
  });
}

async function main() {
  assertLocalDatabase();

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

  // 송파구 region — /childcare/11710 · /school/11710 페이지용
  await prisma.region.create({
    data: {
      code: '1171000000',
      sido: '서울특별시',
      sigungu: '송파구',
      fullName: '서울특별시 송파구',
      level: 2,
      sourceVersion: 'e2e',
    },
  });

  // 송파구 학교 시드 — school detail 근처 어린이집 테스트용
  await prisma.school.deleteMany({ where: { sourceId: { startsWith: 'E2E_' } } });
  await prisma.school.create({
    data: {
      sourceId: 'E2E_SCH_0001',
      name: 'E2E 거마초등학교',
      address: '서울특별시 송파구 거마로 1',
      sigunguCode: '11710',
      schoolKind: '초등학교',
      region: '서울특별시',
    },
  });
  // 시드 학교를 어린이집 바로 옆(~100m)에 위치
  await prisma.$executeRaw`UPDATE "School" SET location = ST_SetSRID(ST_MakePoint(127.1040, 37.5048), 4326)::geography WHERE "sourceId" = 'E2E_SCH_0001'`;

  const p = await prisma.property.create({
    data: {
      propertyType: PropertyType.APARTMENT,
      name: '래미안서초에스티지',
      nameNorm: '래미안서초에스티지',
      regionCode: '1165010100', // sigunguCode는 generated column (regionCode 앞 5자리)
      address: '서울특별시 서초구 서초동',
      builtYear: 2009,
      households: 1184,
    },
  });

  // 주변 생활 인프라 e2e용 — 시드 주차장(E2E-PRK-1/2) 반경 500m 내 좌표 부여
  await prisma.$executeRaw`
    UPDATE "Property"
    SET location = ST_SetSRID(ST_MakePoint(127.026, 37.4965), 4326)::geography
    WHERE id = ${p.id}
  `;

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
      regionCode: '1165010100', // sigunguCode는 generated column에서 자동 도출
      address: '서울특별시 서초구 서초동',
      txCount12m: 1,
    })),
  });

  // amenity LIST e2e용 — /amenity/mart 에 표시될 대형마트 1개
  // (industryCode 'G20402' = 대형마트, mart adapter PREFIX_HYPER)
  await prisma.store.upsert({
    where: { sourceId: 'e2e-mart-hyper-1' },
    create: {
      sourceId: 'e2e-mart-hyper-1',
      name: 'e2e 대형마트',
      address: '서울특별시 서초구 서초동',
      industryCode: 'G20402',
      industryName: '대형마트',
      sigunguCode: '11650',
    },
    update: {},
  });

  // 오피스텔·빌라 상세 주변 생활 인프라 e2e용 (시드 주차장 반경 500m 내)
  const offi = await seedPropertyWithDeals({
    propertyType: PropertyType.OFFICETEL,
    name: '서초센트럴오피스텔',
    lng: 127.0262,
    lat: 37.4966,
    builtYear: 2018,
  });
  const villa = await seedPropertyWithDeals({
    propertyType: PropertyType.ROW_HOUSE,
    name: '서초빌라하우스',
    lng: 127.0258,
    lat: 37.4964,
    builtYear: 2015,
  });

  await seedChildcare();
  await seedParking();
  await seedSubway();
  await seedLoans();

  console.log('e2e seed done. propertyId =', String(p.id), 'officetelId =', String(offi.id), 'villaId =', String(villa.id));
  await prisma.$disconnect();
}

async function seedParking() {
  await prisma.parking.deleteMany({ where: { sourceId: { startsWith: 'E2E-PRK-' } } });
  await prisma.$executeRaw`
    INSERT INTO "Parking" (
      "sourceId","name","prkplceSe","prkplceType","rdnmadr","lnmadr","address",
      location,"prkcmprt","feedingSe","enforceSe","operDay",
      "weekdayOpenHhmm","weekdayCloseHhmm","satOpenHhmm","satCloseHhmm","holidayOpenHhmm","holidayCloseHhmm",
      "chargeInfo","basicTime","basicCharge","addUnitTime","addUnitCharge","dayCmmtkt","monthCmmtkt",
      "metpay","spcmnt","pwdbsPpkZoneYn","institutionNm","phoneNumber","insttCode","insttNm",
      "updatedAt"
    )
    VALUES
      ('E2E-PRK-1','e2e 24시간 유료주차장','공영','노외','서울특별시 서초구 서초대로 100',NULL,'서울특별시 서초구 서초대로 100',
       ST_SetSRID(ST_MakePoint(127.027,37.498),4326)::geography,120,'유료','단속중',
       NULL,'0000','2400','0000','2400','0000','2400',
       '유료',30,500,10,200,10000,80000,'카드,현금','시범운영 안내',true,'서초구청','02-2155-0000','1165000','서초구',
       NOW()),
      ('E2E-PRK-2','e2e 무료주차장','민영','노상','서울특별시 서초구 서초중앙로 1',NULL,'서울특별시 서초구 서초중앙로 1',
       ST_SetSRID(ST_MakePoint(127.025,37.495),4326)::geography,20,'무료',NULL,
       '월,화,수,목,금','0700','2000','0700','1800',NULL,NULL,
       '무료',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,false,NULL,NULL,NULL,NULL,
       NOW()),
      ('E2E-PRK-3','e2e 일반 유료주차장','민영','부설','서울특별시 강남구 테헤란로 1',NULL,'서울특별시 강남구 테헤란로 1',
       ST_SetSRID(ST_MakePoint(127.034,37.500),4326)::geography,50,'유료',NULL,
       NULL,'0600','2200','0700','2000','0900','1800',
       '유료',60,1000,30,500,NULL,NULL,'카드',NULL,false,NULL,NULL,NULL,NULL,
       NOW())
    ON CONFLICT ("sourceId") DO NOTHING;
  `;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
