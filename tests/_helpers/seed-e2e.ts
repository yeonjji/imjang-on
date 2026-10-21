import { prisma } from '@/lib/db';
import { PropertyType, DealType, GuideCategory, PostStatus } from '@prisma/client';
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

  await prisma.aptMaintenanceCost.deleteMany({ where: { kaptCode: 'E2E-KAPT-1' } });
  await prisma.aptMaintenanceCostStat.deleteMany({ where: { sigunguCode: '11650' } });
  await prisma.aptComplex.deleteMany({ where: { kaptCode: 'E2E-KAPT-1' } });
  await prisma.$executeRaw`DELETE FROM "SchoolZone" WHERE "hakgudoId" = 'E2E-Z1'`;
  await prisma.buildingRegister.deleteMany();
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

  // 학교 상세 보강 e2e용 — 고교 필드가 채워진 고등학교
  await prisma.school.create({
    data: {
      sourceId: 'E2E_SCH_0002',
      name: 'E2E 해솔고등학교',
      address: '서울특별시 송파구 송이로 42',
      sigunguCode: '11710',
      schoolKind: '고등학교',
      region: '서울특별시',
      hsType: '일반고',
      hsTrack: '일반계',
      admissionPeriod: '후기',
      foundedAt: new Date('1988-12-23T00:00:00Z'),
      anniversaryAt: new Date('1989-04-28T00:00:00Z'),
    },
  });
  // 목록은 학교급 오름차순이라 고등학교가 먼저 열린다 → childcare.spec이 첫 학교에서
  // '근처 어린이집'을 기대하므로 이 학교도 시드 어린이집 옆에 둔다.
  await prisma.$executeRaw`UPDATE "School" SET location = ST_SetSRID(ST_MakePoint(127.1042, 37.5049), 4326)::geography WHERE "sourceId" = 'E2E_SCH_0002'`;

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

  // 관리비 섹션 e2e — 지역난방, 1월·8월 + 구 통계
  await prisma.aptComplex.create({
    data: {
      kaptCode: 'E2E-KAPT-1', kaptName: '래미안서초에스티지', nameNorm: '래미안서초에스티지', bjdCode: '1165010100',
      sigunguCode: '11650', propertyId: p.id, households: 1184, heatType: '지역난방', rawJson: { kaptMarea: '120000' },
    },
  });
  const mc = (yearMonth: string, heat: bigint) => ({
    kaptCode: 'E2E-KAPT-1', yearMonth, complete: true, raw: {}, fetchedAt: new Date(),
    labor: 50_000_000n, cleaning: 40_000_000n, guard: 30_000_000n, repairs: 10_000_000n, commonTotal: 130_000_000n,
    heat, electricity: 120_000_000n, water: 30_000_000n, ltrLevy: 40_000_000n, ltrBalance: 1_500_000_000n,
  });
  await prisma.aptMaintenanceCost.createMany({ data: [mc('202601', 200_000_000n), mc('202608', 10_000_000n)] });
  await prisma.aptMaintenanceCostStat.create({
    data: { sigunguCode: '11650', yearMonth: '202608', medianCommonPerM2: 1200, sampleCount: 20, computedAt: new Date() },
  });

  // 주변 생활 인프라 e2e용 — 시드 주차장(E2E-PRK-1/2) 반경 500m 내 좌표 부여
  await prisma.$executeRaw`
    UPDATE "Property"
    SET location = ST_SetSRID(ST_MakePoint(127.026, 37.4965), 4326)::geography
    WHERE id = ${p.id}
  `;

  // 배정 초등학교 e2e — 래미안서초 좌표를 덮는 학구 1개 + 시드 학교(E2E 거마초) 연결
  await prisma.$executeRaw`
    INSERT INTO "SchoolZone" ("hakgudoId", name, kind, "eduName", "baseDate", geom)
    VALUES ('E2E-Z1', 'E2E거마초통학구역', 'general', '서울특별시강남서초교육지원청', '2025-09-22',
            ST_Multi(ST_MakeEnvelope(127.024, 37.4945, 127.028, 37.4985, 4326)))`;
  const geoma = await prisma.school.findUniqueOrThrow({ where: { sourceId: 'E2E_SCH_0001' }, select: { id: true } });
  await prisma.schoolZoneSchool.create({
    data: { hakgudoId: 'E2E-Z1', schId: 'E2E-B1', schoolName: 'E2E 거마초등학교', eduOffice: '서울특별시교육청', isPrimary: true, schoolId: geoma.id },
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

  // 전통시장 상세 e2e용 — 새 필드가 채워진 시장 1곳, 빈 시장 1곳(카드 숨김 검증)
  await prisma.traditionalMarket.upsert({
    where: { sourceId: 'e2e-market-filled' },
    create: {
      sourceId: 'e2e-market-filled',
      name: 'e2e 장날시장',
      address: '서울특별시 서초구 서초동',
      sigunguCode: '11650',
      marketType: '상설장+4일장',
      storeCount: 64,
      openCycle: '4일+9일',
      establishedYear: 1955,
      products: '농산물+축산물+수산물',
      hasParking: true,
      hasToilet: true,
      tel: '02-000-0000',
      referenceDate: new Date('2025-11-10T00:00:00Z'),
    },
    update: {},
  });
  await prisma.traditionalMarket.upsert({
    where: { sourceId: 'e2e-market-empty' },
    create: {
      sourceId: 'e2e-market-empty',
      name: 'e2e 빈시장',
      address: '서울특별시 서초구 서초동',
      sigunguCode: '11650',
    },
    update: {},
  });

  // 공원 상세 e2e용 — 시설이 채워진 공원 1곳, 빈 공원 1곳(카드 숨김 검증)
  await prisma.park.upsert({
    where: { sourceId: 'e2e-park-filled' },
    create: {
      sourceId: 'e2e-park-filled',
      name: 'e2e 시설공원',
      address: '서울특별시 서초구 서초동 1',
      parkType: '근린공원',
      area: 58462,
      facilityPlay: '조합놀이대+그네',
      facilitySport: '야외헬스기구',
      designatedAt: new Date('2016-06-17T00:00:00Z'),
      managingOrg: '서울특별시 서초구청',
      tel: '02-000-0000',
    },
    update: {},
  });
  await prisma.park.upsert({
    where: { sourceId: 'e2e-park-empty' },
    create: {
      sourceId: 'e2e-park-empty',
      name: 'e2e 빈공원',
      address: '서울특별시 서초구 서초동 2',
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

  // 건축물 정보 e2e — 아파트(시안 A 값)·빌라(시안 C 값, 근린생활시설 포함)
  const brNow = new Date();
  await prisma.buildingRegister.create({
    data: { propertyId: p.id, status: 'matched', bcRat: 16.94, vlRat: 159.96, seismicApplied: 15, mainBuildingCount: 15, structure: '철근콘크리트구조', groundFloors: 27, undergroundFloors: 1, zoningKind: '용도구역', zoningName: '지구단위계획구역', fetchedAt: brNow },
  });
  await prisma.buildingRegister.create({
    data: { propertyId: villa.id, status: 'matched', useAprDate: new Date('2019-08-30T00:00:00Z'), groundFloors: 6, undergroundFloors: 1, households: 14, parkingTotal: 12, elevators: 1, bcRat: 59.8, vlRat: 187.33, mainPurpose: '공동주택', etcPurpose: '공동주택, 제1종근린생활시설(소매점)', structure: '철근콘크리트구조', seismicApplied: 1, mainBuildingCount: 1, zoningKind: '용도지역', zoningName: '제2종일반주거지역', hasNeighborhoodFacility: true, registerCreatedAt: new Date('2022-08-13T00:00:00Z'), fetchedAt: brNow },
  });

  await seedChildcare();
  await seedParking();
  await seedSubway();
  await seedLoans();
  await seedEvCharger();
  await seedGuides();
  await seedSubscription();

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

// 가이드 데이터 블록 e2e용 — charger-mix 블록이 렌더되려면 EvCharger 행이 필요하다.
async function seedEvCharger() {
  await prisma.evCharger.deleteMany({ where: { sourceId: 'UT-E2E-CHG' } });
  await prisma.evCharger.create({
    data: { sourceId: 'UT-E2E-CHG', name: 'e2e 충전소', address: '서울특별시 마포구', chargeSpeed: '급속', chargerCount: 2 },
  });
}

// 가이드 상세 e2e용 — 표식 있는 가이드(ut-guide-with-block)와 표식 없는 가이드(ut-guide-plain, 회귀 가드).
async function seedGuides() {
  await prisma.guide.deleteMany({ where: { slug: { in: ['ut-guide-with-block', 'ut-guide-plain'] } } });
  await prisma.guide.createMany({
    data: [
      {
        slug: 'ut-guide-with-block',
        title: '유닛테스트 블록 가이드',
        summary: '데이터 블록이 들어간 가이드',
        body: '## 핵심 요약\n- 요약\n\n## 충전 방식\n설명 문장입니다.\n\n[[data:charger-mix]]\n\n## 마무리\n끝.',
        category: GuideCategory.LIFE,
        status: PostStatus.PUBLISHED,
        sourceName: '유닛테스트', sourceUrl: 'https://example.com',
        sourceDate: new Date('2026-01-01'), sourceExcerpt: '테스트',
        dedupeKey: 'ut-guide-with-block',
        publishedAt: new Date('2026-06-29'),
      },
      {
        slug: 'ut-guide-plain',
        title: '유닛테스트 일반 가이드',
        summary: '표식이 없는 가이드',
        body: '## 핵심 요약\n- 요약\n\n## 본문\n설명만 있습니다.',
        category: GuideCategory.LIFE,
        status: PostStatus.PUBLISHED,
        sourceName: '유닛테스트', sourceUrl: 'https://example.com',
        sourceDate: new Date('2026-01-01'), sourceExcerpt: '테스트',
        dedupeKey: 'ut-guide-plain',
        publishedAt: new Date('2026-06-29'),
      },
    ],
  });
}

// 청약 결과 e2e — 접수가 끝난 APT 공고 1건 + 경쟁률·가점·특별공급(역삼센트럴자이 표본 일부)
async function seedSubscription() {
  const old = await prisma.subscriptionNotice.findMany({ where: { sourceKey: 'E2E-SUB-1' } });
  await prisma.subscriptionResult.deleteMany({ where: { noticeId: { in: old.map((n) => n.id) } } });
  await prisma.subscriptionNotice.deleteMany({ where: { sourceKey: 'E2E-SUB-1' } });
  // id를 고정한다: 빈 DB에서 자동 증가 id(1,2,3…)는 운영 기준 410 목록(lib/subscription/gone-ids.ts)과 겹쳐
  // 미들웨어가 410을 낸다(CI에서 실제로 발생).
  const n = await prisma.subscriptionNotice.create({
    data: {
      id: 990_000_001n,
      source: 'APPLYHOME', category: 'APT', sourceKey: 'E2E-SUB-1', houseManageNo: 'E2E-SUB-1',
      name: 'E2E 센트럴자이', regionName: '서울특별시 강남구', totalSupply: 87,
      receiptBegin: new Date('2025-12-15'), receiptEnd: new Date('2025-12-18'), winnerDate: new Date('2025-12-24'),
      rawJson: {},
    },
  });
  const c = (ty: string, rank: number, secd: string, rate: string, req: string, sup: number) => ({
    HOUSE_TY: ty, SUBSCRPT_RANK_CODE: rank, RESIDE_SECD: secd, CMPET_RATE: rate, REQ_CNT: req, SUPLY_HSHLDCO: sup,
  });
  await prisma.subscriptionResult.create({
    data: {
      noticeId: n.id, status: 'ok', fetchedAt: new Date(),
      competition: [c('059.9800 ', 1, '01', '1692.33', '10154', 6), c('059.9800 ', 1, '02', '-', '0', 6), c('084.9700A', 1, '01', '467.53', '8883', 19), c('084.9700A', 1, '02', '-', '0', 19)],
      scores: [{ HOUSE_TY: '059.9800 ', RESIDE_SENM: '해당지역', LWET_SCORE: '70', AVRG_SCORE: '70', TOP_SCORE: '70' }],
      special: [{ HOUSE_TY: '059.9800 ', LFE_FRST_HSHLDCO: 1, CRSPAREA_LFE_FRST_CNT: 3431, ETC_AREA_LFE_FRST_CNT: 626 }],
    },
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
