import { describe, it, expect, beforeAll } from 'vitest';

describe('lib/logger', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = 'postgresql://x:y@localhost:5432/db';
  });

  it('exposes pino-like methods', async () => {
    const { logger } = await import('@/lib/logger');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('child() returns a logger with bound fields', async () => {
    const { logger } = await import('@/lib/logger');
    const child = logger.child({ module: 'test' });
    expect(typeof child.info).toBe('function');
  });
});
