import { prisma } from '@/lib/db';
import { ApiError, apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';

const Body = z.object({
  email: z.string().email(),
  topic: z.string().min(1).max(40),
});

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'invalid body', 400);
    await prisma.emailSignup.upsert({
      where: { email: parsed.data.email },
      create: { email: parsed.data.email, topic: parsed.data.topic },
      update: { topic: parsed.data.topic },
    });
    return Response.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
