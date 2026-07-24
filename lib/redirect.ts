import { prisma } from '@/lib/db';

export type RedirectKind = 'property' | 'school';

/**
 * 폐지지역(2026-07-01 개편)에서 삭제된 구 엔티티의 신 URL을 반환.
 * 상세 페이지가 엔티티 not-found일 때 조회 → 있으면 301, 없으면 404.
 */
export async function getRedirectPath(kind: RedirectKind, fromId: bigint): Promise<string | null> {
  const r = await prisma.urlRedirect.findUnique({
    where: { kind_fromId: { kind, fromId } },
    select: { toPath: true },
  });
  return r?.toPath ?? null;
}
