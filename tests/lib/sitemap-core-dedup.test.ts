import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { assertLocalDatabase } from '../_helpers/assert-local-db';
import { SOURCE_MAP } from '@/lib/sitemap/sources';

assertLocalDatabase();

// 세종처럼 구/군 단계가 없는 시는 읍면동이 시 바로 아래에 붙어 region 시드에서 level 2로 잡히고
// 동일 sigunguCode를 공유한다. core 소스의 /school/{sigunguCode} 허브는 시군구당 1개여야 한다.
// Region.sigunguCode는 DB 생성열(GENERATED ALWAYS AS LEFT(code,5))이므로 직접 넣지 않고
// code 앞 5자리로 유도한다. 아래 code 3개 모두 sigunguCode '99110'을 공유한다(세종 재현).
const TEST_SIGUNGU = '99110'; // 실데이터와 겹치지 않는 가짜 코드
const TEST_CODES = ['9911025000', '9911025300', '9911025600'];

async function cleanup() {
  await prisma.region.deleteMany({ where: { sigunguCode: TEST_SIGUNGU } });
}
beforeEach(cleanup);
afterEach(cleanup);

describe('sitemap core 소스 — 학교 허브 dedup', () => {
  it('같은 sigunguCode를 공유하는 level-2 행이 여러 개여도 /school/{code}는 1회만 나온다', async () => {
    // 한 sigunguCode(99110)에 level-2 행 3개 = 세종 읍면동 오분류 재현
    await prisma.region.createMany({
      data: TEST_CODES.map((code, i) => ({
        code,
        sido: '세종특별자치시',
        sigungu: ['한솔동', '도담동', '아름동'][i],
        fullName: `세종특별자치시 ${['한솔동', '도담동', '아름동'][i]}`,
        level: 2,
        isAbolished: false,
        sourceVersion: 'test',
      })),
    });

    const entries = await SOURCE_MAP.core.page(0, 100_000);
    const hubHits = entries.filter((e) => String(e.url).endsWith(`/school/${TEST_SIGUNGU}`));

    expect(hubHits).toHaveLength(1);
  });
});
