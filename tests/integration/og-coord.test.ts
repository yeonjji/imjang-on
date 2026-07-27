// og-coord.ts가 쓰는 unstable_cache는 Next의 요청 스코프를 필요로 한다. vitest는 순수
// node 프로세스라 그게 없어 그대로 두면 throw한다 — 아래 helper가 필요한 전역을 심어준다.
// og-coord를 import하기 전에(ESM 소스 순서) 먼저 실행돼야 하므로 최상단에 둔다.
import '../_helpers/next-server-runtime';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PropertyType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { resolveOgMapTarget } from '@/lib/seo/og-coord';

// CI의 check 잡은 migrate만 하고 seed를 안 한다. 앰비언트 Property 데이터에 의존하면
// DB 상태에 따라 결과가 흔들리므로 지역·매물을 테스트가 직접 시드한다.
const SIDO = 'UT시';
const DONG_A = 'UT11111111'; // 표본 충분한 읍면동
const DONG_B = 'UT11122222'; // 표본 부족한 읍면동 (같은 시군구 UT111)
const DONG_C = 'UT11133333'; // 산포가 과대한 읍면동
const DONG_D = 'UT99911111'; // 시군구까지 표본 부족
const DONG_E = 'UT11144444'; // 시군구 표본수만 채우는 필러 전용 읍면동 (같은 시군구 UT111)
// SGG_OK='UT111'(DONG_A/B/C/E 접두 5자), SGG_THIN='UT999'(DONG_D 접두 5자) — 아래 참고

const ids = {
  precise: 900_000_001n,
  dong: 900_000_002n,
  sigungu: 900_000_003n,
  spread: 900_000_004n,
  none: 900_000_005n,
  outlier: 900_000_006n,
};

/** location은 Prisma create로 넣을 수 없어 raw로 세팅한다. */
async function setLocation(id: bigint, lat: number, lng: number) {
  await prisma.$executeRaw`
    UPDATE "Property" SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
    WHERE id = ${id}
  `;
}

// Region.sigunguCode / Property.sigunguCode는 DB에서 LEFT(code, 5) / LEFT("regionCode", 5)로
// 계산되는 generated column이라 create()에 값을 넘길 수 없다. 아래 dong 코드들은 앞 5자가
// 의도한 시군구(SGG_OK='UT111', SGG_THIN='UT999')와 이미 일치하도록 설계돼 있다.
async function seedFiller(
  regionCode: string,
  count: number,
  baseLat: number,
  baseLng: number,
  stepDeg: number,
  startId: bigint,
) {
  for (let i = 0; i < count; i++) {
    const id = startId + BigInt(i);
    await prisma.property.create({
      data: {
        id,
        propertyType: PropertyType.ROW_HOUSE,
        name: `UT필러${i}`,
        nameNorm: `ut필러${i}`,
        regionCode,
        address: `${SIDO} 어딘가 ${i}`,
      },
    });
    await setLocation(id, baseLat + i * stepDeg, baseLng + i * stepDeg);
  }
}

beforeAll(async () => {
  await prisma.property.deleteMany({ where: { name: { startsWith: 'UT' } } });
  await prisma.region.deleteMany({ where: { code: { startsWith: 'UT' } } });

  for (const code of [DONG_A, DONG_B, DONG_C, DONG_D, DONG_E] as const) {
    await prisma.region.create({
      data: {
        code,
        sido: SIDO,
        sigungu: 'UT구',
        fullName: `${SIDO} UT구`,
        level: 3,
        sourceVersion: 'ut',
      },
    });
  }

  // 대상 매물 6건 — 전부 좌표 없음으로 시작
  for (const [key, regionCode] of [
    ['precise', DONG_A],
    ['dong', DONG_A],
    ['sigungu', DONG_B],
    ['spread', DONG_C],
    ['none', DONG_D],
    ['outlier', DONG_A],
  ] as const) {
    await prisma.property.create({
      data: {
        id: ids[key],
        propertyType: PropertyType.ROW_HOUSE,
        name: `UT대상-${key}`,
        nameNorm: `ut대상-${key}`,
        regionCode,
        address: `${SIDO} UT구 어딘가`,
      },
    });
  }
  await setLocation(ids.precise, 37.5000, 127.0000);

  // DONG_A: 유효 6건 (게이트 5 통과), 서로 ~100m 간격 → 산포 20km 이내
  await seedFiller(DONG_A, 6, 37.5000, 127.0000, 0.001, 910_000_000n);
  // DONG_A에 한반도 밖 오염점 1건 — 집계에서 제외돼야 한다
  await prisma.property.create({
    data: {
      id: 919_999_999n,
      propertyType: PropertyType.ROW_HOUSE,
      name: 'UT오염점',
      nameNorm: 'ut오염점',
      regionCode: DONG_A,
      address: `${SIDO} UT구 오염`,
    },
  });
  await setLocation(919_999_999n, 0, 0);

  // DONG_B: 유효 3건 (읍면동 게이트 5 미달) → 시군구로 승격. 더 채우면 자체 dong 게이트를
  // 넘어버리므로(승격 검증이 무의미해짐) 시군구 표본을 채우는 5건은 DONG_E로 따로 둔다.
  await seedFiller(DONG_B, 3, 37.6000, 127.1000, 0.001, 920_000_000n);
  // DONG_C: 유효 6건, 0.05도(≈5.5km) 간격 x 5칸 ≈ 27km 스팬 → 읍면동 산포 20km는 초과하되
  // 클러스터 자체는 DONG_A/B 근방에 둬 시군구 합산 산포(150km)는 넘지 않게 한다.
  await seedFiller(DONG_C, 6, 37.4000, 126.9000, 0.05, 930_000_000n);
  // SGG_OK 시군구 표본을 20 이상으로 채우기 위한 필러 5건 — DONG_B가 아닌 별도 DONG_E에 둬
  // DONG_B 자체 dong 게이트(min 5)를 넘지 않게 한다.
  await seedFiller(DONG_E, 5, 37.5200, 127.0200, 0.001, 940_000_000n);
  // DONG_D / SGG_THIN: 2건뿐 → 읍면동·시군구 게이트 모두 미달
  await seedFiller(DONG_D, 2, 36.0000, 128.0000, 0.001, 950_000_000n);
});

afterAll(async () => {
  await prisma.property.deleteMany({ where: { name: { startsWith: 'UT' } } });
  await prisma.region.deleteMany({ where: { code: { startsWith: 'UT' } } });
  await prisma.$disconnect();
});

describe('resolveOgMapTarget', () => {
  it('정확한 좌표가 있으면 precise + level 16 + 마커', async () => {
    const t = await resolveOgMapTarget(ids.precise);
    expect(t).toEqual({ kind: 'precise', lat: 37.5, lng: 127.0, level: 16, marker: true });
  });

  it('좌표가 없고 읍면동 표본이 충분하면 region + level 13 + 마커 없음', async () => {
    const t = await resolveOgMapTarget(ids.dong);
    expect(t?.kind).toBe('region');
    expect(t?.level).toBe(13);
    expect(t?.marker).toBe(false);
  });

  it('한반도 bbox 밖 좌표는 centroid 집계에서 제외한다', async () => {
    // DONG_A에 (0,0) 오염점이 섞여 있다. 제외되지 않으면 centroid가 적도 쪽으로 끌려간다.
    const t = await resolveOgMapTarget(ids.outlier);
    expect(t?.kind).toBe('region');
    expect(t!.lat).toBeGreaterThan(37.0);
    expect(t!.lng).toBeGreaterThan(126.0);
  });

  it('읍면동 표본이 부족하면 시군구로 승격해 level 11', async () => {
    const t = await resolveOgMapTarget(ids.sigungu);
    expect(t?.kind).toBe('region');
    expect(t?.level).toBe(11);
  });

  it('읍면동 산포가 20km를 넘으면 그 스코프를 버리고 시군구로 승격', async () => {
    const t = await resolveOgMapTarget(ids.spread);
    expect(t?.kind).toBe('region');
    expect(t?.level).toBe(11);
  });

  it('시군구 표본까지 부족하면 null', async () => {
    const t = await resolveOgMapTarget(ids.none);
    expect(t).toBeNull();
  });
});
