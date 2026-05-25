import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Ingest 스크립트는 Supabase pooler 풀 한도(P2024) / statement timeout 빈발 방지를 위해
// connection_limit과 pool_timeout을 URL에 명시한다. 웹 런타임은 그대로 둔다 (PRISMA_INGEST=1 일 때만 적용).
function ingestDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '3');
    if (!u.searchParams.has('pool_timeout')) u.searchParams.set('pool_timeout', '60');
    return u.toString();
  } catch {
    return raw;
  }
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasources: process.env.PRISMA_INGEST
      ? { db: { url: ingestDatabaseUrl() ?? '' } }
      : undefined,
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}
