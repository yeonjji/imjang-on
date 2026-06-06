/**
 * One-off: apply the market-briefing migrations to a LARGE prod table without
 * hitting Supabase's 2min statement_timeout. Pins a single direct-connection
 * session, disables statement_timeout, then runs the same DDL/DML as the two
 * committed migration.sql files. Idempotent (IF NOT EXISTS guards).
 *
 * Run: pnpm exec dotenv -e .env.local -- tsx scripts/ops/apply-briefing-migrations-prod.ts
 * After success, mark the migrations applied with `prisma migrate resolve --applied`.
 */
import { PrismaClient } from '@prisma/client';

const base = process.env.DIRECT_URL;
if (!base) throw new Error('DIRECT_URL not set');
const url = base + (base.includes('?') ? '&' : '?') + 'connection_limit=1';

const db = new PrismaClient({ datasources: { db: { url } } });

const steps: { label: string; sql: string }[] = [
  { label: 'disable statement_timeout', sql: 'SET statement_timeout = 0' },
  { label: 'add column createdAt', sql: 'ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3)' },
  { label: 'backfill createdAt (COALESCE registerDate, contractDate)', sql: 'UPDATE "Transaction" SET "createdAt" = COALESCE("registerDate", "contractDate") WHERE "createdAt" IS NULL' },
  { label: 'set default', sql: 'ALTER TABLE "Transaction" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP' },
  { label: 'set not null', sql: 'ALTER TABLE "Transaction" ALTER COLUMN "createdAt" SET NOT NULL' },
  { label: 'index dealType+createdAt', sql: 'CREATE INDEX IF NOT EXISTS "Transaction_dealType_createdAt_idx" ON "Transaction"("dealType", "createdAt" DESC)' },
  { label: 'index dealType+contractDate', sql: 'CREATE INDEX IF NOT EXISTS "Transaction_dealType_contractDate_idx" ON "Transaction"("dealType", "contractDate" DESC)' },
];

(async () => {
  for (const s of steps) {
    const t0 = Date.now();
    await db.$executeRawUnsafe(s.sql);
    console.log(`✓ ${s.label} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  const [{ n }] = await db.$queryRawUnsafe<{ n: bigint }[]>(
    'SELECT count(*)::bigint AS n FROM "Transaction" WHERE "createdAt" IS NULL',
  );
  console.log('remaining NULL createdAt:', Number(n));
  await db.$disconnect();
})().catch(async (e) => {
  console.error('FAILED:', e?.message ?? e);
  await db.$disconnect();
  process.exit(1);
});
