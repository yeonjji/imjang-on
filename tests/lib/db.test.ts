import { describe, it, expect } from 'vitest';

describe('lib/db', () => {
  it('exports a singleton PrismaClient', async () => {
    const { prisma } = await import('@/lib/db');
    const { prisma: prisma2 } = await import('@/lib/db');
    expect(prisma).toBe(prisma2);
    expect(typeof prisma.$disconnect).toBe('function');
  });
});
