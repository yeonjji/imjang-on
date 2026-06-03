import { prisma } from '@/lib/db';
import type { UrbanListFilter } from '@/lib/urban/category';

/** urban 카테고리(주차장·충전소·공원) 공통 페이지 크기 */
export const URBAN_PER_PAGE = 20;

const SIDO_FULL: Record<string, string> = {
  서울: '서울특별시', 부산: '부산광역시', 대구: '대구광역시', 인천: '인천광역시',
  광주: '광주광역시', 대전: '대전광역시', 울산: '울산광역시', 세종: '세종특별자치시',
  경기: '경기도', 강원: '강원특별자치도', 충북: '충청북도', 충남: '충청남도',
  전북: '전북특별자치도', 전남: '전라남도', 경북: '경상북도', 경남: '경상남도',
  제주: '제주특별자치도',
};

/** 시도 약칭(서울)을 정식 명칭(서울특별시)으로. 매칭 없으면 입력 그대로 반환. */
export function fullSidoName(s: string): string {
  return SIDO_FULL[s] ?? s;
}

/**
 * sigunguCode → "시도 시군구" 주소 접두사.
 * - sigunguCode 미지정: null (시도 단위 필터로 처리)
 * - 매칭되는 region 없음: '__NO_MATCH__' (결과 0건 처리용 센티넬)
 */
export async function resolveAddrPrefix(
  f: UrbanListFilter,
): Promise<string | null | '__NO_MATCH__'> {
  if (!f.sigunguCode) return null;
  const region = await prisma.region.findFirst({
    where: { sigunguCode: f.sigunguCode, level: 2, isAbolished: false },
    select: { sido: true, sigungu: true },
  });
  if (!region?.sido || !region?.sigungu) return '__NO_MATCH__';
  return `${region.sido} ${region.sigungu}`;
}
