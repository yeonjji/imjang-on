import type { Prisma } from '@prisma/client';

/** amenity 카테고리(편의점·마트·카페·전통시장) 공통 페이지 크기 */
export const AMENITY_PER_PAGE = 30;

/**
 * 상가 이름 검색 조건을 where에 합성한다.
 * name과 branchName이 따로 저장돼 있어(예: name='미니스톱', branchName='서울역점')
 * 화면에 보이는 '미니스톱 서울역점'으로 검색하려면 두 컬럼을 함께 봐야 한다.
 *
 * where.OR을 직접 쓰지 않고 AND로 합성하는 이유: mart 어댑터가 업종 필터에
 * 이미 where.OR을 쓰고 있어, 덮어쓰면 마트 목록에 다른 업종이 섞인다.
 */
export function applyStoreNameSearch(
  where: Prisma.StoreWhereInput,
  q: string | undefined,
): void {
  if (!q) return;
  const clause: Prisma.StoreWhereInput = {
    OR: [{ name: { contains: q } }, { branchName: { contains: q } }],
  };
  const existing = where.AND;
  where.AND = existing
    ? [...(Array.isArray(existing) ? existing : [existing]), clause]
    : [clause];
}
