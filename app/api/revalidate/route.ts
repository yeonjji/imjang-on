import { env } from '@/lib/env';
import { revalidatePath } from 'next/cache';
import { ApiError, apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';

const Body = z.object({
  token: z.string(),
  paths: z.array(z.string()),
});

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'invalid body', 400);
    if (parsed.data.token !== env.REVALIDATE_TOKEN) {
      throw new ApiError('UNAUTHORIZED', 'invalid token', 401);
    }
    for (const p of parsed.data.paths) revalidatePath(p);
    return Response.json({ ok: true, revalidated: parsed.data.paths.length });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
