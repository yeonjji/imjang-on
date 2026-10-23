import { env } from '@/lib/env';
import { revalidatePath } from 'next/cache';
import { ApiError, apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';

const Body = z.object({
  token: z.string(),
  paths: z.array(z.string()),
  /** 동적 라우트 형태('/guide/[slug]')를 'page'로 무효화. 한글 slug 경로는 캐시 태그 헤더에서 깨질 수 있다(admin/guides/actions.ts). */
  routes: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'invalid body', 400);
    if (parsed.data.token !== env.REVALIDATE_TOKEN) {
      throw new ApiError('UNAUTHORIZED', 'invalid token', 401);
    }
    for (const p of parsed.data.paths) revalidatePath(p);
    for (const r of parsed.data.routes ?? []) revalidatePath(r, 'page');
    return Response.json({ ok: true, revalidated: parsed.data.paths.length + (parsed.data.routes?.length ?? 0) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
