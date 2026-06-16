import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),

  DIRECT_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  PUBLIC_DATA_KEY: z.string().optional(),
  NEIS_API_KEY: z.string().optional(),
  CHILDCARE_API_KEY: z.string().optional(),
  KAKAO_REST_KEY: z.string().optional(),
  KAKAO_JS_KEY: z.string().optional(),
  NEXT_PUBLIC_NAVER_MAP_CLIENT_ID: z.string().optional(),
  NAVER_MAP_CLIENT_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
  NAVER_SEARCH_CLIENT_ID: z.string().optional(),
  NAVER_SEARCH_CLIENT_SECRET: z.string().optional(),

  REVALIDATE_TOKEN: z.string().optional(),

  DISCORD_WEBHOOK_URL: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_GA_ID: z.string().optional(),

  ADMIN_USER: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  BOARD_PREVIEW_TOKEN: z.string().optional(),

  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  NODE_ENV: z.enum(['production', 'development', 'test']).default('development'),
});

// GitHub Actions / Vercel은 미설정 secret을 빈 문자열로 전달.
// z.string().url().optional()은 빈 문자열을 reject하므로 빈 값은 undefined로 치환.
const sanitized: Record<string, string | undefined> = {};
for (const [k, v] of Object.entries(process.env)) {
  sanitized[k] = v === '' ? undefined : v;
}

const parsed = schema.safeParse(sanitized);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables — see lib/env.ts');
}

export const env = parsed.data;
export type Env = typeof env;
