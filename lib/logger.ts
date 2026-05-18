import pino from 'pino';
import { env } from '@/lib/env';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: 'imjang-on',
    env: env.VERCEL_ENV ?? env.NODE_ENV,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l' },
        },
      }
    : {}),
});

export type Logger = typeof logger;
