import { describe, it, expect } from 'vitest';

describe('lib/env', () => {
  it('parses DATABASE_URL', async () => {
    process.env.DATABASE_URL = 'postgresql://x:y@localhost:5432/db';
    process.env.LOG_LEVEL = 'info';
    const mod = await import('@/lib/env');
    expect(mod.env.DATABASE_URL).toBe('postgresql://x:y@localhost:5432/db');
    expect(mod.env.LOG_LEVEL).toBe('info');
  });
});
