import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),

  DIRECT_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  PUBLIC_DATA_KEY: z.string().optional(),
  KAKAO_REST_KEY: z.string().optional(),
  KAKAO_JS_KEY: z.string().optional(),

  REVALIDATE_TOKEN: z.string().optional(),

  DISCORD_WEBHOOK_URL: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_GA_ID: z.string().optional(),

  ADMIN_USER: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),

  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  NODE_ENV: z.enum(['production', 'development', 'test']).default('development'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables — see lib/env.ts');
}

export const env = parsed.data;
export type Env = typeof env;
