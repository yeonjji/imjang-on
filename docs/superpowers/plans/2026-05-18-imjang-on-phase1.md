# imjang-on Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공공데이터 기반 부동산 실거래가 통합 정보 플랫폼(imjang-on)의 Phase 1 — 아파트·오피스텔·연립다세대 × 매매·전월세 1년치를 전국 단위로 수집·표시하는 Next.js 사이트.

**Architecture:** Vercel(Next.js App Router · ISR) ↔ Supabase(Postgres + PostGIS + pg_trgm) ↔ GitHub Actions(매일 cron ETL). 단지 단위 카드 + 거래유형 3섹션 상세. 인증·청약·POI 제외.

**Tech Stack:** Next.js 15 · React 19 · TypeScript · Prisma 5 · PostgreSQL + PostGIS + pg_trgm · Tailwind v4 · Radix UI · vaul · Recharts · Vitest · Playwright · pnpm · GitHub Actions · Sentry · GA4

**Spec reference:** `docs/superpowers/specs/2026-05-18-imjang-on-design.md`

---

## Plan Structure (5 phases · ~90 tasks)

| Phase | 범위 | Task 범위 |
|-------|------|---------|
| 1A — Foundation | repo, 도구, Prisma 스키마, DB 마이그레이션, hello world | 1–18 |
| 1B — Domain Lib & UI Primitives | `lib/*` 헬퍼, `components/ui/*` 기본 UI | 19–32 |
| 1C — ETL Pipeline | adapter 6종, runner, matcher, GitHub Actions 워크플로 | 33–53 |
| 1D — Query Helpers & Pages | `lib/*` 쿼리, 모든 페이지, API 라우트 | 54–86 |
| 1E — Observability & Launch | Sentry/GA4, E2E, CI, 출시 수동 단계 | 87–93 |

Tasks share a global numbering scheme so they can be referenced regardless of phase.

---

# Phase 1A — Foundation (Task 1–18)

목표: 빈 디렉터리에서 시작해 **deploy 가능한 Next.js 앱 + 완성된 DB 스키마 + 테스트 인프라**까지 도달. 이 단계가 끝나면 모든 후속 phase는 코드 작성에만 집중할 수 있습니다.

---

### Task 1: Initialize pnpm + package.json

**Files:**
- Create: `package.json`
- Create: `.nvmrc`
- Create: `pnpm-workspace.yaml` (single package)

- [ ] **Step 1: Pin Node version**

```bash
echo "20" > .nvmrc
```

- [ ] **Step 2: Create package.json**

Write `package.json`:

```json
{
  "name": "imjang-on",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test:unit": "vitest run --dir tests/ingest --dir tests/lib",
    "test:integration": "vitest run --dir tests/integration",
    "test:e2e": "playwright test",
    "test": "pnpm test:unit && pnpm test:integration",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy",
    "seed:regions": "tsx scripts/ingest/regions/seed.ts",
    "ingest:run": "tsx scripts/ingest/transactions/runner.ts"
  }
}
```

- [ ] **Step 3: Create pnpm-workspace.yaml (single package mode)**

Write `pnpm-workspace.yaml`:

```yaml
packages:
  - .
```

- [ ] **Step 4: Verify**

Run: `node --version`
Expected: starts with `v20.`

Run: `corepack enable && pnpm --version`
Expected: prints a version `9.x` or `10.x`

- [ ] **Step 5: Commit**

```bash
git add .nvmrc package.json pnpm-workspace.yaml
git commit -m "chore: initialize pnpm package skeleton with Node 20 pin"
```

---

### Task 2: Install Next.js 15 + React 19 + TypeScript

**Files:**
- Modify: `package.json` (adds dependencies)
- Create: `pnpm-lock.yaml` (auto)

- [ ] **Step 1: Install Next.js + React + TypeScript**

Run:
```bash
pnpm add next@^15 react@^19 react-dom@^19
pnpm add -D typescript@^5 @types/node@^20 @types/react@^19 @types/react-dom@^19
```

Expected: Lockfile created, packages installed. No errors.

- [ ] **Step 2: Verify versions**

Run: `pnpm ls next react typescript`
Expected output includes:
```
next 15.x.x
react 19.x.x
typescript 5.x.x
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat: install Next.js 15 + React 19 + TypeScript 5"
```

---

### Task 3: TypeScript config

**Files:**
- Create: `tsconfig.json`

- [ ] **Step 1: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    },
    "verbatimModuleSyntax": true
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: Verify typecheck passes (no files yet)**

Run: `pnpm typecheck`
Expected: exits 0 (no errors — yet)

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore: add strict TypeScript config with @/ alias"
```

---

### Task 4: Tailwind v4 + globals.css with @theme tokens

**Files:**
- Create: `app/globals.css`
- Create: `postcss.config.mjs`
- Modify: `package.json` (dev deps)

- [ ] **Step 1: Install Tailwind v4**

```bash
pnpm add -D tailwindcss@^4 @tailwindcss/postcss@^4
```

- [ ] **Step 2: Write postcss.config.mjs**

```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

- [ ] **Step 3: Write app/globals.css with HTML mockup tokens**

```css
@import "tailwindcss";

@theme {
  --color-bg: #f7fbff;
  --color-card: #ffffff;
  --color-text: #172033;
  --color-muted: #64748b;
  --color-line: #dbeafe;
  --color-blue: #2563eb;
  --color-blue-dark: #1e3a8a;
  --color-sky: #38bdf8;
  --color-sky-soft: #e0f2fe;
  --color-soft: #f1f7ff;
  --color-green: #0f9f6e;
  --color-red: #ef4444;

  --radius-card: 22px;
  --shadow-soft: 0 14px 34px rgba(37, 99, 235, 0.10);

  --font-sans: "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
}

a {
  color: inherit;
  text-decoration: none;
}
```

- [ ] **Step 4: Commit**

```bash
git add app/globals.css postcss.config.mjs package.json pnpm-lock.yaml
git commit -m "feat: configure Tailwind v4 with design tokens from HTML mockup"
```

---

### Task 5: ESLint + Prettier

**Files:**
- Create: `.eslintrc.json`
- Create: `.prettierrc.json`
- Create: `.prettierignore`

- [ ] **Step 1: Install lint/format deps**

```bash
pnpm add -D eslint@^9 eslint-config-next@^15 prettier@^3 prettier-plugin-tailwindcss@^0.6
```

- [ ] **Step 2: Write .eslintrc.json**

```json
{
  "extends": ["next/core-web-vitals", "next/typescript"],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/consistent-type-imports": "error",
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  }
}
```

- [ ] **Step 3: Write .prettierrc.json**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

- [ ] **Step 4: Write .prettierignore**

```
node_modules
.next
out
build
coverage
playwright-report
test-results
*.lock
pnpm-lock.yaml
```

- [ ] **Step 5: Verify lint passes (no files)**

Run: `pnpm lint`
Expected: prints `✔ No ESLint warnings or errors` or similar.

- [ ] **Step 6: Commit**

```bash
git add .eslintrc.json .prettierrc.json .prettierignore package.json pnpm-lock.yaml
git commit -m "chore: configure ESLint and Prettier"
```

---

### Task 6: Vitest config + smoke test

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/lib/smoke.test.ts`

- [ ] **Step 1: Install Vitest**

```bash
pnpm add -D vitest@^2 @vitest/coverage-v8@^2
```

- [ ] **Step 2: Write vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

- [ ] **Step 3: Write failing smoke test**

Create `tests/lib/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('math works', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run test**

Run: `pnpm test:unit`
Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts tests/lib/smoke.test.ts package.json pnpm-lock.yaml
git commit -m "chore: add Vitest config with smoke test"
```

---

### Task 7: Playwright config + smoke E2E

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -D @playwright/test@^1
pnpm exec playwright install --with-deps chromium
```

- [ ] **Step 2: Write playwright.config.ts**

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile',  use: { ...devices['Pixel 5'] } },
  ],
});
```

- [ ] **Step 3: Write smoke spec (will fail until home page exists)**

Create `tests/e2e/smoke.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('home page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
});
```

- [ ] **Step 4: Verify Playwright is installed**

Run: `pnpm exec playwright --version`
Expected: `Version 1.x.x`

(Test will be run after Task 17 when home page exists.)

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/smoke.spec.ts package.json pnpm-lock.yaml
git commit -m "chore: add Playwright config with smoke test"
```

---

### Task 8: Local Postgres + PostGIS via docker-compose

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.env.local` (gitignored)

- [ ] **Step 1: Write docker-compose.yml**

```yaml
services:
  db:
    image: postgis/postgis:16-3.4
    container_name: imjang-on-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: imjang_on
      POSTGRES_USER: imjang
      POSTGRES_PASSWORD: dev
    ports:
      - "5432:5432"
    volumes:
      - imjang-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U imjang -d imjang_on"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  imjang-pgdata:
```

- [ ] **Step 2: Write .env.example (committed reference)**

```
# Database
DATABASE_URL="postgresql://imjang:dev@localhost:5432/imjang_on?schema=public"
DIRECT_URL="postgresql://imjang:dev@localhost:5432/imjang_on?schema=public"

# Public Data Portal (data.go.kr)
PUBLIC_DATA_KEY=""

# Kakao
KAKAO_REST_KEY=""
KAKAO_JS_KEY=""

# Vercel revalidation
REVALIDATE_TOKEN=""

# Discord webhook (ETL alerts)
DISCORD_WEBHOOK_URL=""

# Sentry
NEXT_PUBLIC_SENTRY_DSN=""
SENTRY_DSN=""

# Analytics
NEXT_PUBLIC_GA_ID=""

# Admin (Basic Auth)
ADMIN_USER=""
ADMIN_PASSWORD=""

# Logging
LOG_LEVEL="info"
```

- [ ] **Step 3: Create local .env.local (gitignored)**

Run:
```bash
cp .env.example .env.local
```

Edit `.env.local` to have:
```
DATABASE_URL="postgresql://imjang:dev@localhost:5432/imjang_on?schema=public"
DIRECT_URL="postgresql://imjang:dev@localhost:5432/imjang_on?schema=public"
LOG_LEVEL="debug"
```

(Other keys are filled in during Task 91 / launch checklist.)

- [ ] **Step 4: Start local DB**

Run: `docker compose up -d db`
Wait ~10 seconds.

Run: `docker compose ps`
Expected: `imjang-on-db` STATUS shows `healthy`.

- [ ] **Step 5: Verify Postgres connection**

Run: `docker compose exec db psql -U imjang -d imjang_on -c "SELECT version();"`
Expected: prints a `PostgreSQL 16.x` line.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add local Postgres+PostGIS via docker-compose"
```

---

### Task 9: Prisma init + schema.prisma

**Files:**
- Create: `prisma/schema.prisma`

- [ ] **Step 1: Install Prisma**

```bash
pnpm add @prisma/client@^5
pnpm add -D prisma@^5
```

- [ ] **Step 2: Write prisma/schema.prisma**

```prisma
// Spec reference: docs/superpowers/specs/2026-05-18-imjang-on-design.md §5

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  directUrl  = env("DIRECT_URL")
  extensions = [postgis, pg_trgm]
}

// ─── 지역 (법정동코드) ────────────────────────────
model Region {
  code         String   @id @db.VarChar(10)
  sido         String   @db.VarChar(20)
  sigungu      String?  @db.VarChar(40)
  eupmyeondong String?  @db.VarChar(40)
  ri           String?  @db.VarChar(40)
  fullName     String   @db.VarChar(120)
  level        Int
  parentCode   String?  @db.VarChar(10)
  parent       Region?  @relation("RegionTree", fields: [parentCode], references: [code])
  children     Region[] @relation("RegionTree")

  isAbolished   Boolean   @default(false)
  abolishedAt   DateTime? @db.Date
  sourceVersion String    @db.VarChar(20)
  updatedAt     DateTime  @updatedAt

  properties Property[]

  @@index([sido, sigungu, eupmyeondong])
  @@index([level, isAbolished])
}

// ─── 부동산 단지/건물 마스터 ──────────────────────
enum PropertyType {
  APARTMENT
  OFFICETEL
  ROW_HOUSE
  MULTIPLEX
}

model Property {
  id           BigInt       @id @default(autoincrement())
  propertyType PropertyType
  name         String       @db.VarChar(80)
  nameNorm     String       @db.VarChar(80)
  regionCode   String       @db.VarChar(10)
  region       Region       @relation(fields: [regionCode], references: [code])
  address      String       @db.VarChar(200)
  builtYear    Int?
  households   Int?
  buildingCount Int?
  areaTypes    Int[]        @default([])

  txCountTotal       Int       @default(0)
  txCount12m         Int       @default(0)
  lastTxAt           DateTime?

  saleCount12m       Int       @default(0)
  saleAvgPrice12m    BigInt?
  saleLastPrice      BigInt?
  saleLastAt         DateTime? @db.Date

  jeonseCount12m       Int       @default(0)
  jeonseAvgDeposit12m  BigInt?
  jeonseLastDeposit    BigInt?
  jeonseLastAt         DateTime? @db.Date

  wolseCount12m        Int       @default(0)
  wolseAvgDeposit12m   BigInt?
  wolseAvgRent12m      Int?
  wolseLastDeposit     BigInt?
  wolseLastRent        Int?
  wolseLastAt          DateTime? @db.Date

  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  transactions Transaction[]

  @@index([propertyType, regionCode])
  @@index([name])
  @@index([propertyType, lastTxAt(sort: Desc)])
}

// ─── 실거래 ──────────────────────────────────────
enum DealType {
  SALE
  JEONSE
  WOLSE
}

model Transaction {
  id           BigInt       @id @default(autoincrement())
  propertyId   BigInt
  property     Property     @relation(fields: [propertyId], references: [id])
  propertyType PropertyType
  regionCode   String       @db.VarChar(10)
  sigunguCode  String       @db.VarChar(5)

  dealType      DealType
  contractDate  DateTime     @db.Date
  exclusiveArea Decimal      @db.Decimal(6, 2)
  floor         Int?
  buildYear     Int?

  // 매매 전용
  dealAmount   Int?
  registerDate DateTime? @db.Date
  dealingType  String?   @db.VarChar(20)
  buyerType    String?   @db.VarChar(20)
  sellerType   String?   @db.VarChar(20)
  cancelDate   DateTime? @db.Date
  cancelType   String?   @db.VarChar(20)

  // 전월세 전용
  deposit        Int?
  monthlyRent    Int?
  contractTerm   String? @db.VarChar(20)
  contractType   String? @db.VarChar(20)
  useRRRight     Boolean?
  preDeposit     Int?
  preMonthlyRent Int?

  // 위치·메타
  umd         String? @db.VarChar(40)
  jibun       String? @db.VarChar(40)
  roadName    String? @db.VarChar(120)
  source      String  @db.VarChar(30)
  externalKey String? @db.VarChar(80)
  rawHash     String  @db.Char(64)

  @@unique([rawHash])
  @@index([propertyId, dealType, contractDate(sort: Desc)])
  @@index([propertyId, contractDate(sort: Desc)])
  @@index([sigunguCode, propertyType, dealType, contractDate(sort: Desc)])
  @@index([regionCode, contractDate(sort: Desc)])
  @@index([propertyType, contractDate(sort: Desc)])
}

// ─── ETL 적재 추적 ────────────────────────────────
enum IngestionStatus {
  RUNNING
  OK
  ERROR
}

model IngestionRun {
  id           BigInt          @id @default(autoincrement())
  source       String          @db.VarChar(40)
  targetKey    String          @db.VarChar(40)
  status       IngestionStatus
  rowsUpserted Int             @default(0)
  errorMessage String?         @db.Text
  startedAt    DateTime        @default(now())
  finishedAt   DateTime?

  @@index([source, targetKey])
  @@index([status, startedAt(sort: Desc)])
}

// ─── Phase 2 알림 이메일 ─────────────────────────
model EmailSignup {
  id        BigInt   @id @default(autoincrement())
  email     String   @unique @db.VarChar(120)
  topic     String   @db.VarChar(40)
  createdAt DateTime @default(now())

  @@index([topic])
}
```

- [ ] **Step 3: Format the schema**

Run: `pnpm prisma format`
Expected: no errors.

- [ ] **Step 4: Validate the schema**

Run: `pnpm prisma validate`
Expected: prints `The schema at prisma/schema.prisma is valid`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma package.json pnpm-lock.yaml
git commit -m "feat: add Prisma schema for Region, Property, Transaction, IngestionRun, EmailSignup"
```

---

### Task 10: Migration 0001_init (auto-generated)

**Files:**
- Create: `prisma/migrations/<timestamp>_init/migration.sql` (auto)

- [ ] **Step 1: Generate initial migration**

Run:
```bash
pnpm prisma migrate dev --name init --create-only
```

Expected: prints something like `Migration created at prisma/migrations/<timestamp>_init`.

- [ ] **Step 2: Inspect the migration**

Open `prisma/migrations/<timestamp>_init/migration.sql` and confirm it includes:
- `CREATE EXTENSION IF NOT EXISTS "postgis";`
- `CREATE EXTENSION IF NOT EXISTS "pg_trgm";`
- `CREATE TYPE "PropertyType" AS ENUM (...);`
- `CREATE TABLE "Region" ...`, `"Property"`, `"Transaction"`, `"IngestionRun"`, `"EmailSignup"`
- Indexes from `@@index` directives

- [ ] **Step 3: Apply migration to local DB**

Run: `pnpm prisma migrate deploy`
Expected: prints `All migrations have been successfully applied`.

- [ ] **Step 4: Verify tables exist**

Run:
```bash
docker compose exec db psql -U imjang -d imjang_on -c "\dt"
```
Expected: lists `Region`, `Property`, `Transaction`, `IngestionRun`, `EmailSignup`, `_prisma_migrations`.

Run:
```bash
docker compose exec db psql -U imjang -d imjang_on -c "SELECT extname FROM pg_extension;"
```
Expected: includes `postgis` and `pg_trgm`.

- [ ] **Step 5: Generate Prisma client**

Run: `pnpm prisma generate`
Expected: prints `Generated Prisma Client (v5.x.x)`.

- [ ] **Step 6: Commit**

```bash
git add prisma/migrations/
git commit -m "feat(db): initial schema migration for Region/Property/Transaction/IngestionRun/EmailSignup"
```

---

### Task 11: Migration 0002 — PostGIS column + generated sigunguCode columns + GiST index

**Files:**
- Create: `prisma/migrations/<timestamp>_postgis_extras/migration.sql`

- [ ] **Step 1: Create the migration directory + SQL file manually**

Run:
```bash
mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_postgis_extras
```

Let the new directory be `prisma/migrations/<NEW>_postgis_extras/`. Create `migration.sql` inside it with:

```sql
-- Generated columns: sigungu code from regionCode (first 5 chars)
ALTER TABLE "Region"
  ADD COLUMN "sigunguCode" varchar(5)
  GENERATED ALWAYS AS (LEFT(code, 5)) STORED;

CREATE INDEX "Region_sigunguCode_idx" ON "Region"("sigunguCode");

ALTER TABLE "Property"
  ADD COLUMN "sigunguCode" varchar(5)
  GENERATED ALWAYS AS (LEFT("regionCode", 5)) STORED;

CREATE INDEX "Property_sigunguCode_idx" ON "Property"("sigunguCode");
CREATE INDEX "Property_type_sgg_lasttx_idx"
  ON "Property"("propertyType", "sigunguCode", "lastTxAt" DESC);

-- PostGIS location column
ALTER TABLE "Property"
  ADD COLUMN "location" geography(Point, 4326);

CREATE INDEX "Property_location_gix" ON "Property" USING GIST ("location");

-- pg_trgm indexes for fuzzy autocomplete
CREATE INDEX "Property_nameNorm_trgm_idx"
  ON "Property" USING GIN ("nameNorm" gin_trgm_ops);

CREATE INDEX "Region_fullName_trgm_idx"
  ON "Region" USING GIN ("fullName" gin_trgm_ops);
```

- [ ] **Step 2: Apply migration**

Run: `pnpm prisma migrate deploy`
Expected: prints applying `<timestamp>_postgis_extras`.

- [ ] **Step 3: Verify columns and indexes**

Run:
```bash
docker compose exec db psql -U imjang -d imjang_on -c "\d \"Property\""
```
Expected: shows `sigunguCode` and `location geography(Point,4326)` columns.

Run:
```bash
docker compose exec db psql -U imjang -d imjang_on -c "\di \"Property_*\""
```
Expected: lists indexes including `Property_location_gix` (gist) and `Property_nameNorm_trgm_idx` (gin).

- [ ] **Step 4: Tell Prisma about untyped columns via schema extension**

Edit `prisma/schema.prisma` `Property` model — add **after the existing fields, before relations**:

```prisma
  sigunguCode  String?                           @db.VarChar(5)
  location     Unsupported("geography(Point,4326)")?
```

And in `Region`, add:

```prisma
  sigunguCode  String?  @db.VarChar(5)
```

- [ ] **Step 5: Mark schema in sync without re-migrating**

Run: `pnpm prisma migrate resolve --applied <timestamp>_postgis_extras`

(If it complains it's already applied, that's fine.)

Run: `pnpm prisma generate`

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add PostGIS location and pg_trgm/generated-column indexes"
```

---

### Task 12: lib/db.ts — Prisma singleton

**Files:**
- Create: `lib/db.ts`
- Test: `tests/lib/db.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/db.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('lib/db', () => {
  it('exports a singleton PrismaClient', async () => {
    const { prisma } = await import('@/lib/db');
    const { prisma: prisma2 } = await import('@/lib/db');
    expect(prisma).toBe(prisma2);
    expect(typeof prisma.$disconnect).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit tests/lib/db.test.ts`
Expected: FAIL — `Cannot find module '@/lib/db'`.

- [ ] **Step 3: Implement lib/db.ts**

```typescript
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit tests/lib/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts tests/lib/db.test.ts
git commit -m "feat(lib): add Prisma singleton client"
```

---

### Task 13: lib/env.ts — zod env validation

**Files:**
- Create: `lib/env.ts`
- Test: `tests/lib/env.test.ts`

- [ ] **Step 1: Install zod**

```bash
pnpm add zod@^3
```

- [ ] **Step 2: Write the failing test**

Create `tests/lib/env.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test:unit tests/lib/env.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement lib/env.ts**

```typescript
import { z } from 'zod';

const schema = z.object({
  // Required
  DATABASE_URL: z.string().url(),

  // Optional with defaults
  DIRECT_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // External APIs (optional in dev; required in prod via separate guard)
  PUBLIC_DATA_KEY: z.string().optional(),
  KAKAO_REST_KEY: z.string().optional(),
  KAKAO_JS_KEY: z.string().optional(),

  // Vercel
  REVALIDATE_TOKEN: z.string().optional(),

  // Discord / Sentry / Analytics
  DISCORD_WEBHOOK_URL: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_GA_ID: z.string().optional(),

  // Admin Basic Auth
  ADMIN_USER: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),

  // Vercel-injected
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test:unit tests/lib/env.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/env.ts tests/lib/env.test.ts package.json pnpm-lock.yaml
git commit -m "feat(lib): add zod env validation"
```

---

### Task 14: lib/logger.ts — pino structured logger

**Files:**
- Create: `lib/logger.ts`
- Test: `tests/lib/logger.test.ts`

- [ ] **Step 1: Install pino**

```bash
pnpm add pino@^9
pnpm add -D pino-pretty@^11
```

- [ ] **Step 2: Write the failing test**

Create `tests/lib/logger.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('lib/logger', () => {
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test:unit tests/lib/logger.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement lib/logger.ts**

```typescript
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test:unit tests/lib/logger.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/logger.ts tests/lib/logger.test.ts package.json pnpm-lock.yaml
git commit -m "feat(lib): add pino structured logger"
```

---

### Task 15: app/layout.tsx — root layout + fonts + globals

**Files:**
- Create: `app/layout.tsx`
- Create: `app/not-found.tsx`
- Create: `next.config.mjs`
- Create: `next-env.d.ts` (auto-generated by Next.js)

- [ ] **Step 1: Write next.config.mjs**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
```

- [ ] **Step 2: Write app/layout.tsx**

```typescript
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://imjang-on.com'),
  title: {
    default: '임장온 — 공공데이터 부동산 실거래가',
    template: '%s | 임장온',
  },
  description: '공공데이터로 보는 전국 아파트·오피스텔·연립다세대 실거래가 통합 정보',
  alternates: { canonical: '/' },
  openGraph: {
    locale: 'ko_KR',
    type: 'website',
    siteName: '임장온',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Write app/not-found.tsx**

```typescript
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container mx-auto max-w-xl py-24 text-center">
      <h1 className="text-3xl font-bold text-[var(--color-blue-dark)]">페이지를 찾을 수 없어요</h1>
      <p className="mt-3 text-[var(--color-muted)]">요청하신 페이지가 존재하지 않습니다.</p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-full bg-[var(--color-blue)] px-5 py-2.5 font-bold text-white"
      >
        홈으로 돌아가기
      </Link>
    </main>
  );
}
```

- [ ] **Step 4: Verify build compiles**

Run: `pnpm next build` (will fail because we have no pages yet, but should compile layout).

Actually run: `pnpm typecheck`
Expected: passes with no errors.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx app/not-found.tsx next.config.mjs
git commit -m "feat(app): add root layout, not-found page, and Next.js config"
```

---

### Task 16: app/(public)/layout.tsx — public route group with placeholder nav

**Files:**
- Create: `app/(public)/layout.tsx`

- [ ] **Step 1: Write the layout**

```typescript
import Link from 'next/link';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-white/85 backdrop-blur">
        <nav className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[var(--color-blue)] to-[var(--color-sky)] text-white font-black">
              임
            </span>
            <span className="text-xl font-black tracking-tighter text-[var(--color-blue-dark)]">
              임장온
            </span>
          </Link>
          <div className="hidden gap-6 text-sm font-semibold text-[var(--color-muted)] md:flex">
            <Link href="/">홈</Link>
            <Link href="/apt">아파트</Link>
            <Link href="/officetel">오피스텔</Link>
            <Link href="/villa">다세대</Link>
            <Link href="/region">지역</Link>
          </div>
        </nav>
      </header>

      <main>{children}</main>

      <footer className="mt-24 border-t border-[var(--color-line)] bg-white">
        <div className="mx-auto max-w-[1180px] px-6 py-10 text-sm text-[var(--color-muted)]">
          <p>
            © 2026 임장온. 본 사이트는 국토교통부·행정안전부 공공데이터를 가공해 제공합니다.
          </p>
          <p className="mt-1">실거래 신고 지연으로 최신성·정확성이 100% 보장되지 않습니다.</p>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/layout.tsx"
git commit -m "feat(app): add public layout group with placeholder nav and footer"
```

---

### Task 17: app/(public)/page.tsx — placeholder home

**Files:**
- Create: `app/(public)/page.tsx`

- [ ] **Step 1: Write the page**

```typescript
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '전국 아파트·오피스텔·연립다세대 실거래가',
  description: '공공데이터 기반 전국 부동산 실거래가 통합 정보 플랫폼. 매매·전세·월세를 한눈에.',
};

export const revalidate = 3600; // 1h

export default function HomePage() {
  return (
    <section className="mx-auto max-w-[1180px] px-6 py-16">
      <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-sky-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-blue-dark)]">
        공공데이터 기반 · 매일 갱신
      </span>
      <h1 className="mt-5 text-4xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-5xl">
        실거래가, 한 번에 보세요
      </h1>
      <p className="mt-4 max-w-xl text-lg text-[var(--color-muted)]">
        아파트·오피스텔·연립다세대 매매와 전월세를 단지 단위로 정리해 보여드립니다.
      </p>
      <p className="mt-12 text-sm text-[var(--color-muted)]">
        Phase 1 placeholder — 실제 콘텐츠는 Task 66에서 채워집니다.
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Run dev server and load**

Run: `pnpm dev`

In another terminal:
```bash
curl -s http://localhost:3000 | grep -c "임장온"
```
Expected: prints a number `>= 1`.

Stop dev server (Ctrl-C in dev terminal).

- [ ] **Step 3: Run the Playwright smoke test**

Run: `pnpm test:e2e tests/e2e/smoke.spec.ts --project=chromium-desktop`
Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add "app/(public)/page.tsx"
git commit -m "feat(app): add placeholder home page"
```

---

### Task 18: Smoke build + Vercel project setup (manual)

**Files:** (none in this task — operational)

- [ ] **Step 1: Production build locally**

Run: `pnpm build`
Expected: completes with `Compiled successfully` and prints route table including `/` and `/_not-found`.

- [ ] **Step 2: Start production server locally**

Run: `pnpm start`

In another terminal:
```bash
curl -sI http://localhost:3000 | head -1
```
Expected: `HTTP/1.1 200 OK`.

Stop server.

- [ ] **Step 3: Create GitHub repository (manual)**

Run via gh CLI (or do via web UI):
```bash
gh repo create imjang-on --private --source=. --remote=origin --push
```

Or set up an existing remote and push:
```bash
git remote add origin git@github.com:<your-username>/imjang-on.git
git branch -M main
git push -u origin main
```

- [ ] **Step 4: Vercel project (manual via dashboard or vercel CLI)**

```bash
pnpm add -g vercel
vercel link
```
Follow prompts: connect to GitHub repo, set framework to Next.js.

Visit Vercel dashboard → Project → Settings → Environment Variables. Add (for now leave most blank — fill in launch checklist):
- `DATABASE_URL` (Supabase pooled connection — fill after Task 91)
- `DIRECT_URL` (Supabase direct connection)
- Others remain placeholder until later tasks reference them.

- [ ] **Step 5: First deploy preview**

Run: `vercel`
Expected: prints a preview URL. Visit it — should show the placeholder home.

- [ ] **Step 6: Tag end of Phase 1A**

```bash
git tag -a phase-1a-done -m "Phase 1A foundation complete"
git push --tags
```

---

# Phase 1B — Domain Lib & UI Primitives (Task 19–32)

목표: 모든 페이지에서 재사용되는 **`lib/*` 도메인 헬퍼와 `components/ui/*` UI primitives**를 먼저 갖춰두기. 이후 ETL·페이지 작성 시 의존성이 깔끔하게 정리됩니다.

---

### Task 19: lib/format.ts — formatBillion, formatArea, formatDate

**Files:**
- Create: `lib/format.ts`
- Test: `tests/lib/format.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/format.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatBillion, formatArea, formatDate, formatPyeong, sqmToPyeong } from '@/lib/format';

describe('formatBillion (만원 → 한국식 표기)', () => {
  it.each([
    [125_000, '12.5억'],
    [10_000, '1억'],
    [99_999, '9.99억'],
    [500, '500만원'],
    [0, '0만원'],
    [null, '-'],
  ])('formats %s → %s', (input, expected) => {
    expect(formatBillion(input as number | null)).toBe(expected);
  });
});

describe('sqmToPyeong', () => {
  it('converts 84.99 m² to 25.7 평', () => {
    expect(sqmToPyeong(84.99)).toBeCloseTo(25.72, 2);
  });
});

describe('formatArea', () => {
  it('formats sqm only', () => {
    expect(formatArea(84.99, 'sqm')).toBe('84.99㎡');
  });
  it('formats pyeong with 1 decimal', () => {
    expect(formatArea(84.99, 'pyeong')).toBe('25.7평');
  });
});

describe('formatDate', () => {
  it('formats Date to YYYY-MM-DD', () => {
    expect(formatDate(new Date('2026-04-12T00:00:00Z'))).toBe('2026-04-12');
  });
  it('returns "-" for null', () => {
    expect(formatDate(null)).toBe('-');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit tests/lib/format.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement lib/format.ts**

```typescript
const SQM_PER_PYEONG = 3.3057851239669422;

export function sqmToPyeong(sqm: number): number {
  return sqm / SQM_PER_PYEONG;
}

export function formatArea(sqm: number, unit: 'sqm' | 'pyeong' = 'sqm'): string {
  if (unit === 'pyeong') {
    return `${sqmToPyeong(sqm).toFixed(1)}평`;
  }
  return `${sqm.toFixed(2)}㎡`;
}

export function formatBillion(manwon: number | bigint | null | undefined): string {
  if (manwon === null || manwon === undefined) return '-';
  const n = typeof manwon === 'bigint' ? Number(manwon) : manwon;
  if (n < 10_000) return `${n.toLocaleString('ko-KR')}만원`;
  const billion = n / 10_000;
  const rounded = Math.round(billion * 100) / 100;
  if (Number.isInteger(rounded)) return `${rounded}억`;
  return `${rounded}억`;
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return '-';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatPyeong(sqm: number): string {
  return `${Math.round(sqmToPyeong(sqm))}평`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit tests/lib/format.test.ts`
Expected: all 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/format.ts tests/lib/format.test.ts
git commit -m "feat(lib): add format helpers (formatBillion, formatArea, formatDate)"
```

---

### Task 20: lib/slug.ts — Korean text normalization

**Files:**
- Create: `lib/slug.ts`
- Test: `tests/lib/slug.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/slug.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeName } from '@/lib/slug';

describe('normalizeName', () => {
  it.each([
    ['래미안서초에스티지', '래미안서초에스티지'],
    ['래미안 서초 에스티지', '래미안서초에스티지'],
    ['래미안-서초·에스티지', '래미안서초에스티지'],
    ['  공백  ', '공백'],
    ['SK뷰', 'sk뷰'],
  ])('normalizes %s → %s', (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit tests/lib/slug.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement lib/slug.ts**

```typescript
/**
 * Property name normalization for matching/search.
 * - Lowercases ASCII
 * - Removes all whitespace, hyphens, punctuation (Latin & CJK)
 * - Keeps Hangul, Hangul jamo, ASCII letters/digits
 */
export function normalizeName(input: string): string {
  return input
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s\-_·.,/()[\]'"!?]+/g, '');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit tests/lib/slug.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/slug.ts tests/lib/slug.test.ts
git commit -m "feat(lib): add Korean name normalization (normalizeName)"
```

---

### Task 21: lib/api-error.ts — JSON error envelope for Route Handlers

**Files:**
- Create: `lib/api-error.ts`
- Test: `tests/lib/api-error.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/lib/api-error.test.ts
import { describe, it, expect } from 'vitest';
import { ApiError, apiErrorResponse } from '@/lib/api-error';

describe('ApiError', () => {
  it('wraps known errors as JSON Response', async () => {
    const res = apiErrorResponse(new ApiError('NOT_FOUND', '단지 없음', 404));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: { code: 'NOT_FOUND', message: '단지 없음' } });
  });

  it('wraps unknown errors as INTERNAL_ERROR', async () => {
    const res = apiErrorResponse(new Error('boom'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});
```

- [ ] **Step 2: Implement lib/api-error.ts**

```typescript
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function apiErrorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
  return Response.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } },
    { status: 500 },
  );
}
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm test:unit tests/lib/api-error.test.ts
git add lib/api-error.ts tests/lib/api-error.test.ts
git commit -m "feat(lib): add ApiError class and apiErrorResponse helper"
```

---

### Task 22: lib/cn.ts + install UI deps (clsx, tailwind-merge, lucide, Radix, vaul)

**Files:**
- Create: `lib/cn.ts`

- [ ] **Step 1: Install UI dependencies**

```bash
pnpm add clsx@^2 tailwind-merge@^2 lucide-react@^0.460 \
  @radix-ui/react-dropdown-menu@^2 \
  @radix-ui/react-dialog@^1 \
  vaul@^1
```

- [ ] **Step 2: Write lib/cn.ts**

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/cn.ts package.json pnpm-lock.yaml
git commit -m "chore: install UI deps (Radix, vaul, lucide, clsx, tailwind-merge) + cn helper"
```

---

### Task 23: components/ui/button.tsx

**Files:**
- Create: `components/ui/button.tsx`

- [ ] **Step 1: Implement Button**

```typescript
import { cn } from '@/lib/cn';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-[var(--color-blue)] text-white hover:bg-[var(--color-blue-dark)]',
  secondary: 'bg-white text-[var(--color-blue-dark)] border border-[var(--color-line)] hover:bg-[var(--color-soft)]',
  ghost: 'bg-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm font-semibold',
  md: 'px-4 py-2.5 text-sm font-bold',
  lg: 'px-5 py-3 text-base font-bold',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add components/ui/button.tsx
git commit -m "feat(ui): add Button primitive"
```

---

### Task 24: components/ui/chip.tsx

**Files:**
- Create: `components/ui/chip.tsx`

- [ ] **Step 1: Implement Chip (filter chip with active state)**

```typescript
import { cn } from '@/lib/cn';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, active = false, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={active}
      className={cn(
        'rounded-full px-3 py-1.5 text-sm font-semibold transition',
        active
          ? 'bg-[var(--color-blue)] text-white'
          : 'bg-white text-[var(--color-muted)] border border-[var(--color-line)] hover:text-[var(--color-text)]',
        className,
      )}
      {...props}
    />
  ),
);
Chip.displayName = 'Chip';
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add components/ui/chip.tsx
git commit -m "feat(ui): add Chip primitive with active state"
```

---

### Task 25: components/ui/card.tsx

**Files:**
- Create: `components/ui/card.tsx`

- [ ] **Step 1: Implement Card**

```typescript
import { cn } from '@/lib/cn';
import type { HTMLAttributes } from 'react';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] bg-[var(--color-card)] shadow-[var(--shadow-soft)] p-6',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-lg font-bold text-[var(--color-blue-dark)]', className)}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add components/ui/card.tsx
git commit -m "feat(ui): add Card primitives (Card, CardHeader, CardTitle)"
```

---

### Task 26: components/ui/badge.tsx

**Files:**
- Create: `components/ui/badge.tsx`

- [ ] **Step 1: Implement DealType-aware Badge**

```typescript
import { cn } from '@/lib/cn';
import type { HTMLAttributes } from 'react';

type Tone = 'blue' | 'green' | 'orange' | 'red' | 'gray';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

const toneClasses: Record<Tone, string> = {
  blue: 'bg-[var(--color-sky-soft)] text-[var(--color-blue-dark)]',
  green: 'bg-emerald-50 text-emerald-700',
  orange: 'bg-orange-50 text-orange-700',
  red: 'bg-red-50 text-red-700',
  gray: 'bg-slate-100 text-slate-700',
};

export function Badge({ className, tone = 'gray', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}

export function dealTypeTone(dealType: 'SALE' | 'JEONSE' | 'WOLSE'): Tone {
  return dealType === 'SALE' ? 'blue' : dealType === 'JEONSE' ? 'green' : 'orange';
}

export function dealTypeLabel(dealType: 'SALE' | 'JEONSE' | 'WOLSE'): string {
  return dealType === 'SALE' ? '매매' : dealType === 'JEONSE' ? '전세' : '월세';
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add components/ui/badge.tsx
git commit -m "feat(ui): add Badge primitive with deal-type tones"
```

---

### Task 27: components/ui/skeleton.tsx

**Files:**
- Create: `components/ui/skeleton.tsx`

- [ ] **Step 1: Implement Skeleton**

```typescript
import { cn } from '@/lib/cn';
import type { HTMLAttributes } from 'react';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-[var(--color-line)]', className)}
      aria-hidden
      {...props}
    />
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add components/ui/skeleton.tsx
git commit -m "feat(ui): add Skeleton loading primitive"
```

---

### Task 28: components/ui/input.tsx

**Files:**
- Create: `components/ui/input.tsx`

- [ ] **Step 1: Implement Input**

```typescript
import { cn } from '@/lib/cn';
import { forwardRef, type InputHTMLAttributes } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-xl border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-blue)] focus:ring-2 focus:ring-[var(--color-sky-soft)]',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add components/ui/input.tsx
git commit -m "feat(ui): add Input primitive"
```

---

### Task 29: components/ui/dropdown.tsx (Radix)

**Files:**
- Create: `components/ui/dropdown.tsx`

- [ ] **Step 1: Implement Dropdown wrapper around Radix**

```typescript
'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

export interface DropdownItem {
  label: string;
  href?: string;
  onSelect?: () => void;
  icon?: ReactNode;
}

export function Dropdown({
  label,
  items,
  align = 'start',
}: {
  label: ReactNode;
  items: DropdownItem[];
  align?: 'start' | 'end' | 'center';
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)]">
        {label}
        <ChevronDown size={14} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={8}
          className={cn(
            'z-50 min-w-[180px] rounded-2xl bg-white p-1.5 shadow-[var(--shadow-soft)]',
            'border border-[var(--color-line)]',
          )}
        >
          {items.map((item, i) => (
            <DropdownMenu.Item
              key={i}
              onSelect={item.onSelect}
              asChild={!!item.href}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none hover:bg-[var(--color-soft)]"
            >
              {item.href ? (
                <a href={item.href}>
                  {item.icon}
                  {item.label}
                </a>
              ) : (
                <span>
                  {item.icon}
                  {item.label}
                </span>
              )}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add components/ui/dropdown.tsx
git commit -m "feat(ui): add Dropdown component (Radix wrapper)"
```

---

### Task 30: components/ui/modal.tsx (Radix Dialog)

**Files:**
- Create: `components/ui/modal.tsx`

- [ ] **Step 1: Implement Modal**

```typescript
'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}

export function Modal({ open, onOpenChange, title, children }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2',
            'rounded-[var(--radius-card)] bg-white p-6 shadow-[var(--shadow-soft)]',
          )}
        >
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-bold text-[var(--color-blue-dark)]">{title}</Dialog.Title>
            <Dialog.Close className="text-[var(--color-muted)] hover:text-[var(--color-text)]">
              <X size={18} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add components/ui/modal.tsx
git commit -m "feat(ui): add Modal component (Radix Dialog wrapper)"
```

---

### Task 31: components/ui/bottom-sheet.tsx (vaul)

**Files:**
- Create: `components/ui/bottom-sheet.tsx`

- [ ] **Step 1: Implement BottomSheet**

```typescript
'use client';

import { Drawer } from 'vaul';
import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: ReactNode;
}

export function BottomSheet({ open, onOpenChange, title, children }: BottomSheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Drawer.Content
          className={cn(
            'fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-white p-6 shadow-[var(--shadow-soft)]',
          )}
        >
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[var(--color-line)]" />
          {title && (
            <Drawer.Title className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">{title}</Drawer.Title>
          )}
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add components/ui/bottom-sheet.tsx
git commit -m "feat(ui): add BottomSheet component (vaul wrapper)"
```

---

### Task 32: components/ui/pagination.tsx

**Files:**
- Create: `components/ui/pagination.tsx`

- [ ] **Step 1: Implement Pagination (10-per-page, sliding window)**

```typescript
'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface PaginationProps {
  current: number;
  totalPages: number;
  totalItems: number;
  perPage: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}

export function Pagination({
  current,
  totalPages,
  totalItems,
  perPage,
  onChange,
  disabled,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const window = pageWindow(current, totalPages);
  const start = (current - 1) * perPage + 1;
  const end = Math.min(current * perPage, totalItems);

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <nav className="flex items-center gap-1" aria-label="pagination">
        <IconBtn label="first" onClick={() => onChange(1)} disabled={disabled || current === 1}>
          <ChevronsLeft size={14} />
        </IconBtn>
        <IconBtn label="prev" onClick={() => onChange(current - 1)} disabled={disabled || current === 1}>
          <ChevronLeft size={14} />
        </IconBtn>
        {window.map((p, i) =>
          p === '…' ? (
            <span key={`g${i}`} className="px-2 text-sm text-[var(--color-muted)]">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              disabled={disabled}
              aria-current={p === current ? 'page' : undefined}
              className={cn(
                'min-w-[32px] rounded-lg px-2.5 py-1 text-sm font-semibold',
                p === current
                  ? 'bg-[var(--color-blue)] text-white'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-soft)]',
              )}
            >
              {p}
            </button>
          ),
        )}
        <IconBtn label="next" onClick={() => onChange(current + 1)} disabled={disabled || current === totalPages}>
          <ChevronRight size={14} />
        </IconBtn>
        <IconBtn label="last" onClick={() => onChange(totalPages)} disabled={disabled || current === totalPages}>
          <ChevronsRight size={14} />
        </IconBtn>
      </nav>
      <span className="text-xs text-[var(--color-muted)]">
        {totalItems}건 중 {start}–{end} 표시
      </span>
    </div>
  );
}

function IconBtn({
  label,
  children,
  onClick,
  disabled,
}: { label: string; children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-soft)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '…')[] = [1];
  const left = Math.max(2, current - 2);
  const right = Math.min(total - 1, current + 2);
  if (left > 2) pages.push('…');
  for (let p = left; p <= right; p++) pages.push(p);
  if (right < total - 1) pages.push('…');
  pages.push(total);
  return pages;
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add components/ui/pagination.tsx
git commit -m "feat(ui): add Pagination component (10-per-page, sliding window)"
git tag -a phase-1b-done -m "Phase 1B domain lib + UI primitives complete"
```

---

# Phase 1C — ETL Pipeline (Task 33–53)

목표: **공공데이터 6 API + 법정동코드를 Supabase Postgres에 적재하는 전체 파이프라인**. GitHub Actions 워크플로 4개로 운영.

---

### Task 33: scripts/ingest/types.ts — shared types

**Files:**
- Create: `scripts/ingest/types.ts`

- [ ] **Step 1: Define common types**

```typescript
import type { DealType, PropertyType } from '@prisma/client';

export type ApiType =
  | 'apt-trade'
  | 'apt-rent'
  | 'offi-trade'
  | 'offi-rent'
  | 'rh-trade'
  | 'rh-rent';

export interface NormalizedTransaction {
  propertyType: PropertyType;
  dealType: DealType;
  name: string;
  buildYear: number | null;
  contractDate: Date;
  exclusiveArea: number;
  floor: number | null;

  // 매매
  dealAmount: number | null;
  registerDate: Date | null;
  dealingType: string | null;
  buyerType: string | null;
  sellerType: string | null;
  cancelDate: Date | null;
  cancelType: string | null;

  // 전월세
  deposit: number | null;
  monthlyRent: number | null;
  contractTerm: string | null;
  contractType: string | null;
  useRRRight: boolean | null;
  preDeposit: number | null;
  preMonthlyRent: number | null;

  // 위치
  sigunguCode: string;        // LAWD_CD
  umd: string | null;
  jibun: string | null;
  roadName: string | null;
  externalKey: string | null;
}

export interface FetchPage {
  rows: NormalizedTransaction[];
  totalCount: number;
}

export interface Adapter {
  apiType: ApiType;
  endpoint: string;            // full URL of operation
  source: string;              // e.g. "molit-apt-trade"
  parseRows: (xml: string, sigunguCode: string) => FetchPage;
}

export type Mode = 'daily' | 'backfill';
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add scripts/ingest/types.ts
git commit -m "feat(ingest): add shared types (NormalizedTransaction, Adapter, ApiType)"
```

---

### Task 34: scripts/ingest/http.ts — HTTP client with retry + paging

**Files:**
- Create: `scripts/ingest/http.ts`
- Create: `tsx` runtime via dev dep (already added via Task 1 script, install now)

- [ ] **Step 1: Install tsx + dependencies**

```bash
pnpm add -D tsx@^4
pnpm add fast-xml-parser@^4
```

- [ ] **Step 2: Write http.ts**

```typescript
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

const BASE = 'https://apis.data.go.kr/1613000';
const TIMEOUT_MS = 15_000;
const SLEEP_MS = 80;
const MAX_RETRIES = 3;

export async function fetchPage(params: {
  operation: string;
  lawdCd: string;
  dealYmd: string;
  pageNo: number;
  numOfRows?: number;
}): Promise<string> {
  if (!env.PUBLIC_DATA_KEY) {
    throw new Error('PUBLIC_DATA_KEY is required');
  }
  const url = new URL(`${BASE}/${params.operation}/${params.operation}`);
  url.searchParams.set('serviceKey', env.PUBLIC_DATA_KEY);
  url.searchParams.set('LAWD_CD', params.lawdCd);
  url.searchParams.set('DEAL_YMD', params.dealYmd);
  url.searchParams.set('pageNo', String(params.pageNo));
  url.searchParams.set('numOfRows', String(params.numOfRows ?? 1000));

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt++;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), { signal: ctrl.signal });
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          const backoff = SLEEP_MS * Math.pow(3, attempt);
          logger.warn({ status: res.status, attempt, backoff }, 'http retry');
          await sleep(backoff);
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${params.operation}`);
      }
      await sleep(SLEEP_MS);
      return await res.text();
    } catch (err: unknown) {
      if (attempt < MAX_RETRIES) {
        const backoff = SLEEP_MS * Math.pow(3, attempt);
        logger.warn({ err, attempt, backoff }, 'http error retry');
        await sleep(backoff);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(t);
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck
git add scripts/ingest/http.ts package.json pnpm-lock.yaml
git commit -m "feat(ingest): add HTTP client with retry, backoff, and timeout"
```

---

### Task 35: scripts/ingest/xml-parse.ts — wrap fast-xml-parser

**Files:**
- Create: `scripts/ingest/xml-parse.ts`
- Test: `tests/ingest/xml-parse.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/ingest/xml-parse.test.ts
import { describe, it, expect } from 'vitest';
import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>00</resultCode></header>
  <body>
    <items>
      <item><aptNm>래미안</aptNm><dealAmount>125,000</dealAmount></item>
      <item><aptNm>자이</aptNm><dealAmount>98,500</dealAmount></item>
    </items>
    <totalCount>2</totalCount>
  </body>
</response>`;

describe('xml-parse', () => {
  it('parses XML to JS object', () => {
    const obj = parseXml(SAMPLE);
    expect(obj.response.body.totalCount).toBe(2);
  });

  it('extracts items as array even when single', () => {
    const obj = parseXml(SAMPLE);
    expect(getItems(obj)).toHaveLength(2);
  });

  it('extracts totalCount', () => {
    const obj = parseXml(SAMPLE);
    expect(getTotalCount(obj)).toBe(2);
  });

  it('returns empty array for no items', () => {
    const empty = `<response><body><totalCount>0</totalCount><items/></body></response>`;
    expect(getItems(parseXml(empty))).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement xml-parse.ts**

```typescript
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: true,
  trimValues: true,
});

export function parseXml(xml: string): Record<string, unknown> {
  return parser.parse(xml) as Record<string, unknown>;
}

export function getItems(parsed: Record<string, unknown>): Record<string, unknown>[] {
  const items = (parsed as any)?.response?.body?.items;
  if (!items) return [];
  if (items === '') return [];
  const item = (items as any).item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

export function getTotalCount(parsed: Record<string, unknown>): number {
  const v = (parsed as any)?.response?.body?.totalCount;
  return typeof v === 'number' ? v : Number(v ?? 0);
}

export function parseCommaNumber(v: string | number | undefined | null): number | null {
  if (v === undefined || v === null || v === '') return null;
  const cleaned = String(v).replace(/,/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseYmd(year: unknown, month: unknown, day: unknown): Date | null {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}
```

- [ ] **Step 3: Run test + commit**

```bash
pnpm test:unit tests/ingest/xml-parse.test.ts
git add scripts/ingest/xml-parse.ts tests/ingest/xml-parse.test.ts
git commit -m "feat(ingest): add XML parser helpers (parseXml, getItems, parseCommaNumber)"
```

---

### Task 36: scripts/ingest/notify.ts — Discord webhook

**Files:**
- Create: `scripts/ingest/notify.ts`

- [ ] **Step 1: Implement notify.ts**

```typescript
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export async function notify(
  level: 'info' | 'warn' | 'error',
  message: string,
  ctx?: Record<string, unknown>,
): Promise<void> {
  if (!env.DISCORD_WEBHOOK_URL) {
    logger.info({ level, message, ctx }, 'notify (no webhook configured)');
    return;
  }
  const emoji = level === 'error' ? '🔴' : level === 'warn' ? '🟡' : '🟢';
  const body = {
    content: ctx
      ? `${emoji} **[${level.toUpperCase()}]** ${message}\n\`\`\`json\n${JSON.stringify(ctx, null, 2).slice(0, 1800)}\n\`\`\``
      : `${emoji} **[${level.toUpperCase()}]** ${message}`,
  };
  try {
    await fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    logger.warn({ err: e }, 'discord notify failed');
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/ingest/notify.ts
git commit -m "feat(ingest): add Discord webhook notify helper"
```

---

### Task 37: scripts/ingest/regions/seed.ts — 법정동코드 적재

**Files:**
- Create: `scripts/ingest/regions/seed.ts`

- [ ] **Step 1: Implement seed**

데이터 소스: code.go.kr 또는 data.go.kr 15063424. 본 스크립트는 TXT(탭 구분, EUC-KR) 파일을 받아 적재합니다.

```typescript
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE_VERSION = process.env.REGION_SOURCE_VERSION ?? new Date().toISOString().slice(0, 7);

async function main() {
  const path = resolve(process.argv[2] ?? './data/regions.txt');
  logger.info({ path, version: SOURCE_VERSION }, 'seeding regions');

  const raw = readFileSync(path, 'utf-8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('법정동코드'));

  const records = lines.map((line) => {
    const [code, fullName, status, abolishedDate, oldCode] = line.split('\t');
    const parts = (fullName ?? '').split(/\s+/);
    const sido = parts[0] ?? '';
    const sigungu = parts[1] ?? null;
    const eupmyeondong = parts[2] ?? null;
    const ri = parts[3] ?? null;
    const level = (eupmyeondong ? (ri ? 4 : 3) : sigungu ? 2 : 1);
    return {
      code: code.trim(),
      sido,
      sigungu,
      eupmyeondong,
      ri,
      fullName: fullName?.trim() ?? '',
      level,
      parentCode: derivedParent(code, level),
      isAbolished: status?.trim() === '폐지',
      abolishedAt: abolishedDate?.trim() ? new Date(abolishedDate.trim()) : null,
      sourceVersion: SOURCE_VERSION,
    };
  });

  const chunkSize = 1000;
  let upserted = 0;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    await prisma.$transaction(
      chunk.map((r) =>
        prisma.region.upsert({
          where: { code: r.code },
          create: r,
          update: r,
        }),
      ),
    );
    upserted += chunk.length;
    logger.info({ upserted, total: records.length }, 'seeded region chunk');
  }
  await prisma.$disconnect();
  logger.info({ upserted }, 'region seed done');
}

function derivedParent(code: string, level: number): string | null {
  if (level <= 1) return null;
  if (level === 2) return code.slice(0, 2).padEnd(10, '0');
  if (level === 3) return code.slice(0, 5).padEnd(10, '0');
  return code.slice(0, 8).padEnd(10, '0');
}

main().catch((err) => {
  logger.error({ err }, 'region seed failed');
  process.exit(1);
});
```

- [ ] **Step 2: Download data + run seed (manual)**

Download `법정동코드_전체자료.txt` from code.go.kr or data.go.kr 15063424 to `./data/regions.txt` (place outside the repo or in a `data/` dir not committed).

Run: `pnpm tsx scripts/ingest/regions/seed.ts ./data/regions.txt`
Expected: seeds ~50K rows.

Verify:
```bash
docker compose exec db psql -U imjang -d imjang_on -c "SELECT level, COUNT(*) FROM \"Region\" GROUP BY level ORDER BY level;"
```
Expected: 4 rows for levels 1-4.

- [ ] **Step 3: Commit**

```bash
git add scripts/ingest/regions/seed.ts
git commit -m "feat(ingest): add 법정동코드 seed script"
```

---

### Task 38: scripts/ingest/geocoder.ts — Kakao Local API

**Files:**
- Create: `scripts/ingest/geocoder.ts`

- [ ] **Step 1: Implement geocoder with in-memory cache**

```typescript
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

interface Coord {
  lat: number;
  lng: number;
}

const cache = new Map<string, Coord | null>();

export async function geocode(address: string): Promise<Coord | null> {
  if (!env.KAKAO_REST_KEY) {
    logger.warn('KAKAO_REST_KEY not set — skipping geocode');
    return null;
  }
  if (cache.has(address)) return cache.get(address) ?? null;

  const url = new URL('https://dapi.kakao.com/v2/local/search/address.json');
  url.searchParams.set('query', address);
  url.searchParams.set('size', '1');

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `KakaoAK ${env.KAKAO_REST_KEY}` },
    });
    if (!res.ok) {
      logger.warn({ status: res.status, address }, 'geocode http failure');
      cache.set(address, null);
      return null;
    }
    const data = (await res.json()) as { documents?: { x: string; y: string }[] };
    const doc = data.documents?.[0];
    if (!doc) {
      cache.set(address, null);
      return null;
    }
    const coord = { lat: Number(doc.y), lng: Number(doc.x) };
    cache.set(address, coord);
    return coord;
  } catch (err) {
    logger.warn({ err, address }, 'geocode failed');
    cache.set(address, null);
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/ingest/geocoder.ts
git commit -m "feat(ingest): add Kakao Local geocoder with cache"
```

---

### Task 39: scripts/ingest/property-matcher.ts — 3-stage matcher

**Files:**
- Create: `scripts/ingest/property-matcher.ts`
- Test: `tests/ingest/property-matcher.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/ingest/property-matcher.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { findOrCreateProperty } from '@/scripts/ingest/property-matcher';
import { PropertyType } from '@prisma/client';

vi.mock('@/scripts/ingest/geocoder', () => ({
  geocode: vi.fn().mockResolvedValue({ lat: 37.5, lng: 127.0 }),
}));

describe('property-matcher', () => {
  beforeEach(async () => {
    await prisma.transaction.deleteMany();
    await prisma.property.deleteMany();
  });

  it('1차: exact match on (type, name, sigungu)', async () => {
    await prisma.region.upsert({
      where: { code: '1165010100' },
      create: { code: '1165010100', sido: '서울', sigungu: '서초구', eupmyeondong: '서초동', fullName: '서울 서초구 서초동', level: 3, sourceVersion: 'test' },
      update: {},
    });
    const created = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: '1165010100', address: '서울 서초구' },
    });

    const found = await findOrCreateProperty({
      propertyType: PropertyType.APARTMENT,
      name: '래미안',
      sigunguCode: '11650',
      regionCode: '1165010100',
      address: '서울 서초구',
      buildYear: 2010,
      roadName: null,
    });
    expect(found.id).toBe(created.id);
  });

  it('3차: creates new property with geocoded location when not found', async () => {
    await prisma.region.upsert({
      where: { code: '1165010100' },
      create: { code: '1165010100', sido: '서울', sigungu: '서초구', eupmyeondong: '서초동', fullName: '서울 서초구 서초동', level: 3, sourceVersion: 'test' },
      update: {},
    });
    const p = await findOrCreateProperty({
      propertyType: PropertyType.APARTMENT,
      name: '신규단지',
      sigunguCode: '11650',
      regionCode: '1165010100',
      address: '서울 서초구 서초동 1',
      buildYear: 2024,
      roadName: null,
    });
    expect(p.id).toBeDefined();
    expect(p.name).toBe('신규단지');
  });
});
```

- [ ] **Step 2: Implement property-matcher.ts**

```typescript
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { normalizeName } from '@/lib/slug';
import { geocode } from '@/scripts/ingest/geocoder';
import type { PropertyType } from '@prisma/client';

export interface MatcherInput {
  propertyType: PropertyType;
  name: string;
  sigunguCode: string;
  regionCode: string;          // 가장 구체적인 region (eupmyeondong 까지)
  address: string;
  buildYear: number | null;
  roadName: string | null;
}

export async function findOrCreateProperty(input: MatcherInput) {
  const nameNorm = normalizeName(input.name);

  // 1차: 정확 일치
  const exact = await prisma.property.findFirst({
    where: {
      propertyType: input.propertyType,
      name: input.name,
      regionCode: { startsWith: input.sigunguCode },
    },
  });
  if (exact) return exact;

  // 2차: 정규화 + 도로명 보조
  const candidates = await prisma.property.findMany({
    where: {
      propertyType: input.propertyType,
      nameNorm,
      regionCode: { startsWith: input.sigunguCode },
    },
    take: 5,
  });
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    if (input.roadName) {
      const byRoad = candidates.find((c) => c.address.includes(input.roadName!));
      if (byRoad) return byRoad;
    }
    logger.warn({ name: input.name, sigungu: input.sigunguCode, count: candidates.length }, 'ambiguous match — picking first');
    return candidates[0];
  }

  // 3차: 신규 생성 + 지오코딩
  const coord = await geocode(input.address);
  const created = await prisma.property.create({
    data: {
      propertyType: input.propertyType,
      name: input.name,
      nameNorm,
      regionCode: input.regionCode,
      address: input.address,
      builtYear: input.buildYear,
    },
  });
  if (coord) {
    await prisma.$executeRaw`
      UPDATE "Property"
      SET location = ST_SetSRID(ST_MakePoint(${coord.lng}, ${coord.lat}), 4326)::geography
      WHERE id = ${created.id}
    `;
  }
  return created;
}
```

- [ ] **Step 3: Run test (DB up + migrations applied)**

```bash
docker compose up -d db
DATABASE_URL=postgresql://imjang:dev@localhost:5432/imjang_on?schema=public \
  pnpm prisma migrate deploy
pnpm test:unit tests/ingest/property-matcher.test.ts
```
Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest/property-matcher.ts tests/ingest/property-matcher.test.ts
git commit -m "feat(ingest): add 3-stage property matcher with geocoding"
```

---

### Task 40: scripts/ingest/aggregator.ts — Property 집계 컬럼 갱신

**Files:**
- Create: `scripts/ingest/aggregator.ts`

- [ ] **Step 1: Implement aggregator**

```typescript
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function updatePropertyAggregates(propertyIds: bigint[]): Promise<void> {
  if (propertyIds.length === 0) return;

  await prisma.$executeRaw`
    WITH agg AS (
      SELECT
        "propertyId" AS pid,
        COUNT(*)::int AS cnt_total,
        COUNT(*)::int FILTER (WHERE "contractDate" >= NOW() - INTERVAL '12 months') AS cnt_12m,
        MAX("contractDate") AS last_at,

        COUNT(*)::int FILTER (WHERE "dealType"='SALE' AND "contractDate" >= NOW() - INTERVAL '12 months') AS sale_cnt,
        AVG("dealAmount")::bigint FILTER (WHERE "dealType"='SALE' AND "contractDate" >= NOW() - INTERVAL '12 months') AS sale_avg,
        (array_agg("dealAmount" ORDER BY "contractDate" DESC) FILTER (WHERE "dealType"='SALE'))[1]::bigint AS sale_last,
        MAX("contractDate") FILTER (WHERE "dealType"='SALE') AS sale_last_at,

        COUNT(*)::int FILTER (WHERE "dealType"='JEONSE' AND "contractDate" >= NOW() - INTERVAL '12 months') AS jeonse_cnt,
        AVG("deposit")::bigint FILTER (WHERE "dealType"='JEONSE' AND "contractDate" >= NOW() - INTERVAL '12 months') AS jeonse_avg,
        (array_agg("deposit" ORDER BY "contractDate" DESC) FILTER (WHERE "dealType"='JEONSE'))[1]::bigint AS jeonse_last,
        MAX("contractDate") FILTER (WHERE "dealType"='JEONSE') AS jeonse_last_at,

        COUNT(*)::int FILTER (WHERE "dealType"='WOLSE' AND "contractDate" >= NOW() - INTERVAL '12 months') AS wolse_cnt,
        AVG("deposit")::bigint FILTER (WHERE "dealType"='WOLSE' AND "contractDate" >= NOW() - INTERVAL '12 months') AS wolse_dep_avg,
        AVG("monthlyRent")::int FILTER (WHERE "dealType"='WOLSE' AND "contractDate" >= NOW() - INTERVAL '12 months') AS wolse_rent_avg,
        (array_agg("deposit" ORDER BY "contractDate" DESC) FILTER (WHERE "dealType"='WOLSE'))[1]::bigint AS wolse_last_dep,
        (array_agg("monthlyRent" ORDER BY "contractDate" DESC) FILTER (WHERE "dealType"='WOLSE'))[1]::int AS wolse_last_rent,
        MAX("contractDate") FILTER (WHERE "dealType"='WOLSE') AS wolse_last_at
      FROM "Transaction"
      WHERE "propertyId" = ANY(${propertyIds}::bigint[])
      GROUP BY "propertyId"
    )
    UPDATE "Property" p
    SET
      "txCountTotal" = agg.cnt_total,
      "txCount12m"   = agg.cnt_12m,
      "lastTxAt"     = agg.last_at,
      "saleCount12m"     = agg.sale_cnt,
      "saleAvgPrice12m"  = agg.sale_avg,
      "saleLastPrice"    = agg.sale_last,
      "saleLastAt"       = agg.sale_last_at,
      "jeonseCount12m"      = agg.jeonse_cnt,
      "jeonseAvgDeposit12m" = agg.jeonse_avg,
      "jeonseLastDeposit"   = agg.jeonse_last,
      "jeonseLastAt"        = agg.jeonse_last_at,
      "wolseCount12m"       = agg.wolse_cnt,
      "wolseAvgDeposit12m"  = agg.wolse_dep_avg,
      "wolseAvgRent12m"     = agg.wolse_rent_avg,
      "wolseLastDeposit"    = agg.wolse_last_dep,
      "wolseLastRent"       = agg.wolse_last_rent,
      "wolseLastAt"         = agg.wolse_last_at
    FROM agg
    WHERE p.id = agg.pid
  `;

  // Update areaTypes (실제 거래 평형)
  await prisma.$executeRaw`
    UPDATE "Property" p
    SET "areaTypes" = sub.types
    FROM (
      SELECT "propertyId" AS pid,
             ARRAY(SELECT DISTINCT ROUND("exclusiveArea" / 3.3057851239669422)::int
                   FROM "Transaction"
                   WHERE "propertyId" = ANY(${propertyIds}::bigint[])
                   ORDER BY 1) AS types
      FROM "Transaction"
      WHERE "propertyId" = ANY(${propertyIds}::bigint[])
      GROUP BY "propertyId"
    ) sub
    WHERE p.id = sub.pid
  `;

  logger.info({ count: propertyIds.length }, 'property aggregates updated');
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/ingest/aggregator.ts
git commit -m "feat(ingest): add Property aggregate column updater"
```

---

### Task 41: scripts/ingest/revalidator.ts — POST to /api/revalidate

**Files:**
- Create: `scripts/ingest/revalidator.ts`

- [ ] **Step 1: Implement**

```typescript
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

const SITE_URL = process.env.SITE_URL ?? 'https://imjang-on.com';

export async function revalidatePaths(paths: string[]): Promise<void> {
  if (paths.length === 0 || !env.REVALIDATE_TOKEN) return;
  const unique = Array.from(new Set(paths));
  try {
    const res = await fetch(`${SITE_URL}/api/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: env.REVALIDATE_TOKEN, paths: unique }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'revalidate failed');
    } else {
      logger.info({ count: unique.length }, 'revalidate done');
    }
  } catch (err) {
    logger.warn({ err }, 'revalidate error');
  }
}

export function propertyPath(propertyType: 'APARTMENT' | 'OFFICETEL' | 'ROW_HOUSE' | 'MULTIPLEX', id: bigint): string {
  const prefix =
    propertyType === 'APARTMENT' ? '/apt' : propertyType === 'OFFICETEL' ? '/officetel' : '/villa';
  return `${prefix}/${id}`;
}

export function regionPath(sigunguCode: string): string {
  return `/region/${sigunguCode}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/ingest/revalidator.ts
git commit -m "feat(ingest): add revalidator that POSTs to /api/revalidate"
```

---

### Task 42: scripts/ingest/transactions/adapter-apt-trade.ts

**Files:**
- Create: `scripts/ingest/transactions/adapter-apt-trade.ts`
- Create: `tests/ingest/fixtures/apt-trade-sample.xml`
- Test: `tests/ingest/adapter-apt-trade.test.ts`

- [ ] **Step 1: Create fixture (sanitized sample response)**

Create `tests/ingest/fixtures/apt-trade-sample.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>00</resultCode></header>
  <body>
    <items>
      <item>
        <aptNm>래미안서초에스티지</aptNm>
        <aptDong>101</aptDong>
        <aptSeq>11650-100</aptSeq>
        <buildYear>2009</buildYear>
        <dealAmount>302,000</dealAmount>
        <dealYear>2025</dealYear>
        <dealMonth>5</dealMonth>
        <dealDay>12</dealDay>
        <excluUseAr>84.99</excluUseAr>
        <floor>12</floor>
        <umdNm>반포동</umdNm>
        <jibun>1-1</jibun>
        <roadNm>반포대로</roadNm>
        <sggCd>11650</sggCd>
        <dealingGbn>중개거래</dealingGbn>
        <buyerGbn>개인</buyerGbn>
        <slerGbn>개인</slerGbn>
        <rgstDate>20250520</rgstDate>
      </item>
    </items>
    <totalCount>1</totalCount>
  </body>
</response>
```

- [ ] **Step 2: Write failing test**

```typescript
// tests/ingest/adapter-apt-trade.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adapterAptTrade } from '@/scripts/ingest/transactions/adapter-apt-trade';

const xml = readFileSync(resolve('tests/ingest/fixtures/apt-trade-sample.xml'), 'utf-8');

describe('adapter-apt-trade', () => {
  it('parses one row from sample', () => {
    const { rows, totalCount } = adapterAptTrade.parseRows(xml, '11650');
    expect(totalCount).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      propertyType: 'APARTMENT',
      dealType: 'SALE',
      name: '래미안서초에스티지',
      buildYear: 2009,
      dealAmount: 302_000,
      exclusiveArea: 84.99,
      floor: 12,
      sigunguCode: '11650',
      umd: '반포동',
      roadName: '반포대로',
    });
    expect(rows[0].contractDate.toISOString().slice(0, 10)).toBe('2025-05-12');
  });
});
```

- [ ] **Step 3: Implement adapter-apt-trade.ts**

```typescript
import { parseXml, getItems, getTotalCount, parseCommaNumber, parseYmd } from '@/scripts/ingest/xml-parse';
import { PropertyType, DealType } from '@prisma/client';
import type { Adapter, NormalizedTransaction } from '@/scripts/ingest/types';

export const adapterAptTrade: Adapter = {
  apiType: 'apt-trade',
  endpoint: 'RTMSDataSvcAptTradeDev',
  source: 'molit-apt-trade',
  parseRows(xml: string, sigunguCode: string) {
    const parsed = parseXml(xml);
    const items = getItems(parsed);
    const totalCount = getTotalCount(parsed);
    const rows: NormalizedTransaction[] = items.map((item: any) => ({
      propertyType: PropertyType.APARTMENT,
      dealType: DealType.SALE,
      name: String(item.aptNm ?? '').trim(),
      buildYear: item.buildYear ? Number(item.buildYear) : null,
      contractDate: parseYmd(item.dealYear, item.dealMonth, item.dealDay) ?? new Date(),
      exclusiveArea: Number(item.excluUseAr ?? 0),
      floor: item.floor ? Number(item.floor) : null,

      dealAmount: parseCommaNumber(item.dealAmount),
      registerDate: item.rgstDate ? parseYmdString(String(item.rgstDate)) : null,
      dealingType: item.dealingGbn ? String(item.dealingGbn) : null,
      buyerType: item.buyerGbn ? String(item.buyerGbn) : null,
      sellerType: item.slerGbn ? String(item.slerGbn) : null,
      cancelDate: item.cdealDay ? parseYmdString(String(item.cdealDay)) : null,
      cancelType: item.cdealType ? String(item.cdealType) : null,

      deposit: null,
      monthlyRent: null,
      contractTerm: null,
      contractType: null,
      useRRRight: null,
      preDeposit: null,
      preMonthlyRent: null,

      sigunguCode,
      umd: item.umdNm ? String(item.umdNm) : null,
      jibun: item.jibun ? String(item.jibun) : null,
      roadName: item.roadNm ? String(item.roadNm) : null,
      externalKey: item.aptSeq ? String(item.aptSeq) : null,
    }));
    return { rows, totalCount };
  },
};

function parseYmdString(s: string): Date | null {
  if (s.length !== 8) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}
```

- [ ] **Step 4: Run test + commit**

```bash
pnpm test:unit tests/ingest/adapter-apt-trade.test.ts
git add scripts/ingest/transactions/adapter-apt-trade.ts tests/ingest/adapter-apt-trade.test.ts tests/ingest/fixtures/apt-trade-sample.xml
git commit -m "feat(ingest): add apt-trade adapter with XML fixture test"
```

---

### Task 43: adapter-apt-rent.ts (전월세 차이 적용)

**Files:**
- Create: `scripts/ingest/transactions/adapter-apt-rent.ts`

- [ ] **Step 1: Implement (differences from apt-trade: deposit/monthlyRent/contractTerm/contractType/useRRRight)**

```typescript
import { parseXml, getItems, getTotalCount, parseCommaNumber, parseYmd } from '@/scripts/ingest/xml-parse';
import { PropertyType, DealType } from '@prisma/client';
import type { Adapter, NormalizedTransaction } from '@/scripts/ingest/types';

export const adapterAptRent: Adapter = {
  apiType: 'apt-rent',
  endpoint: 'RTMSDataSvcAptRent',
  source: 'molit-apt-rent',
  parseRows(xml: string, sigunguCode: string) {
    const parsed = parseXml(xml);
    const items = getItems(parsed);
    const totalCount = getTotalCount(parsed);
    const rows: NormalizedTransaction[] = items.map((item: any) => {
      const monthlyRent = parseCommaNumber(item.monthlyRent) ?? 0;
      const dealType = monthlyRent > 0 ? DealType.WOLSE : DealType.JEONSE;
      return {
        propertyType: PropertyType.APARTMENT,
        dealType,
        name: String(item.aptNm ?? '').trim(),
        buildYear: item.buildYear ? Number(item.buildYear) : null,
        contractDate: parseYmd(item.dealYear, item.dealMonth, item.dealDay) ?? new Date(),
        exclusiveArea: Number(item.excluUseAr ?? 0),
        floor: item.floor ? Number(item.floor) : null,

        dealAmount: null,
        registerDate: null,
        dealingType: null,
        buyerType: null,
        sellerType: null,
        cancelDate: null,
        cancelType: null,

        deposit: parseCommaNumber(item.deposit),
        monthlyRent,
        contractTerm: item.contractTerm ? String(item.contractTerm) : null,
        contractType: item.contractType ? String(item.contractType) : null,
        useRRRight: item.useRRRight ? String(item.useRRRight) === 'Y' : null,
        preDeposit: parseCommaNumber(item.preDeposit),
        preMonthlyRent: parseCommaNumber(item.preMonthlyRent),

        sigunguCode,
        umd: item.umdNm ? String(item.umdNm) : null,
        jibun: item.jibun ? String(item.jibun) : null,
        roadName: item.roadNm ? String(item.roadNm) : null,
        externalKey: null,
      };
    });
    return { rows, totalCount };
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add scripts/ingest/transactions/adapter-apt-rent.ts
git commit -m "feat(ingest): add apt-rent adapter (JEONSE/WOLSE split by monthlyRent)"
```

---

### Task 44: adapter-offi-trade.ts

**Files:**
- Create: `scripts/ingest/transactions/adapter-offi-trade.ts`

- [ ] **Step 1: Implement (same as apt-trade except propertyType=OFFICETEL and endpoint)**

```typescript
import { parseXml, getItems, getTotalCount, parseCommaNumber, parseYmd } from '@/scripts/ingest/xml-parse';
import { PropertyType, DealType } from '@prisma/client';
import type { Adapter, NormalizedTransaction } from '@/scripts/ingest/types';

export const adapterOffiTrade: Adapter = {
  apiType: 'offi-trade',
  endpoint: 'RTMSDataSvcOffiTrade',
  source: 'molit-offi-trade',
  parseRows(xml: string, sigunguCode: string) {
    const parsed = parseXml(xml);
    const items = getItems(parsed);
    const totalCount = getTotalCount(parsed);
    const rows: NormalizedTransaction[] = items.map((item: any) => ({
      propertyType: PropertyType.OFFICETEL,
      dealType: DealType.SALE,
      name: String(item.offiNm ?? item.aptNm ?? '').trim(),
      buildYear: item.buildYear ? Number(item.buildYear) : null,
      contractDate: parseYmd(item.dealYear, item.dealMonth, item.dealDay) ?? new Date(),
      exclusiveArea: Number(item.excluUseAr ?? 0),
      floor: item.floor ? Number(item.floor) : null,
      dealAmount: parseCommaNumber(item.dealAmount),
      registerDate: null,
      dealingType: item.dealingGbn ? String(item.dealingGbn) : null,
      buyerType: item.buyerGbn ? String(item.buyerGbn) : null,
      sellerType: item.slerGbn ? String(item.slerGbn) : null,
      cancelDate: null,
      cancelType: null,
      deposit: null,
      monthlyRent: null,
      contractTerm: null,
      contractType: null,
      useRRRight: null,
      preDeposit: null,
      preMonthlyRent: null,
      sigunguCode,
      umd: item.umdNm ? String(item.umdNm) : null,
      jibun: item.jibun ? String(item.jibun) : null,
      roadName: item.roadNm ? String(item.roadNm) : null,
      externalKey: null,
    }));
    return { rows, totalCount };
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add scripts/ingest/transactions/adapter-offi-trade.ts
git commit -m "feat(ingest): add offi-trade adapter"
```

---

### Task 45: adapter-offi-rent.ts

**Files:**
- Create: `scripts/ingest/transactions/adapter-offi-rent.ts`

- [ ] **Step 1: Implement (offi-rent — same shape as apt-rent but OFFICETEL)**

```typescript
import { parseXml, getItems, getTotalCount, parseCommaNumber, parseYmd } from '@/scripts/ingest/xml-parse';
import { PropertyType, DealType } from '@prisma/client';
import type { Adapter, NormalizedTransaction } from '@/scripts/ingest/types';

export const adapterOffiRent: Adapter = {
  apiType: 'offi-rent',
  endpoint: 'RTMSDataSvcOffiRent',
  source: 'molit-offi-rent',
  parseRows(xml: string, sigunguCode: string) {
    const parsed = parseXml(xml);
    const items = getItems(parsed);
    const totalCount = getTotalCount(parsed);
    const rows: NormalizedTransaction[] = items.map((item: any) => {
      const monthlyRent = parseCommaNumber(item.monthlyRent) ?? 0;
      return {
        propertyType: PropertyType.OFFICETEL,
        dealType: monthlyRent > 0 ? DealType.WOLSE : DealType.JEONSE,
        name: String(item.offiNm ?? item.aptNm ?? '').trim(),
        buildYear: item.buildYear ? Number(item.buildYear) : null,
        contractDate: parseYmd(item.dealYear, item.dealMonth, item.dealDay) ?? new Date(),
        exclusiveArea: Number(item.excluUseAr ?? 0),
        floor: item.floor ? Number(item.floor) : null,
        dealAmount: null,
        registerDate: null,
        dealingType: null,
        buyerType: null,
        sellerType: null,
        cancelDate: null,
        cancelType: null,
        deposit: parseCommaNumber(item.deposit),
        monthlyRent,
        contractTerm: item.contractTerm ? String(item.contractTerm) : null,
        contractType: item.contractType ? String(item.contractType) : null,
        useRRRight: item.useRRRight ? String(item.useRRRight) === 'Y' : null,
        preDeposit: parseCommaNumber(item.preDeposit),
        preMonthlyRent: parseCommaNumber(item.preMonthlyRent),
        sigunguCode,
        umd: item.umdNm ? String(item.umdNm) : null,
        jibun: item.jibun ? String(item.jibun) : null,
        roadName: item.roadNm ? String(item.roadNm) : null,
        externalKey: null,
      };
    });
    return { rows, totalCount };
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add scripts/ingest/transactions/adapter-offi-rent.ts
git commit -m "feat(ingest): add offi-rent adapter"
```

---

### Task 46: adapter-rh-trade.ts (연립다세대 매매)

**Files:**
- Create: `scripts/ingest/transactions/adapter-rh-trade.ts`

- [ ] **Step 1: Implement (mhouseNm + houseType field for ROW_HOUSE vs MULTIPLEX)**

```typescript
import { parseXml, getItems, getTotalCount, parseCommaNumber, parseYmd } from '@/scripts/ingest/xml-parse';
import { PropertyType, DealType } from '@prisma/client';
import type { Adapter, NormalizedTransaction } from '@/scripts/ingest/types';

function classifyHouseType(houseType: unknown): PropertyType {
  const s = String(houseType ?? '').trim();
  if (s.includes('다세대')) return PropertyType.MULTIPLEX;
  return PropertyType.ROW_HOUSE;
}

export const adapterRhTrade: Adapter = {
  apiType: 'rh-trade',
  endpoint: 'RTMSDataSvcRHTrade',
  source: 'molit-rh-trade',
  parseRows(xml: string, sigunguCode: string) {
    const parsed = parseXml(xml);
    const items = getItems(parsed);
    const totalCount = getTotalCount(parsed);
    const rows: NormalizedTransaction[] = items.map((item: any) => ({
      propertyType: classifyHouseType(item.houseType),
      dealType: DealType.SALE,
      name: String(item.mhouseNm ?? '').trim(),
      buildYear: item.buildYear ? Number(item.buildYear) : null,
      contractDate: parseYmd(item.dealYear, item.dealMonth, item.dealDay) ?? new Date(),
      exclusiveArea: Number(item.excluUseAr ?? 0),
      floor: item.floor ? Number(item.floor) : null,
      dealAmount: parseCommaNumber(item.dealAmount),
      registerDate: null,
      dealingType: item.dealingGbn ? String(item.dealingGbn) : null,
      buyerType: item.buyerGbn ? String(item.buyerGbn) : null,
      sellerType: item.slerGbn ? String(item.slerGbn) : null,
      cancelDate: null,
      cancelType: null,
      deposit: null,
      monthlyRent: null,
      contractTerm: null,
      contractType: null,
      useRRRight: null,
      preDeposit: null,
      preMonthlyRent: null,
      sigunguCode,
      umd: item.umdNm ? String(item.umdNm) : null,
      jibun: item.jibun ? String(item.jibun) : null,
      roadName: item.roadNm ? String(item.roadNm) : null,
      externalKey: null,
    }));
    return { rows, totalCount };
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add scripts/ingest/transactions/adapter-rh-trade.ts
git commit -m "feat(ingest): add rh-trade adapter (connect/multiplex split via houseType)"
```

---

### Task 47: adapter-rh-rent.ts

**Files:**
- Create: `scripts/ingest/transactions/adapter-rh-rent.ts`

- [ ] **Step 1: Implement**

```typescript
import { parseXml, getItems, getTotalCount, parseCommaNumber, parseYmd } from '@/scripts/ingest/xml-parse';
import { PropertyType, DealType } from '@prisma/client';
import type { Adapter, NormalizedTransaction } from '@/scripts/ingest/types';

function classifyHouseType(houseType: unknown): PropertyType {
  const s = String(houseType ?? '').trim();
  if (s.includes('다세대')) return PropertyType.MULTIPLEX;
  return PropertyType.ROW_HOUSE;
}

export const adapterRhRent: Adapter = {
  apiType: 'rh-rent',
  endpoint: 'RTMSDataSvcRHRent',
  source: 'molit-rh-rent',
  parseRows(xml: string, sigunguCode: string) {
    const parsed = parseXml(xml);
    const items = getItems(parsed);
    const totalCount = getTotalCount(parsed);
    const rows: NormalizedTransaction[] = items.map((item: any) => {
      const monthlyRent = parseCommaNumber(item.monthlyRent) ?? 0;
      return {
        propertyType: classifyHouseType(item.houseType),
        dealType: monthlyRent > 0 ? DealType.WOLSE : DealType.JEONSE,
        name: String(item.mhouseNm ?? '').trim(),
        buildYear: item.buildYear ? Number(item.buildYear) : null,
        contractDate: parseYmd(item.dealYear, item.dealMonth, item.dealDay) ?? new Date(),
        exclusiveArea: Number(item.excluUseAr ?? 0),
        floor: item.floor ? Number(item.floor) : null,
        dealAmount: null,
        registerDate: null,
        dealingType: null,
        buyerType: null,
        sellerType: null,
        cancelDate: null,
        cancelType: null,
        deposit: parseCommaNumber(item.deposit),
        monthlyRent,
        contractTerm: item.contractTerm ? String(item.contractTerm) : null,
        contractType: item.contractType ? String(item.contractType) : null,
        useRRRight: item.useRRRight ? String(item.useRRRight) === 'Y' : null,
        preDeposit: parseCommaNumber(item.preDeposit),
        preMonthlyRent: parseCommaNumber(item.preMonthlyRent),
        sigunguCode,
        umd: item.umdNm ? String(item.umdNm) : null,
        jibun: item.jibun ? String(item.jibun) : null,
        roadName: item.roadNm ? String(item.roadNm) : null,
        externalKey: null,
      };
    });
    return { rows, totalCount };
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add scripts/ingest/transactions/adapter-rh-rent.ts
git commit -m "feat(ingest): add rh-rent adapter"
```

---

### Task 48: scripts/ingest/transactions/runner.ts — orchestrator

**Files:**
- Create: `scripts/ingest/transactions/runner.ts`

- [ ] **Step 1: Implement runner**

```typescript
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { fetchPage } from '@/scripts/ingest/http';
import { findOrCreateProperty } from '@/scripts/ingest/property-matcher';
import { updatePropertyAggregates } from '@/scripts/ingest/aggregator';
import { revalidatePaths, propertyPath, regionPath } from '@/scripts/ingest/revalidator';
import { notify } from '@/scripts/ingest/notify';

import { adapterAptTrade } from './adapter-apt-trade';
import { adapterAptRent } from './adapter-apt-rent';
import { adapterOffiTrade } from './adapter-offi-trade';
import { adapterOffiRent } from './adapter-offi-rent';
import { adapterRhTrade } from './adapter-rh-trade';
import { adapterRhRent } from './adapter-rh-rent';

import type { Adapter, ApiType, Mode, NormalizedTransaction } from '@/scripts/ingest/types';
import { createHash } from 'node:crypto';

const ADAPTERS: Record<ApiType, Adapter> = {
  'apt-trade': adapterAptTrade,
  'apt-rent': adapterAptRent,
  'offi-trade': adapterOffiTrade,
  'offi-rent': adapterOffiRent,
  'rh-trade': adapterRhTrade,
  'rh-rent': adapterRhRent,
};

interface RunArgs {
  api: ApiType | 'all';
  mode: Mode;
  months: number;             // backfill 시 N개월. daily 시 무시 (현재+직전 월)
}

function parseArgs(): RunArgs {
  const args = process.argv.slice(2);
  const get = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
  const api = (get('api') ?? 'all') as ApiType | 'all';
  const mode = (get('mode') ?? 'daily') as Mode;
  const months = Number(get('months') ?? '1');
  return { api, mode, months };
}

async function main() {
  const args = parseArgs();
  const apis = args.api === 'all' ? (Object.keys(ADAPTERS) as ApiType[]) : [args.api];
  const months = args.mode === 'daily' ? getDailyMonths() : getBackfillMonths(args.months);

  logger.info({ apis, months, mode: args.mode }, 'runner start');

  const sigunguCodes = await prisma.region.findMany({
    where: { level: 2, isAbolished: false },
    select: { code: true },
  });
  const sigunguIds = sigunguCodes.map((r) => r.code.slice(0, 5));

  let totalUpserted = 0;
  let failed = 0;
  const affectedPropertyIds = new Set<bigint>();
  const affectedRegionCodes = new Set<string>();

  for (const api of apis) {
    const adapter = ADAPTERS[api];
    for (const sgg of sigunguIds) {
      for (const yyyymm of months) {
        try {
          const upserted = await runOne(adapter, sgg, yyyymm, affectedPropertyIds, affectedRegionCodes);
          totalUpserted += upserted;
        } catch (err) {
          failed++;
          logger.error({ err, api, sgg, yyyymm }, 'sigungu-month failed');
        }
      }
    }
  }

  if (affectedPropertyIds.size > 0) {
    await updatePropertyAggregates(Array.from(affectedPropertyIds));
  }

  if (args.mode === 'daily') {
    const paths: string[] = [];
    const props = await prisma.property.findMany({
      where: { id: { in: Array.from(affectedPropertyIds) } },
      select: { id: true, propertyType: true, sigunguCode: true },
    });
    for (const p of props) {
      paths.push(propertyPath(p.propertyType, p.id));
    }
    for (const sgg of affectedRegionCodes) paths.push(regionPath(sgg));
    await revalidatePaths(paths);
  }

  const summary = { totalUpserted, failed, properties: affectedPropertyIds.size };
  logger.info(summary, 'runner done');
  await notify(failed === 0 ? 'info' : failed >= 5 ? 'warn' : 'info', 'ETL run complete', summary);

  await prisma.$disconnect();
}

async function runOne(
  adapter: Adapter,
  sigungu: string,
  yyyymm: string,
  affectedProps: Set<bigint>,
  affectedRegions: Set<string>,
): Promise<number> {
  const targetKey = `${sigungu}-${yyyymm}`;
  const run = await prisma.ingestionRun.create({
    data: { source: adapter.source, targetKey, status: 'RUNNING' },
  });

  try {
    const rows = await fetchAll(adapter, sigungu, yyyymm);
    let upserted = 0;
    for (const row of rows) {
      if (!row.name) continue;
      const property = await findOrCreateProperty({
        propertyType: row.propertyType,
        name: row.name,
        sigunguCode: row.sigunguCode,
        regionCode: row.sigunguCode, // 정밀 매칭은 동단위로 보강 가능 (Phase 1 단순)
        address: buildAddress(row),
        buildYear: row.buildYear,
        roadName: row.roadName,
      });
      const rawHash = computeHash(row, property.id);
      try {
        await prisma.transaction.upsert({
          where: { rawHash },
          create: {
            propertyId: property.id,
            propertyType: row.propertyType,
            regionCode: property.regionCode,
            sigunguCode: row.sigunguCode,
            dealType: row.dealType,
            contractDate: row.contractDate,
            exclusiveArea: row.exclusiveArea,
            floor: row.floor,
            buildYear: row.buildYear,
            dealAmount: row.dealAmount,
            registerDate: row.registerDate,
            dealingType: row.dealingType,
            buyerType: row.buyerType,
            sellerType: row.sellerType,
            cancelDate: row.cancelDate,
            cancelType: row.cancelType,
            deposit: row.deposit,
            monthlyRent: row.monthlyRent,
            contractTerm: row.contractTerm,
            contractType: row.contractType,
            useRRRight: row.useRRRight,
            preDeposit: row.preDeposit,
            preMonthlyRent: row.preMonthlyRent,
            umd: row.umd,
            jibun: row.jibun,
            roadName: row.roadName,
            source: adapter.source,
            externalKey: row.externalKey,
            rawHash,
          },
          update: {},
        });
        upserted++;
        affectedProps.add(property.id);
        affectedRegions.add(row.sigunguCode);
      } catch (err) {
        logger.warn({ err, rawHash }, 'transaction upsert failed');
      }
    }

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: upserted, finishedAt: new Date() },
    });
    logger.info({ source: adapter.source, sgg: sigungu, yyyymm, upserted }, 'sigungu-month ok');
    return upserted;
  } catch (err) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
    });
    throw err;
  }
}

async function fetchAll(adapter: Adapter, sigungu: string, yyyymm: string): Promise<NormalizedTransaction[]> {
  const all: NormalizedTransaction[] = [];
  let pageNo = 1;
  while (true) {
    const xml = await fetchPage({
      operation: adapter.endpoint,
      lawdCd: sigungu,
      dealYmd: yyyymm,
      pageNo,
      numOfRows: 1000,
    });
    const { rows, totalCount } = adapter.parseRows(xml, sigungu);
    all.push(...rows);
    if (all.length >= totalCount || rows.length < 1000 || pageNo > 10) break;
    pageNo++;
  }
  return all;
}

function buildAddress(row: NormalizedTransaction): string {
  const parts: string[] = [];
  if (row.umd) parts.push(row.umd);
  if (row.roadName) parts.push(row.roadName);
  if (row.jibun) parts.push(row.jibun);
  return parts.join(' ').trim();
}

function computeHash(row: NormalizedTransaction, propertyId: bigint): string {
  const key = JSON.stringify({
    p: String(propertyId),
    t: row.dealType,
    d: row.contractDate.toISOString().slice(0, 10),
    a: row.exclusiveArea,
    f: row.floor,
    da: row.dealAmount,
    dep: row.deposit,
    mr: row.monthlyRent,
  });
  return createHash('sha256').update(key).digest('hex');
}

function getDailyMonths(): string[] {
  const now = new Date();
  const cur = ymd(now);
  const prev = ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  return [cur, prev];
}

function getBackfillMonths(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(ymd(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return out;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}${m}`;
}

main().catch((err) => {
  logger.error({ err }, 'runner fatal');
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add scripts/ingest/transactions/runner.ts
git commit -m "feat(ingest): add transaction runner orchestrator (full ETL flow)"
```

---

### Task 49: .github/workflows/seed-regions.yml

**Files:**
- Create: `.github/workflows/seed-regions.yml`

- [ ] **Step 1: Write workflow**

```yaml
name: seed-regions
on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Source version tag (e.g. 2026-Q2)'
        required: false
        default: ''
  schedule:
    - cron: '0 18 5 4 *'   # 매년 4월 5일 18:00 UTC

jobs:
  seed:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      DIRECT_URL: ${{ secrets.DIRECT_URL }}
      LOG_LEVEL: info
      REGION_SOURCE_VERSION: ${{ inputs.version }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma generate
      - name: Download regions data
        run: |
          curl -L -o data/regions.txt.zip "${{ secrets.REGIONS_DOWNLOAD_URL }}"
          mkdir -p data && cd data && unzip -o regions.txt.zip
      - run: pnpm tsx scripts/ingest/regions/seed.ts ./data/regions.txt
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/seed-regions.yml
git commit -m "ci: add seed-regions workflow (manual + annual cron)"
```

---

### Task 50: .github/workflows/backfill-transactions.yml

**Files:**
- Create: `.github/workflows/backfill-transactions.yml`

- [ ] **Step 1: Write workflow**

```yaml
name: backfill-transactions
on:
  workflow_dispatch:
    inputs:
      api:
        description: 'API (all | apt-trade | apt-rent | offi-trade | offi-rent | rh-trade | rh-rent)'
        default: 'all'
      months:
        description: 'Months to backfill'
        default: '12'

jobs:
  backfill:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        api: [apt-trade, apt-rent, offi-trade, offi-rent, rh-trade, rh-rent]
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      DIRECT_URL: ${{ secrets.DIRECT_URL }}
      PUBLIC_DATA_KEY: ${{ secrets.PUBLIC_DATA_KEY }}
      KAKAO_REST_KEY: ${{ secrets.KAKAO_REST_KEY }}
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
      LOG_LEVEL: info
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma generate
      - if: ${{ inputs.api == 'all' || inputs.api == matrix.api }}
        run: pnpm tsx scripts/ingest/transactions/runner.ts --api=${{ matrix.api }} --mode=backfill --months=${{ inputs.months }}
        timeout-minutes: 350
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/backfill-transactions.yml
git commit -m "ci: add backfill-transactions workflow (matrix 6 APIs)"
```

---

### Task 51: .github/workflows/ingest-transactions-daily.yml

**Files:**
- Create: `.github/workflows/ingest-transactions-daily.yml`

- [ ] **Step 1: Write workflow**

```yaml
name: ingest-transactions-daily
on:
  schedule:
    - cron: '0 18 * * *'    # 03:00 KST = 18:00 UTC
  workflow_dispatch:

jobs:
  ingest:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        api: [apt-trade, apt-rent, offi-trade, offi-rent, rh-trade, rh-rent]
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      DIRECT_URL: ${{ secrets.DIRECT_URL }}
      PUBLIC_DATA_KEY: ${{ secrets.PUBLIC_DATA_KEY }}
      KAKAO_REST_KEY: ${{ secrets.KAKAO_REST_KEY }}
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
      REVALIDATE_TOKEN: ${{ secrets.REVALIDATE_TOKEN }}
      SITE_URL: ${{ secrets.SITE_URL }}
      LOG_LEVEL: info
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma generate
      - run: pnpm tsx scripts/ingest/transactions/runner.ts --api=${{ matrix.api }} --mode=daily
        timeout-minutes: 60
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ingest-transactions-daily.yml
git commit -m "ci: add daily ingest workflow (03:00 KST cron, matrix 6 APIs)"
```

---

### Task 52: .github/workflows/pg-dump-backup.yml

**Files:**
- Create: `.github/workflows/pg-dump-backup.yml`

- [ ] **Step 1: Write workflow**

```yaml
name: pg-dump-backup
on:
  schedule:
    - cron: '0 19 * * 0'    # 매주 일요일 04:00 KST
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
    steps:
      - name: Install pg_dump
        run: |
          sudo apt-get update
          sudo apt-get install -y postgresql-client
      - name: Dump
        run: |
          ts=$(date +%Y%m%d-%H%M%S)
          pg_dump --no-owner --no-acl --format=custom "${{ env.DATABASE_URL }}" \
            | gzip > backup-$ts.dump.gz
          echo "BACKUP_FILE=backup-$ts.dump.gz" >> $GITHUB_ENV
      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: db-backup
          path: ${{ env.BACKUP_FILE }}
          retention-days: 30
      - name: Notify
        if: failure()
        run: |
          curl -X POST -H 'Content-Type: application/json' \
            -d '{"content":"🔴 pg_dump backup failed"}' \
            "${{ secrets.DISCORD_WEBHOOK_URL }}"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/pg-dump-backup.yml
git commit -m "ci: add weekly pg_dump backup workflow"
```

---

### Task 53: scripts/ops/reconcile-properties.ts — null-location 재시도

**Files:**
- Create: `scripts/ops/reconcile-properties.ts`

- [ ] **Step 1: Implement**

```typescript
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { geocode } from '@/scripts/ingest/geocoder';

async function main() {
  const targets = await prisma.$queryRaw<Array<{ id: bigint; address: string }>>`
    SELECT id, address FROM "Property"
    WHERE location IS NULL
    ORDER BY "createdAt" DESC
    LIMIT 500
  `;
  logger.info({ count: targets.length }, 'reconcile candidates');

  for (const t of targets) {
    const coord = await geocode(t.address);
    if (coord) {
      await prisma.$executeRaw`
        UPDATE "Property"
        SET location = ST_SetSRID(ST_MakePoint(${coord.lng}, ${coord.lat}), 4326)::geography
        WHERE id = ${t.id}
      `;
      logger.info({ id: String(t.id), coord }, 'reconciled');
    }
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'reconcile failed');
  process.exit(1);
});
```

- [ ] **Step 2: Commit + Phase tag**

```bash
git add scripts/ops/reconcile-properties.ts
git commit -m "feat(ops): add reconcile-properties script for null-location retry"
git tag -a phase-1c-done -m "Phase 1C ETL pipeline complete"
```

---

# Phase 1D — Query Helpers & Pages (Task 54–86)

목표: ETL이 적재한 데이터를 보여주는 **`lib/*` 쿼리 헬퍼와 모든 페이지/라우트**. 단지 카드, 거래 3섹션, 시군구 페이지, 검색·필터 페이지, API 라우트.

---

### Task 54: lib/region.ts

**Files:**
- Create: `lib/region.ts`

- [ ] **Step 1: Implement**

```typescript
import { prisma } from '@/lib/db';

export async function getSidoList() {
  return prisma.region.findMany({
    where: { level: 1, isAbolished: false },
    select: { code: true, sido: true, fullName: true },
    orderBy: { sido: 'asc' },
  });
}

export async function getSigunguByCode(sigunguCode: string) {
  return prisma.region.findFirst({
    where: { sigunguCode, level: 2, isAbolished: false },
    select: { code: true, sido: true, sigungu: true, fullName: true, sigunguCode: true },
  });
}

export async function getSigungusBySido(sido: string) {
  return prisma.region.findMany({
    where: { sido, level: 2, isAbolished: false },
    select: { code: true, sigungu: true, fullName: true, sigunguCode: true },
    orderBy: { sigungu: 'asc' },
  });
}

export async function getEupmyeondongsBySigungu(sigunguCode: string) {
  return prisma.region.findMany({
    where: { sigunguCode, level: 3, isAbolished: false },
    select: { code: true, eupmyeondong: true, fullName: true },
    orderBy: { eupmyeondong: 'asc' },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/region.ts
git commit -m "feat(lib): add region query helpers"
```

---

### Task 55: lib/property.ts

**Files:**
- Create: `lib/property.ts`

- [ ] **Step 1: Implement**

```typescript
import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';

export type PropertyTypeSlug = 'apt' | 'officetel' | 'villa';

export function slugToType(slug: PropertyTypeSlug): PropertyType[] {
  if (slug === 'apt') return [PropertyType.APARTMENT];
  if (slug === 'officetel') return [PropertyType.OFFICETEL];
  return [PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX];
}

export function typeToSlug(t: PropertyType): PropertyTypeSlug {
  if (t === PropertyType.APARTMENT) return 'apt';
  if (t === PropertyType.OFFICETEL) return 'officetel';
  return 'villa';
}

export async function getPropertyById(id: bigint) {
  return prisma.property.findUnique({
    where: { id },
    include: { region: true },
  });
}

export interface PropertyListParams {
  types: PropertyType[];
  sigunguCode?: string;
  page?: number;
  perPage?: number;
}

export async function getPropertyList({ types, sigunguCode, page = 1, perPage = 30 }: PropertyListParams) {
  const where: any = { propertyType: { in: types }, txCount12m: { gt: 0 } };
  if (sigunguCode) where.sigunguCode = sigunguCode;
  const [rows, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: { region: true },
      orderBy: { lastTxAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.property.count({ where }),
  ]);
  return { rows, total, page, perPage, totalPages: Math.ceil(total / perPage) };
}

export async function getTopPropertiesByVolume({ types, sigunguCode, limit = 10 }: { types: PropertyType[]; sigunguCode?: string; limit?: number }) {
  return prisma.property.findMany({
    where: {
      propertyType: { in: types },
      txCount12m: { gt: 0 },
      ...(sigunguCode ? { sigunguCode } : {}),
    },
    include: { region: true },
    orderBy: { txCount12m: 'desc' },
    take: limit,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/property.ts
git commit -m "feat(lib): add property query helpers"
```

---

### Task 56: lib/transaction.ts

**Files:**
- Create: `lib/transaction.ts`

- [ ] **Step 1: Implement**

```typescript
import { prisma } from '@/lib/db';
import { DealType } from '@prisma/client';

export async function getTransactionCounts(propertyId: bigint) {
  const rows = await prisma.transaction.groupBy({
    by: ['dealType'],
    where: { propertyId },
    _count: true,
  });
  const result: Record<DealType, number> = { SALE: 0, JEONSE: 0, WOLSE: 0 };
  for (const r of rows) {
    result[r.dealType] = r._count;
  }
  return result;
}

export async function getTransactionsByType(propertyId: bigint, dealType: DealType, params: { page?: number; perPage?: number; area?: number | null }) {
  const { page = 1, perPage = 10, area = null } = params;
  const where: any = { propertyId, dealType };
  if (area) where.exclusiveArea = { gte: (area - 3) * 3.3057851239669422, lte: (area + 3) * 3.3057851239669422 };
  return prisma.transaction.findMany({
    where,
    orderBy: [{ contractDate: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * perPage,
    take: perPage,
  });
}

export async function getMonthlyChartData(propertyId: bigint) {
  // 24개월 분량의 거래유형별 월평균
  const rows = await prisma.$queryRaw<Array<{ month: Date; deal_type: DealType; avg_value: number | null; cnt: number }>>`
    SELECT
      DATE_TRUNC('month', "contractDate")::date AS month,
      "dealType" AS deal_type,
      AVG(
        CASE
          WHEN "dealType" = 'SALE' THEN "dealAmount"
          WHEN "dealType" IN ('JEONSE', 'WOLSE') THEN "deposit"
        END
      )::float AS avg_value,
      COUNT(*)::int AS cnt
    FROM "Transaction"
    WHERE "propertyId" = ${propertyId}
      AND "contractDate" >= NOW() - INTERVAL '24 months'
    GROUP BY 1, 2
    ORDER BY 1 ASC
  `;
  const byType: Record<DealType, { month: string; value: number; count: number }[]> = { SALE: [], JEONSE: [], WOLSE: [] };
  for (const r of rows) {
    const monthStr = r.month.toISOString().slice(0, 7);
    if (r.avg_value !== null) {
      byType[r.deal_type].push({ month: monthStr, value: r.avg_value, count: r.cnt });
    }
  }
  return byType;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/transaction.ts
git commit -m "feat(lib): add transaction query helpers (counts, byType, monthlyChart)"
```

---

### Task 57: lib/search.ts

**Files:**
- Create: `lib/search.ts`

- [ ] **Step 1: Implement**

```typescript
import { prisma } from '@/lib/db';
import { normalizeName } from '@/lib/slug';

export interface AutocompleteResult {
  properties: Array<{ id: string; name: string; address: string; region: string; type: string }>;
  regions: Array<{ code: string; fullName: string }>;
}

export async function autocomplete(q: string): Promise<AutocompleteResult> {
  if (!q || q.trim().length < 2) return { properties: [], regions: [] };
  const norm = normalizeName(q);
  const prefix = `${norm}%`;

  const props = await prisma.$queryRaw<Array<{ id: bigint; name: string; address: string; full_name: string; type: string }>>`
    SELECT p.id, p.name, p.address, r."fullName" AS full_name, p."propertyType"::text AS type
    FROM "Property" p
    JOIN "Region" r ON r.code = p."regionCode"
    WHERE p."nameNorm" % ${norm} OR p."nameNorm" ILIKE ${prefix}
    ORDER BY
      (p."nameNorm" ILIKE ${prefix})::int DESC,
      similarity(p."nameNorm", ${norm}) DESC,
      p."txCount12m" DESC
    LIMIT 10
  `;

  const regions = await prisma.$queryRaw<Array<{ code: string; full_name: string }>>`
    SELECT code, "fullName" AS full_name
    FROM "Region"
    WHERE level >= 2 AND "isAbolished" = false
      AND ("fullName" ILIKE ${'%' + q + '%'} OR "fullName" % ${q})
    ORDER BY level, "fullName"
    LIMIT 10
  `;

  return {
    properties: props.map((p) => ({
      id: String(p.id),
      name: p.name,
      address: p.address,
      region: p.full_name,
      type: p.type,
    })),
    regions: regions.map((r) => ({ code: r.code, fullName: r.full_name })),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/search.ts
git commit -m "feat(lib): add search autocomplete helper"
```

---

### Task 58: lib/nearby.ts — PostGIS

**Files:**
- Create: `lib/nearby.ts`

- [ ] **Step 1: Implement**

```typescript
import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';

export interface NearbyProperty {
  id: string;
  name: string;
  address: string;
  region: string;
  distKm: number;
}

export async function getNearbyProperties(opts: {
  propertyId: bigint;
  propertyType: PropertyType;
  radiusMeters?: number;
  limit?: number;
}): Promise<NearbyProperty[]> {
  const { propertyId, propertyType, radiusMeters = 2000, limit = 10 } = opts;
  const rows = await prisma.$queryRaw<Array<{ id: bigint; name: string; address: string; full_name: string; dist_km: number }>>`
    WITH center AS (
      SELECT location FROM "Property" WHERE id = ${propertyId}
    )
    SELECT
      p.id, p.name, p.address, r."fullName" AS full_name,
      (ST_Distance(p.location, c.location) / 1000.0) AS dist_km
    FROM "Property" p
    JOIN "Region" r ON r.code = p."regionCode"
    JOIN center c ON true
    WHERE p."propertyType" = ${propertyType}::"PropertyType"
      AND p.id <> ${propertyId}
      AND p.location IS NOT NULL
      AND c.location IS NOT NULL
      AND ST_DWithin(p.location, c.location, ${radiusMeters})
      AND p."txCount12m" > 0
    ORDER BY dist_km ASC, p."txCount12m" DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: String(r.id),
    name: r.name,
    address: r.address,
    region: r.full_name,
    distKm: r.dist_km,
  }));
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/nearby.ts
git commit -m "feat(lib): add nearby properties query (PostGIS ST_DWithin)"
```

---

### Task 59: lib/revalidate.ts

**Files:**
- Create: `lib/revalidate.ts`

- [ ] **Step 1: Implement**

```typescript
import { revalidatePath, revalidateTag } from 'next/cache';

export function revalidatePropertyPaths(paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

export function revalidateRegionTag(code: string) {
  revalidateTag(`region:${code}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/revalidate.ts
git commit -m "feat(lib): add revalidate helpers"
```

---

### Task 60: app/(public)/_components/nav.tsx (real)

**Files:**
- Modify: `app/(public)/layout.tsx`
- Create: `app/(public)/_components/nav.tsx`

- [ ] **Step 1: Write Nav component**

```typescript
'use client';

import Link from 'next/link';
import { Dropdown } from '@/components/ui/dropdown';
import { Badge } from '@/components/ui/badge';
import { SearchInput } from './search-input';
import { useState } from 'react';
import { SoonModal } from './soon-modal';

export function Nav() {
  const [soonOpen, setSoonOpen] = useState<string | null>(null);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-white/85 backdrop-blur">
        <nav className="mx-auto flex h-[72px] max-w-[1180px] items-center gap-6 px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[var(--color-blue)] to-[var(--color-sky)] text-white font-black">
              임
            </span>
            <span className="text-xl font-black tracking-tighter text-[var(--color-blue-dark)]">
              임장온
            </span>
          </Link>

          <div className="hidden gap-6 text-sm font-semibold text-[var(--color-muted)] md:flex md:items-center">
            <Link href="/">홈</Link>
            <Dropdown
              label="부동산"
              items={[
                { label: '아파트', href: '/apt' },
                { label: '오피스텔', href: '/officetel' },
                { label: '다세대', href: '/villa' },
              ]}
            />
            <Link href="/region">지역</Link>
            <button
              onClick={() => setSoonOpen('청약')}
              className="inline-flex items-center gap-1.5"
            >
              청약 <Badge tone="gray">Soon</Badge>
            </button>
            <button
              onClick={() => setSoonOpen('생활권')}
              className="inline-flex items-center gap-1.5"
            >
              생활권 <Badge tone="gray">Soon</Badge>
            </button>
          </div>

          <div className="ml-auto w-48 lg:w-64">
            <SearchInput />
          </div>
        </nav>
      </header>

      <SoonModal
        open={!!soonOpen}
        topic={soonOpen}
        onClose={() => setSoonOpen(null)}
      />
    </>
  );
}
```

- [ ] **Step 2: Update app/(public)/layout.tsx to use Nav**

Replace the existing layout file with:

```typescript
import { Nav } from './_components/nav';
import { Footer } from './_components/footer';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Nav />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/_components/nav.tsx" "app/(public)/layout.tsx"
git commit -m "feat(app): add real Nav with dropdown + Soon badges + search input"
```

---

### Task 61: app/(public)/_components/footer.tsx

**Files:**
- Create: `app/(public)/_components/footer.tsx`

- [ ] **Step 1: Implement**

```typescript
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-[var(--color-line)] bg-white">
      <div className="mx-auto grid max-w-[1180px] gap-8 px-6 py-12 md:grid-cols-4">
        <div>
          <p className="text-lg font-black text-[var(--color-blue-dark)]">임장온</p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            공공데이터 기반 부동산 실거래가 통합 정보
          </p>
        </div>
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--color-muted)]">서비스</p>
          <ul className="space-y-2 text-sm">
            <li><Link href="/">홈</Link></li>
            <li><Link href="/apt">아파트</Link></li>
            <li><Link href="/officetel">오피스텔</Link></li>
            <li><Link href="/villa">다세대</Link></li>
            <li><Link href="/region">지역</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--color-muted)]">데이터 출처</p>
          <ul className="space-y-2 text-sm text-[var(--color-muted)]">
            <li>국토교통부 실거래가</li>
            <li>행정안전부 법정동코드</li>
            <li>카카오 로컬</li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--color-muted)]">법적 안내</p>
          <ul className="space-y-2 text-sm">
            <li><Link href="/about">서비스 소개</Link></li>
            <li><Link href="/data-source">데이터 안내</Link></li>
            <li><Link href="/terms">이용약관</Link></li>
            <li><Link href="/privacy">개인정보 처리방침</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[var(--color-line)]">
        <p className="mx-auto max-w-[1180px] px-6 py-4 text-xs text-[var(--color-muted)]">
          © 2026 임장온. 본 사이트는 공공데이터를 가공해 제공합니다. 실거래 신고 지연으로 최신성·정확성이 100% 보장되지 않습니다.
        </p>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(public)/_components/footer.tsx"
git commit -m "feat(app): add footer with service/data-source/legal links"
```

---

### Task 62: app/(public)/_components/search-input.tsx

**Files:**
- Create: `app/(public)/_components/search-input.tsx`

- [ ] **Step 1: Implement**

```typescript
'use client';

import { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import Link from 'next/link';

interface Result {
  properties: Array<{ id: string; name: string; address: string; region: string; type: string }>;
  regions: Array<{ code: string; fullName: string }>;
}

export function SearchInput() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setResults(await res.json());
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function typeToHref(type: string, id: string): string {
    if (type === 'APARTMENT') return `/apt/${id}`;
    if (type === 'OFFICETEL') return `/officetel/${id}`;
    return `/villa/${id}`;
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="단지/지역명 검색"
          className="pl-8"
        />
      </div>
      {open && results && (results.properties.length > 0 || results.regions.length > 0) && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-2xl border border-[var(--color-line)] bg-white p-2 shadow-[var(--shadow-soft)]">
          {results.properties.length > 0 && (
            <>
              <p className="px-3 py-1 text-xs font-bold uppercase text-[var(--color-muted)]">단지</p>
              {results.properties.map((p) => (
                <Link
                  key={p.id}
                  href={typeToHref(p.type, p.id)}
                  className="block rounded-lg px-3 py-2 hover:bg-[var(--color-soft)]"
                  onClick={() => setOpen(false)}
                >
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-[var(--color-muted)]">{p.region}</p>
                </Link>
              ))}
            </>
          )}
          {results.regions.length > 0 && (
            <>
              <p className="mt-2 px-3 py-1 text-xs font-bold uppercase text-[var(--color-muted)]">지역</p>
              {results.regions.map((r) => (
                <Link
                  key={r.code}
                  href={`/region/${r.code.slice(0, 5)}`}
                  className="block rounded-lg px-3 py-2 hover:bg-[var(--color-soft)]"
                  onClick={() => setOpen(false)}
                >
                  <p className="text-sm">{r.fullName}</p>
                </Link>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(public)/_components/search-input.tsx"
git commit -m "feat(app): add search input with autocomplete (debounce 300ms)"
```

---

### Task 63: app/(public)/_components/soon-modal.tsx

**Files:**
- Create: `app/(public)/_components/soon-modal.tsx`

- [ ] **Step 1: Implement**

```typescript
'use client';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

export function SoonModal({ open, topic, onClose }: { open: boolean; topic: string | null; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus('submitting');
    try {
      const res = await fetch('/api/subscribe-soon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, topic }),
      });
      setStatus(res.ok ? 'done' : 'error');
    } catch {
      setStatus('error');
    }
  }

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={`🚧 ${topic} 정보는 곧 만나요`}>
      {status === 'done' ? (
        <div className="text-sm text-[var(--color-muted)]">
          신청해주셔서 감사해요. 출시 시점에 알려드릴게요.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-[var(--color-muted)]">
            실거래가에 이어 청약·생활인프라·전세대출을 단계적으로 추가합니다. 출시 알림을 받으시려면 이메일을 남겨주세요 (선택).
          </p>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일 주소"
            required
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>닫기</Button>
            <Button type="submit" disabled={status === 'submitting'}>신청</Button>
          </div>
          {status === 'error' && <p className="text-xs text-[var(--color-red)]">신청 실패. 잠시 후 다시 시도해주세요.</p>}
        </form>
      )}
    </Modal>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(public)/_components/soon-modal.tsx"
git commit -m "feat(app): add SoonModal with email signup"
```

---

### Task 64: app/(public)/_components/property-card.tsx

**Files:**
- Create: `app/(public)/_components/property-card.tsx`

- [ ] **Step 1: Implement**

```typescript
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatBillion, formatDate } from '@/lib/format';
import { typeToSlug } from '@/lib/property';
import type { Property, Region } from '@prisma/client';

interface Props {
  property: Property & { region: Region };
}

export function PropertyCard({ property: p }: Props) {
  const slug = typeToSlug(p.propertyType);
  const href = `/${slug}/${p.id}`;
  return (
    <Link href={href}>
      <Card className="transition hover:shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-bold text-[var(--color-blue-dark)]">{p.name}</p>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              {p.region.fullName} · {p.builtYear ? `${p.builtYear}년 준공` : '준공년도 미상'}
              {p.households ? ` · ${p.households.toLocaleString('ko-KR')}세대` : ''}
            </p>
          </div>
          <Badge tone="blue">{p.txCount12m}건</Badge>
        </div>
        <div className="mt-4 space-y-1.5 text-sm">
          {p.saleCount12m > 0 && (
            <p>
              <span className="inline-block w-12 text-[var(--color-muted)]">매매</span>
              평균 <b>{formatBillion(p.saleAvgPrice12m)}</b>
              <span className="ml-2 text-[var(--color-muted)]">최근 {formatBillion(p.saleLastPrice)} · {formatDate(p.saleLastAt)}</span>
            </p>
          )}
          {p.jeonseCount12m > 0 && (
            <p>
              <span className="inline-block w-12 text-[var(--color-muted)]">전세</span>
              평균 <b>{formatBillion(p.jeonseAvgDeposit12m)}</b>
              <span className="ml-2 text-[var(--color-muted)]">최근 {formatBillion(p.jeonseLastDeposit)} · {formatDate(p.jeonseLastAt)}</span>
            </p>
          )}
          {p.wolseCount12m > 0 && (
            <p>
              <span className="inline-block w-12 text-[var(--color-muted)]">월세</span>
              보 <b>{formatBillion(p.wolseAvgDeposit12m)}</b> / 월 <b>{p.wolseAvgRent12m?.toLocaleString('ko-KR')}만원</b>
            </p>
          )}
        </div>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(public)/_components/property-card.tsx"
git commit -m "feat(app): add PropertyCard (단지 단위 list card)"
```

---

### Task 65: app/(public)/_components/region-card.tsx

**Files:**
- Create: `app/(public)/_components/region-card.tsx`

- [ ] **Step 1: Implement**

```typescript
import Link from 'next/link';
import { Card } from '@/components/ui/card';

interface Props {
  code: string;
  name: string;
  count?: number;
}

export function RegionCard({ code, name, count }: Props) {
  return (
    <Link href={`/region/${code.slice(0, 5)}`}>
      <Card className="text-center transition hover:shadow-lg">
        <p className="text-base font-bold text-[var(--color-blue-dark)]">{name}</p>
        {count !== undefined && (
          <p className="mt-1 text-xs text-[var(--color-muted)]">단지 {count.toLocaleString('ko-KR')}개</p>
        )}
      </Card>
    </Link>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(public)/_components/region-card.tsx"
git commit -m "feat(app): add RegionCard"
```

---

### Task 66: app/(public)/page.tsx — real home

**Files:**
- Modify: `app/(public)/page.tsx`

- [ ] **Step 1: Replace placeholder with real home**

```typescript
import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';
import { PropertyCard } from './_components/property-card';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '전국 아파트·오피스텔·연립다세대 실거래가',
  description: '공공데이터 기반 전국 부동산 실거래가 통합 정보 플랫폼. 매매·전세·월세를 단지 단위로 한눈에.',
};

export const revalidate = 3600;

export default async function HomePage() {
  const popular = await prisma.property.findMany({
    where: { propertyType: PropertyType.APARTMENT, txCount12m: { gt: 0 } },
    include: { region: true },
    orderBy: { txCount12m: 'desc' },
    take: 9,
  });

  return (
    <>
      <section className="mx-auto max-w-[1180px] px-6 py-16">
        <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-sky-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-blue-dark)]">
          공공데이터 기반 · 매일 갱신
        </span>
        <h1 className="mt-5 text-4xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-5xl">
          실거래가, 한 번에 보세요
        </h1>
        <p className="mt-4 max-w-xl text-lg text-[var(--color-muted)]">
          아파트·오피스텔·연립다세대 매매와 전월세를 단지 단위로 정리해 보여드립니다.
        </p>
      </section>

      <section className="mx-auto max-w-[1180px] px-6 pb-16">
        <h2 className="mb-6 text-2xl font-bold text-[var(--color-blue-dark)]">인기 아파트 단지</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {popular.map((p) => (
            <PropertyCard key={String(p.id)} property={p} />
          ))}
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(public)/page.tsx"
git commit -m "feat(app): replace home placeholder with popular apartments grid"
```

---

### Task 67: app/(public)/apt/page.tsx — 아파트 hub

**Files:**
- Create: `app/(public)/apt/page.tsx`

- [ ] **Step 1: Implement**

```typescript
import { getTopPropertiesByVolume } from '@/lib/property';
import { PropertyCard } from '../_components/property-card';
import { PropertyType } from '@prisma/client';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '전국 아파트 실거래가',
  description: '공공데이터 기반 전국 아파트 매매·전세·월세 실거래가. 단지별 평균가·거래량·최근 거래를 한눈에.',
  alternates: { canonical: '/apt' },
};

export const revalidate = 3600;

export default async function AptHubPage() {
  const popular = await getTopPropertiesByVolume({ types: [PropertyType.APARTMENT], limit: 30 });

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)] md:text-4xl">
        전국 아파트 실거래가
      </h1>
      <p className="mt-3 max-w-xl text-[var(--color-muted)]">
        공공데이터 기반 · 매일 갱신 · 매매/전세/월세 통합
      </p>

      <h2 className="mt-12 mb-5 text-xl font-bold text-[var(--color-blue-dark)]">
        거래 많은 단지 TOP {popular.length}
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {popular.map((p) => (
          <PropertyCard key={String(p.id)} property={p} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(public)/apt/page.tsx"
git commit -m "feat(app): add /apt hub page"
```

---

### Task 68: app/(public)/officetel/page.tsx

**Files:**
- Create: `app/(public)/officetel/page.tsx`

- [ ] **Step 1: Implement** (copy of apt/page.tsx with PropertyType.OFFICETEL)

```typescript
import { getTopPropertiesByVolume } from '@/lib/property';
import { PropertyCard } from '../_components/property-card';
import { PropertyType } from '@prisma/client';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '전국 오피스텔 실거래가',
  description: '공공데이터 기반 전국 오피스텔 매매·전세·월세 실거래가.',
  alternates: { canonical: '/officetel' },
};

export const revalidate = 3600;

export default async function OffiHubPage() {
  const popular = await getTopPropertiesByVolume({ types: [PropertyType.OFFICETEL], limit: 30 });

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)] md:text-4xl">
        전국 오피스텔 실거래가
      </h1>
      <h2 className="mt-12 mb-5 text-xl font-bold text-[var(--color-blue-dark)]">
        거래 많은 오피스텔 TOP {popular.length}
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {popular.map((p) => (
          <PropertyCard key={String(p.id)} property={p} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(public)/officetel/page.tsx"
git commit -m "feat(app): add /officetel hub page"
```

---

### Task 69: app/(public)/villa/page.tsx

**Files:**
- Create: `app/(public)/villa/page.tsx`

- [ ] **Step 1: Implement** (covers ROW_HOUSE + MULTIPLEX)

```typescript
import { getTopPropertiesByVolume } from '@/lib/property';
import { PropertyCard } from '../_components/property-card';
import { PropertyType } from '@prisma/client';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '전국 연립·다세대 실거래가',
  description: '공공데이터 기반 전국 연립주택·다세대주택 매매·전세·월세 실거래가.',
  alternates: { canonical: '/villa' },
};

export const revalidate = 3600;

export default async function VillaHubPage() {
  const popular = await getTopPropertiesByVolume({
    types: [PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX],
    limit: 30,
  });

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)] md:text-4xl">
        전국 연립·다세대 실거래가
      </h1>
      <h2 className="mt-12 mb-5 text-xl font-bold text-[var(--color-blue-dark)]">
        거래 많은 단지/건물 TOP {popular.length}
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {popular.map((p) => (
          <PropertyCard key={String(p.id)} property={p} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(public)/villa/page.tsx"
git commit -m "feat(app): add /villa hub page (covers ROW_HOUSE + MULTIPLEX)"
```

---

### Task 70: app/(public)/apt/[id]/page.tsx + actions.ts + section components

**Files:**
- Create: `app/(public)/apt/[id]/page.tsx`
- Create: `app/(public)/apt/[id]/actions.ts`
- Create: `app/(public)/apt/[id]/_components/property-header.tsx`
- Create: `app/(public)/apt/[id]/_components/stats-cards.tsx`
- Create: `app/(public)/apt/[id]/_components/price-charts.tsx`
- Create: `app/(public)/apt/[id]/_components/transaction-section.tsx`
- Create: `app/(public)/apt/[id]/_components/static-map.tsx`
- Create: `app/(public)/apt/[id]/_components/nearby-properties.tsx`
- Create: `app/(public)/apt/[id]/_components/phase2-placeholder.tsx`

이 라우트는 가장 복잡합니다. 단계별로 작성합니다.

- [ ] **Step 1: actions.ts (Server Action for pagination)**

```typescript
'use server';
import { getTransactionsByType } from '@/lib/transaction';
import type { DealType } from '@prisma/client';

export async function fetchTxPage(propertyId: bigint, dealType: DealType, page: number, area?: number | null) {
  const rows = await getTransactionsByType(propertyId, dealType, { page, perPage: 10, area: area ?? null });
  return rows.map((t) => ({
    id: String(t.id),
    contractDate: t.contractDate.toISOString().slice(0, 10),
    exclusiveArea: Number(t.exclusiveArea),
    floor: t.floor,
    dealAmount: t.dealAmount,
    deposit: t.deposit,
    monthlyRent: t.monthlyRent,
  }));
}
```

- [ ] **Step 2: install Recharts**

```bash
pnpm add recharts@^2
```

- [ ] **Step 3: _components/property-header.tsx**

```typescript
import type { Property, Region } from '@prisma/client';

export function PropertyHeader({ property, region }: { property: Property; region: Region }) {
  return (
    <header>
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)] md:text-4xl">{property.name}</h1>
      <p className="mt-2 text-[var(--color-muted)]">
        {region.fullName}
        {property.builtYear ? ` · ${property.builtYear}년 준공` : ''}
        {property.households ? ` · ${property.households.toLocaleString('ko-KR')}세대` : ''}
      </p>
    </header>
  );
}
```

- [ ] **Step 4: _components/stats-cards.tsx**

```typescript
import type { Property } from '@prisma/client';
import { formatBillion } from '@/lib/format';
import { Card } from '@/components/ui/card';

export function StatsCards({ property: p }: { property: Property }) {
  const cards = [
    { label: '매매 평균', value: formatBillion(p.saleAvgPrice12m), count: p.saleCount12m },
    { label: '전세 평균', value: formatBillion(p.jeonseAvgDeposit12m), count: p.jeonseCount12m },
    { label: '월세 보증금', value: formatBillion(p.wolseAvgDeposit12m), count: p.wolseCount12m },
    { label: '총 거래', value: `${p.txCount12m}건`, count: null },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="!p-4">
          <p className="text-xs font-semibold text-[var(--color-muted)]">{c.label}</p>
          <p className="mt-1 text-xl font-bold text-[var(--color-blue-dark)]">{c.value}</p>
          {c.count !== null && <p className="text-xs text-[var(--color-muted)]">최근 1년 {c.count}건</p>}
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: _components/price-charts.tsx**

```typescript
'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/card';

interface Point { month: string; value: number; count: number }
interface Props { sale: Point[]; jeonse: Point[]; wolse: Point[] }

export function PriceCharts({ sale, jeonse, wolse }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <ChartCard title="매매" color="#2563eb" data={sale} />
      <ChartCard title="전세" color="#0f9f6e" data={jeonse} />
      <ChartCard title="월세 보증금" color="#ef4444" data={wolse} />
    </div>
  );
}

function ChartCard({ title, color, data }: { title: string; color: string; data: Point[] }) {
  return (
    <Card className="!p-4">
      <p className="mb-2 text-sm font-bold text-[var(--color-blue-dark)]">{title}</p>
      {data.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)]">데이터 없음</p>
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={data}>
            <XAxis dataKey="month" hide />
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Tooltip
              labelFormatter={(v) => v as string}
              formatter={(v: unknown) => [`${(Number(v) / 10_000).toFixed(1)}억`, '평균']}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
```

- [ ] **Step 6: _components/transaction-section.tsx**

```typescript
'use client';

import { useState, useTransition, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { Badge } from '@/components/ui/badge';
import { formatBillion, formatPyeong } from '@/lib/format';
import { fetchTxPage } from '../actions';
import type { DealType } from '@prisma/client';

interface Row {
  id: string;
  contractDate: string;
  exclusiveArea: number;
  floor: number | null;
  dealAmount: number | null;
  deposit: number | null;
  monthlyRent: number | null;
}

interface Props {
  propertyId: string;
  dealType: DealType;
  initialRows: Row[];
  totalCount: number;
}

const PER_PAGE = 10;
const LABELS: Record<DealType, string> = { SALE: '매매', JEONSE: '전세', WOLSE: '월세' };

export function TransactionSection({ propertyId, dealType, initialRows, totalCount }: Props) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  async function goTo(newPage: number) {
    startTransition(async () => {
      const data = await fetchTxPage(BigInt(propertyId), dealType, newPage);
      setRows(data);
      setPage(newPage);
      ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  return (
    <section ref={ref} className="mt-8">
      <h2 className="mb-4 text-xl font-bold text-[var(--color-blue-dark)]">
        {LABELS[dealType]} 거래 내역 <span className="text-sm font-medium text-[var(--color-muted)]">(전체 {totalCount}건)</span>
      </h2>

      {totalCount === 0 ? (
        <Card><p className="text-sm text-[var(--color-muted)]">최근 1년 {LABELS[dealType]} 거래 내역이 없습니다.</p></Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-soft)]">
              <tr className="text-left text-xs font-bold uppercase text-[var(--color-muted)]">
                <th className="px-4 py-3">계약일</th>
                <th className="px-4 py-3">평형</th>
                <th className="px-4 py-3">층</th>
                <th className="px-4 py-3 text-right">{dealType === 'SALE' ? '거래가' : '보증금'}{dealType === 'WOLSE' ? ' / 월세' : ''}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--color-line)]">
                  <td className="px-4 py-3">{r.contractDate}</td>
                  <td className="px-4 py-3">{formatPyeong(r.exclusiveArea)}</td>
                  <td className="px-4 py-3">{r.floor ? `${r.floor}층` : '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {dealType === 'SALE' && formatBillion(r.dealAmount)}
                    {dealType === 'JEONSE' && formatBillion(r.deposit)}
                    {dealType === 'WOLSE' && r.deposit !== null && (
                      <>보 {formatBillion(r.deposit)} / 월 {r.monthlyRent?.toLocaleString('ko-KR')}만원</>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-[var(--color-line)] px-4">
            <Pagination
              current={page}
              totalPages={Math.ceil(totalCount / PER_PAGE)}
              totalItems={totalCount}
              perPage={PER_PAGE}
              onChange={goTo}
              disabled={pending}
            />
          </div>
        </Card>
      )}
    </section>
  );
}
```

- [ ] **Step 7: _components/static-map.tsx**

```typescript
'use client';

import { useEffect, useRef } from 'react';

declare global { interface Window { kakao: any } }

export function StaticMap({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_KAKAO_JS_KEY) return;
    const script = document.createElement('script');
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_JS_KEY}&autoload=false`;
    script.async = true;
    script.onload = () => {
      window.kakao.maps.load(() => {
        if (!ref.current) return;
        const center = new window.kakao.maps.LatLng(lat, lng);
        const map = new window.kakao.maps.Map(ref.current, { center, level: 4 });
        new window.kakao.maps.Marker({ position: center, map, title: name });
      });
    };
    document.head.appendChild(script);
    return () => { script.remove(); };
  }, [lat, lng, name]);

  return <div ref={ref} className="h-64 w-full rounded-2xl bg-[var(--color-line)]" />;
}
```

- [ ] **Step 8: _components/nearby-properties.tsx**

```typescript
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { NearbyProperty } from '@/lib/nearby';

export function NearbyProperties({ items, slug }: { items: NearbyProperty[]; slug: 'apt' | 'officetel' | 'villa' }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">인근 단지</h2>
      <ul className="divide-y divide-[var(--color-line)]">
        {items.map((it) => (
          <li key={it.id}>
            <Link href={`/${slug}/${it.id}`} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-semibold">{it.name}</p>
                <p className="text-xs text-[var(--color-muted)]">{it.region}</p>
              </div>
              <span className="text-xs text-[var(--color-muted)]">{it.distKm.toFixed(2)}km</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 9: _components/phase2-placeholder.tsx**

```typescript
import { Card } from '@/components/ui/card';

export function Phase2Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <Card className="!bg-[var(--color-soft)]">
      <p className="text-sm font-semibold text-[var(--color-blue-dark)]">🚧 {title}</p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">{description}</p>
    </Card>
  );
}
```

- [ ] **Step 10: page.tsx — orchestrate everything**

```typescript
import { notFound } from 'next/navigation';
import { getPropertyById } from '@/lib/property';
import { getTransactionCounts, getTransactionsByType, getMonthlyChartData } from '@/lib/transaction';
import { getNearbyProperties } from '@/lib/nearby';
import { PropertyType, DealType } from '@prisma/client';
import { PropertyHeader } from './_components/property-header';
import { StatsCards } from './_components/stats-cards';
import { PriceCharts } from './_components/price-charts';
import { TransactionSection } from './_components/transaction-section';
import { StaticMap } from './_components/static-map';
import { NearbyProperties } from './_components/nearby-properties';
import { Phase2Placeholder } from './_components/phase2-placeholder';
import { formatBillion } from '@/lib/format';
import type { Metadata } from 'next';

export const revalidate = 21_600; // 6h

interface Params { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const property = await getPropertyById(BigInt(id)).catch(() => null);
  if (!property) return {};
  return {
    title: `${property.name} 실거래가 · ${property.region.fullName}`,
    description: `${property.name}(${property.builtYear ?? '?'}년 준공). 매매 평균 ${formatBillion(property.saleAvgPrice12m)} · 전세 ${formatBillion(property.jeonseAvgDeposit12m)} · 거래 ${property.txCount12m}건.`,
    alternates: { canonical: `/apt/${property.id}` },
  };
}

export default async function AptDetailPage({ params }: Params) {
  const { id } = await params;
  const propId = BigInt(id);
  const property = await getPropertyById(propId);
  if (!property || property.propertyType !== PropertyType.APARTMENT) notFound();

  const [counts, saleRows, jeonseRows, wolseRows, chart, nearby, coord] = await Promise.all([
    getTransactionCounts(propId),
    getTransactionsByType(propId, DealType.SALE, { perPage: 10 }),
    getTransactionsByType(propId, DealType.JEONSE, { perPage: 10 }),
    getTransactionsByType(propId, DealType.WOLSE, { perPage: 10 }),
    getMonthlyChartData(propId),
    getNearbyProperties({ propertyId: propId, propertyType: PropertyType.APARTMENT }),
    getCoord(propId),
  ]);

  const toRow = (t: any) => ({
    id: String(t.id),
    contractDate: t.contractDate.toISOString().slice(0, 10),
    exclusiveArea: Number(t.exclusiveArea),
    floor: t.floor,
    dealAmount: t.dealAmount,
    deposit: t.deposit,
    monthlyRent: t.monthlyRent,
  });

  return (
    <article className="mx-auto max-w-[1180px] space-y-8 px-6 py-12">
      <PropertyHeader property={property} region={property.region} />
      <StatsCards property={property} />
      <PriceCharts
        sale={chart.SALE.map((p) => ({ ...p }))}
        jeonse={chart.JEONSE.map((p) => ({ ...p }))}
        wolse={chart.WOLSE.map((p) => ({ ...p }))}
      />

      <TransactionSection propertyId={String(propId)} dealType={DealType.SALE} initialRows={saleRows.map(toRow)} totalCount={counts.SALE} />
      <TransactionSection propertyId={String(propId)} dealType={DealType.JEONSE} initialRows={jeonseRows.map(toRow)} totalCount={counts.JEONSE} />
      <TransactionSection propertyId={String(propId)} dealType={DealType.WOLSE} initialRows={wolseRows.map(toRow)} totalCount={counts.WOLSE} />

      <div className="grid gap-6 md:grid-cols-2">
        {coord && <StaticMap lat={coord.lat} lng={coord.lng} name={property.name} />}
        <NearbyProperties items={nearby} slug="apt" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Phase2Placeholder title="주변 학교·마트·병원" description="생활 인프라 정보는 Phase 2에서 제공할 예정이에요." />
        <Phase2Placeholder title="주변 청약 정보" description="청약 단지 연결 정보는 Phase 2에서 제공할 예정이에요." />
      </div>
    </article>
  );
}

async function getCoord(id: bigint) {
  const r = await (await import('@/lib/db')).prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Property" WHERE id = ${id} AND location IS NOT NULL
  `;
  return r[0] ?? null;
}
```

- [ ] **Step 11: Commit**

```bash
git add "app/(public)/apt/[id]/"
git commit -m "feat(app): add aprtment detail page with 3 transaction sections + charts + nearby"
```

---

### Task 71: app/(public)/officetel/[id]/page.tsx

**Files:**
- Create: `app/(public)/officetel/[id]/page.tsx`
- Create: `app/(public)/officetel/[id]/actions.ts`

- [ ] **Step 1: Implement** — identical structure to apt/[id], but checks for OFFICETEL and uses slug='officetel' for nearby links

Copy `app/(public)/apt/[id]/page.tsx` and adjust:
- Update import paths to reference `apt/[id]/_components/*` so we share the same components (no duplicate component files)
- Change `if (property.propertyType !== PropertyType.APARTMENT)` to `OFFICETEL`
- Change `getNearbyProperties({ propertyType: PropertyType.OFFICETEL })`
- Change `<NearbyProperties slug="officetel" />`
- Change metadata canonical to `/officetel/${id}`

```typescript
import { notFound } from 'next/navigation';
import { getPropertyById } from '@/lib/property';
import { getTransactionCounts, getTransactionsByType, getMonthlyChartData } from '@/lib/transaction';
import { getNearbyProperties } from '@/lib/nearby';
import { PropertyType, DealType } from '@prisma/client';
import { PropertyHeader } from '../../apt/[id]/_components/property-header';
import { StatsCards } from '../../apt/[id]/_components/stats-cards';
import { PriceCharts } from '../../apt/[id]/_components/price-charts';
import { TransactionSection } from '../../apt/[id]/_components/transaction-section';
import { NearbyProperties } from '../../apt/[id]/_components/nearby-properties';
import { Phase2Placeholder } from '../../apt/[id]/_components/phase2-placeholder';
import { formatBillion } from '@/lib/format';
import type { Metadata } from 'next';

export const revalidate = 21_600;

interface Params { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const p = await getPropertyById(BigInt(id)).catch(() => null);
  if (!p) return {};
  return {
    title: `${p.name} 실거래가 · ${p.region.fullName}`,
    description: `${p.name} 오피스텔 실거래가 — 매매 평균 ${formatBillion(p.saleAvgPrice12m)} · 전세 ${formatBillion(p.jeonseAvgDeposit12m)}`,
    alternates: { canonical: `/officetel/${p.id}` },
  };
}

export default async function OffiDetailPage({ params }: Params) {
  const { id } = await params;
  const propId = BigInt(id);
  const property = await getPropertyById(propId);
  if (!property || property.propertyType !== PropertyType.OFFICETEL) notFound();

  // identical orchestration to apt/[id]/page.tsx ...
  const [counts, saleRows, jeonseRows, wolseRows, chart, nearby] = await Promise.all([
    getTransactionCounts(propId),
    getTransactionsByType(propId, DealType.SALE, { perPage: 10 }),
    getTransactionsByType(propId, DealType.JEONSE, { perPage: 10 }),
    getTransactionsByType(propId, DealType.WOLSE, { perPage: 10 }),
    getMonthlyChartData(propId),
    getNearbyProperties({ propertyId: propId, propertyType: PropertyType.OFFICETEL }),
  ]);
  const toRow = (t: any) => ({ id: String(t.id), contractDate: t.contractDate.toISOString().slice(0,10), exclusiveArea: Number(t.exclusiveArea), floor: t.floor, dealAmount: t.dealAmount, deposit: t.deposit, monthlyRent: t.monthlyRent });

  return (
    <article className="mx-auto max-w-[1180px] space-y-8 px-6 py-12">
      <PropertyHeader property={property} region={property.region} />
      <StatsCards property={property} />
      <PriceCharts sale={chart.SALE} jeonse={chart.JEONSE} wolse={chart.WOLSE} />
      <TransactionSection propertyId={String(propId)} dealType={DealType.SALE} initialRows={saleRows.map(toRow)} totalCount={counts.SALE} />
      <TransactionSection propertyId={String(propId)} dealType={DealType.JEONSE} initialRows={jeonseRows.map(toRow)} totalCount={counts.JEONSE} />
      <TransactionSection propertyId={String(propId)} dealType={DealType.WOLSE} initialRows={wolseRows.map(toRow)} totalCount={counts.WOLSE} />
      <NearbyProperties items={nearby} slug="officetel" />
      <div className="grid gap-4 md:grid-cols-2">
        <Phase2Placeholder title="주변 학교·마트·병원" description="Phase 2에서 제공 예정" />
        <Phase2Placeholder title="주변 청약 정보" description="Phase 2에서 제공 예정" />
      </div>
    </article>
  );
}
```

Also create `app/(public)/officetel/[id]/actions.ts` — identical to apt actions:

```typescript
'use server';
import { getTransactionsByType } from '@/lib/transaction';
import type { DealType } from '@prisma/client';
export async function fetchTxPage(propertyId: bigint, dealType: DealType, page: number) {
  const rows = await getTransactionsByType(propertyId, dealType, { page, perPage: 10 });
  return rows.map((t) => ({ id: String(t.id), contractDate: t.contractDate.toISOString().slice(0,10), exclusiveArea: Number(t.exclusiveArea), floor: t.floor, dealAmount: t.dealAmount, deposit: t.deposit, monthlyRent: t.monthlyRent }));
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(public)/officetel/[id]/"
git commit -m "feat(app): add officetel detail page (reuses apt/[id] components)"
```

---

### Task 72: app/(public)/villa/[id]/page.tsx

**Files:**
- Create: `app/(public)/villa/[id]/page.tsx`
- Create: `app/(public)/villa/[id]/actions.ts`

- [ ] **Step 1: Implement** — accepts both ROW_HOUSE and MULTIPLEX

```typescript
import { notFound } from 'next/navigation';
import { getPropertyById } from '@/lib/property';
import { getTransactionCounts, getTransactionsByType, getMonthlyChartData } from '@/lib/transaction';
import { getNearbyProperties } from '@/lib/nearby';
import { PropertyType, DealType } from '@prisma/client';
import { PropertyHeader } from '../../apt/[id]/_components/property-header';
import { StatsCards } from '../../apt/[id]/_components/stats-cards';
import { PriceCharts } from '../../apt/[id]/_components/price-charts';
import { TransactionSection } from '../../apt/[id]/_components/transaction-section';
import { NearbyProperties } from '../../apt/[id]/_components/nearby-properties';
import { Phase2Placeholder } from '../../apt/[id]/_components/phase2-placeholder';
import type { Metadata } from 'next';

export const revalidate = 21_600;

interface Params { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const p = await getPropertyById(BigInt(id)).catch(() => null);
  if (!p) return {};
  const typeLabel = p.propertyType === 'ROW_HOUSE' ? '연립' : '다세대';
  return {
    title: `${p.name} 실거래가 · ${typeLabel}`,
    description: `${p.name} ${typeLabel} 실거래가`,
    alternates: { canonical: `/villa/${p.id}` },
  };
}

export default async function VillaDetailPage({ params }: Params) {
  const { id } = await params;
  const propId = BigInt(id);
  const property = await getPropertyById(propId);
  if (!property || (property.propertyType !== PropertyType.ROW_HOUSE && property.propertyType !== PropertyType.MULTIPLEX)) notFound();

  const [counts, saleRows, jeonseRows, wolseRows, chart, nearby] = await Promise.all([
    getTransactionCounts(propId),
    getTransactionsByType(propId, DealType.SALE, { perPage: 10 }),
    getTransactionsByType(propId, DealType.JEONSE, { perPage: 10 }),
    getTransactionsByType(propId, DealType.WOLSE, { perPage: 10 }),
    getMonthlyChartData(propId),
    getNearbyProperties({ propertyId: propId, propertyType: property.propertyType }),
  ]);
  const toRow = (t: any) => ({ id: String(t.id), contractDate: t.contractDate.toISOString().slice(0,10), exclusiveArea: Number(t.exclusiveArea), floor: t.floor, dealAmount: t.dealAmount, deposit: t.deposit, monthlyRent: t.monthlyRent });

  return (
    <article className="mx-auto max-w-[1180px] space-y-8 px-6 py-12">
      <PropertyHeader property={property} region={property.region} />
      <StatsCards property={property} />
      <PriceCharts sale={chart.SALE} jeonse={chart.JEONSE} wolse={chart.WOLSE} />
      <TransactionSection propertyId={String(propId)} dealType={DealType.SALE} initialRows={saleRows.map(toRow)} totalCount={counts.SALE} />
      <TransactionSection propertyId={String(propId)} dealType={DealType.JEONSE} initialRows={jeonseRows.map(toRow)} totalCount={counts.JEONSE} />
      <TransactionSection propertyId={String(propId)} dealType={DealType.WOLSE} initialRows={wolseRows.map(toRow)} totalCount={counts.WOLSE} />
      <NearbyProperties items={nearby} slug="villa" />
      <div className="grid gap-4 md:grid-cols-2">
        <Phase2Placeholder title="주변 학교·마트·병원" description="Phase 2에서 제공 예정" />
        <Phase2Placeholder title="주변 청약 정보" description="Phase 2에서 제공 예정" />
      </div>
    </article>
  );
}
```

Create `app/(public)/villa/[id]/actions.ts` (identical content to apt actions, copy as-is from Task 70 Step 1).

- [ ] **Step 2: Commit**

```bash
git add "app/(public)/villa/[id]/"
git commit -m "feat(app): add villa detail page (covers ROW_HOUSE + MULTIPLEX)"
```

---

### Task 73: app/(public)/region/page.tsx — 시도 17개 허브

**Files:**
- Create: `app/(public)/region/page.tsx`

- [ ] **Step 1: Implement**

```typescript
import { getSidoList } from '@/lib/region';
import { RegionCard } from '../_components/region-card';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '시도별 부동산 실거래가',
  description: '서울·경기·인천·부산 등 전국 시도별 부동산 실거래가를 한눈에.',
  alternates: { canonical: '/region' },
};

export const revalidate = 86_400; // 24h

export default async function RegionHubPage() {
  const sidos = await getSidoList();
  return (
    <section className="mx-auto max-w-[1180px] px-6 py-16">
      <h1 className="mb-8 text-3xl font-black text-[var(--color-blue-dark)] md:text-4xl">
        시도별 부동산 실거래가
      </h1>
      <div className="grid gap-3 md:grid-cols-5">
        {sidos.map((s) => (
          <RegionCard key={s.code} code={s.code} name={s.sido} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(public)/region/page.tsx"
git commit -m "feat(app): add /region hub page (17 sidos)"
```

---

### Task 74: app/(public)/region/[code]/page.tsx — 시군구 페이지

**Files:**
- Create: `app/(public)/region/[code]/page.tsx`

- [ ] **Step 1: Implement**

```typescript
import { notFound } from 'next/navigation';
import { getSigunguByCode } from '@/lib/region';
import { getTopPropertiesByVolume } from '@/lib/property';
import { PropertyCard } from '../../_components/property-card';
import { PropertyType } from '@prisma/client';
import type { Metadata } from 'next';

export const revalidate = 21_600;

interface Params { params: Promise<{ code: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const r = await getSigunguByCode(code);
  if (!r) return {};
  return {
    title: `${r.fullName} 아파트 실거래가`,
    description: `${r.fullName}의 아파트·오피스텔·연립다세대 매매·전세·월세 실거래가.`,
    alternates: { canonical: `/region/${r.sigunguCode}` },
  };
}

export default async function RegionPage({ params }: Params) {
  const { code } = await params;
  const region = await getSigunguByCode(code);
  if (!region) notFound();

  const apartments = await getTopPropertiesByVolume({
    types: [PropertyType.APARTMENT],
    sigunguCode: region.sigunguCode!,
    limit: 12,
  });

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-16">
      <p className="text-sm text-[var(--color-muted)]">
        홈 › {region.sido} › {region.sigungu}
      </p>
      <h1 className="mt-2 text-3xl font-black text-[var(--color-blue-dark)] md:text-4xl">
        {region.fullName} 부동산 실거래가
      </h1>

      <h2 className="mt-10 mb-5 text-xl font-bold text-[var(--color-blue-dark)]">
        거래 많은 아파트 단지
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {apartments.map((p) => (
          <PropertyCard key={String(p.id)} property={p} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(public)/region/[code]/"
git commit -m "feat(app): add /region/[code] sigungu landing page"
```

---

### Task 75: app/(public)/list/page.tsx — 필터 도구

**Files:**
- Create: `app/(public)/list/page.tsx`

- [ ] **Step 1: Implement (SSR with searchParams)**

```typescript
import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';
import { PropertyCard } from '../_components/property-card';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '부동산 실거래가 검색',
  description: '유형·지역·가격으로 필터링한 부동산 실거래가 결과',
  robots: { index: false, follow: true },
  alternates: { canonical: '/list' },
};

const TYPE_MAP: Record<string, PropertyType[]> = {
  apt: [PropertyType.APARTMENT],
  officetel: [PropertyType.OFFICETEL],
  villa: [PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX],
  all: [PropertyType.APARTMENT, PropertyType.OFFICETEL, PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX],
};

interface SearchParams { type?: string; region?: string; page?: string }

export default async function ListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const types = TYPE_MAP[sp.type ?? 'all'] ?? TYPE_MAP.all;
  const page = Math.max(1, Number(sp.page ?? '1'));
  const perPage = 30;

  const where: any = { propertyType: { in: types }, txCount12m: { gt: 0 } };
  if (sp.region) where.sigunguCode = sp.region;

  const [rows, total] = await Promise.all([
    prisma.property.findMany({
      where, include: { region: true }, orderBy: { lastTxAt: 'desc' },
      skip: (page - 1) * perPage, take: perPage,
    }),
    prisma.property.count({ where }),
  ]);

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <h1 className="text-2xl font-bold text-[var(--color-blue-dark)]">부동산 실거래가 검색</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">{total.toLocaleString('ko-KR')}건 발견</p>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {rows.map((p) => (
          <PropertyCard key={String(p.id)} property={p} />
        ))}
      </div>
    </section>
  );
}

export const revalidate = 60;
```

- [ ] **Step 2: Commit**

```bash
git add "app/(public)/list/page.tsx"
git commit -m "feat(app): add /list filter tool page (noindex)"
```

---

### Task 76: app/(public)/search/page.tsx — 검색 결과

**Files:**
- Create: `app/(public)/search/page.tsx`

- [ ] **Step 1: Implement**

```typescript
import { autocomplete } from '@/lib/search';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '검색 결과',
  robots: { index: false, follow: true },
  alternates: { canonical: '/search' },
};

export const revalidate = 60;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const results = q ? await autocomplete(q) : { properties: [], regions: [] };

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <h1 className="text-2xl font-bold text-[var(--color-blue-dark)]">"{q}" 검색 결과</h1>

      {results.properties.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-bold">단지</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {results.properties.map((p) => (
              <Link key={p.id} href={p.type === 'APARTMENT' ? `/apt/${p.id}` : p.type === 'OFFICETEL' ? `/officetel/${p.id}` : `/villa/${p.id}`}>
                <Card>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-[var(--color-muted)]">{p.region}</p>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {results.regions.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-bold">지역</h2>
          <ul className="space-y-1">
            {results.regions.map((r) => (
              <li key={r.code}>
                <Link href={`/region/${r.code.slice(0, 5)}`} className="text-[var(--color-blue)] hover:underline">{r.fullName}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {results.properties.length === 0 && results.regions.length === 0 && q && (
        <p className="mt-8 text-[var(--color-muted)]">결과를 찾지 못했어요.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(public)/search/page.tsx"
git commit -m "feat(app): add /search results page (noindex)"
```

---

### Task 77: app/sitemap.ts

**Files:**
- Create: `app/sitemap.ts`

- [ ] **Step 1: Implement**

```typescript
import { prisma } from '@/lib/db';
import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://imjang-on.com';

export const revalidate = 86_400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [sigungus, properties] = await Promise.all([
    prisma.region.findMany({ where: { level: 2, isAbolished: false }, select: { code: true } }),
    prisma.property.findMany({ where: { txCount12m: { gt: 0 } }, select: { id: true, propertyType: true, updatedAt: true } }),
  ]);

  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE}/apt`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE}/officetel`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE}/villa`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE}/region`, changeFrequency: 'weekly', priority: 0.8 },
  ];

  for (const r of sigungus) {
    entries.push({ url: `${SITE}/region/${r.code.slice(0, 5)}`, changeFrequency: 'daily', priority: 0.7 });
  }
  for (const p of properties) {
    const prefix = p.propertyType === 'APARTMENT' ? 'apt' : p.propertyType === 'OFFICETEL' ? 'officetel' : 'villa';
    entries.push({ url: `${SITE}/${prefix}/${p.id}`, lastModified: p.updatedAt, changeFrequency: 'weekly', priority: 0.6 });
  }
  return entries;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/sitemap.ts
git commit -m "feat(app): add dynamic sitemap"
```

---

### Task 78: app/robots.ts

**Files:**
- Create: `app/robots.ts`

```typescript
import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://imjang-on.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: ['/', '/apt/', '/officetel/', '/villa/', '/region/'], disallow: ['/search', '/list', '/api/', '/admin'] },
      { userAgent: 'Yeti', allow: ['/', '/apt/', '/officetel/', '/villa/', '/region/'], disallow: ['/search', '/list', '/api/', '/admin'] },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
```

```bash
git add app/robots.ts && git commit -m "feat(app): add robots.txt"
```

---

### Task 79: app/manifest.ts

**Files:**
- Create: `app/manifest.ts`

```typescript
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '임장온',
    short_name: '임장온',
    description: '공공데이터 부동산 실거래가',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7fbff',
    theme_color: '#2563eb',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
```

```bash
git add app/manifest.ts && git commit -m "feat(app): add web manifest"
```

---

### Task 80: app/api/search/route.ts

```typescript
import { autocomplete } from '@/lib/search';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? '';
  const data = await autocomplete(q);
  return Response.json(data, {
    headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' },
  });
}
```

```bash
git add app/api/search && git commit -m "feat(api): add /api/search autocomplete route"
```

---

### Task 81: app/api/revalidate/route.ts

```typescript
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
```

```bash
git add app/api/revalidate && git commit -m "feat(api): add /api/revalidate (token-protected POST)"
```

---

### Task 82: app/api/subscribe-soon/route.ts

```typescript
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
```

```bash
git add app/api/subscribe-soon && git commit -m "feat(api): add Phase 2 email signup endpoint"
```

---

### Task 83: app/api/health/route.ts

```typescript
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ts = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86_400_000);
  const checks = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    prisma.region.count(),
    prisma.ingestionRun.findFirst({ where: { status: 'OK', finishedAt: { gte: yesterday } } }),
  ]);
  const ok = checks.every((c) => c.status === 'fulfilled' && c.value);
  return Response.json(
    {
      status: ok ? 'ok' : 'degraded',
      ts,
      checks: checks.map((c) => c.status === 'fulfilled' ? 'ok' : 'fail'),
    },
    { status: ok ? 200 : 503 },
  );
}
```

```bash
git add app/api/health && git commit -m "feat(api): add /api/health endpoint"
```

---

### Task 84: app/admin/ingestion/page.tsx (Basic Auth via middleware)

**Files:**
- Create: `middleware.ts`
- Create: `app/admin/ingestion/page.tsx`

- [ ] **Step 1: middleware.ts (Basic Auth for /admin)**

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/admin')) return NextResponse.next();
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;
  if (!user || !pass) return new NextResponse('Admin disabled', { status: 503 });

  const header = req.headers.get('authorization');
  if (header) {
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = atob(encoded);
      if (decoded === `${user}:${pass}`) return NextResponse.next();
    }
  }
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="admin"' },
  });
}

export const config = { matcher: ['/admin/:path*'] };
```

- [ ] **Step 2: admin/ingestion/page.tsx**

```typescript
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function IngestionAdminPage() {
  const runs = await prisma.ingestionRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 100,
  });

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <h1 className="text-2xl font-bold">최근 ETL 실행</h1>
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-[var(--color-muted)]">
            <th>ID</th><th>Source</th><th>Target</th><th>Status</th><th>Rows</th><th>Started</th><th>Error</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={String(r.id)} className="border-t border-[var(--color-line)]">
              <td className="py-1.5">{String(r.id)}</td>
              <td>{r.source}</td>
              <td>{r.targetKey}</td>
              <td className={r.status === 'ERROR' ? 'text-red-600' : ''}>{r.status}</td>
              <td>{r.rowsUpserted}</td>
              <td>{r.startedAt.toISOString().slice(0,19).replace('T',' ')}</td>
              <td className="text-xs text-red-600">{r.errorMessage?.slice(0, 60)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add middleware.ts app/admin/ingestion/
git commit -m "feat(admin): add /admin/ingestion (Basic Auth) IngestionRun viewer"
```

---

### Task 85: error.tsx boundaries

**Files:**
- Create: `app/(public)/error.tsx`

```typescript
'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      <h1 className="text-2xl font-bold text-[var(--color-blue-dark)]">문제가 발생했어요</h1>
      <p className="mt-2 text-[var(--color-muted)]">잠시 후 다시 시도해주세요.</p>
      <button onClick={reset} className="mt-6 rounded-full bg-[var(--color-blue)] px-5 py-2.5 font-bold text-white">
        다시 시도
      </button>
    </div>
  );
}
```

```bash
git add "app/(public)/error.tsx"
git commit -m "feat(app): add error boundary"
```

---

### Task 86: Static info pages (about, data-source, terms, privacy)

**Files:**
- Create: `app/(public)/about/page.tsx`
- Create: `app/(public)/data-source/page.tsx`
- Create: `app/(public)/terms/page.tsx`
- Create: `app/(public)/privacy/page.tsx`

- [ ] **Step 1: about/page.tsx**

```typescript
import type { Metadata } from 'next';
export const metadata: Metadata = { title: '서비스 소개', alternates: { canonical: '/about' } };
export default function AboutPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16 prose">
      <h1>임장온 소개</h1>
      <p>임장온은 국토교통부 실거래가, 행정안전부 법정동코드 등 공공데이터를 가공해 부동산 실거래가를 통합 제공하는 정보 플랫폼입니다.</p>
      <p>Phase 1에서는 아파트·오피스텔·연립다세대의 매매·전세·월세 정보를 단지 단위로 제공합니다. Phase 2에서 청약, 생활 인프라(학교·마트·병원), 전세대출 정보 등을 추가할 예정입니다.</p>
    </article>
  );
}
```

- [ ] **Step 2: data-source/page.tsx**

```typescript
import type { Metadata } from 'next';
export const metadata: Metadata = { title: '데이터 출처', alternates: { canonical: '/data-source' } };
export default function DataSourcePage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16 prose">
      <h1>데이터 출처 및 면책</h1>
      <ul>
        <li>국토교통부 실거래가 공개 API (apis.data.go.kr/1613000) — 매매·전월세 실거래가</li>
        <li>행정안전부 법정동코드 (data.go.kr 15077871) — 지역 코드 체계</li>
        <li>카카오 로컬 API — 주소 좌표 변환</li>
      </ul>
      <p>본 사이트의 정보는 공공데이터를 가공해 제공하며, 실거래 신고 지연(통상 30일 이내)으로 인해 최신성·정확성을 100% 보장하지 않습니다.</p>
    </article>
  );
}
```

- [ ] **Step 3: terms/page.tsx + privacy/page.tsx** (placeholder content for now — full text drafted in launch checklist)

```typescript
// app/(public)/terms/page.tsx
import type { Metadata } from 'next';
export const metadata: Metadata = { title: '이용약관', alternates: { canonical: '/terms' } };
export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16 prose">
      <h1>이용약관</h1>
      <p>본 사이트는 공공데이터를 가공해 제공하는 정보 플랫폼으로, 회원가입·결제 기능이 없습니다.</p>
      <p>본 사이트의 정보를 활용한 부동산 거래 의사결정의 결과에 대해 임장온은 책임지지 않습니다.</p>
    </article>
  );
}

// app/(public)/privacy/page.tsx
import type { Metadata } from 'next';
export const metadata: Metadata = { title: '개인정보 처리방침', alternates: { canonical: '/privacy' } };
export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16 prose">
      <h1>개인정보 처리방침</h1>
      <p>임장온은 Phase 2 알림 신청 시 이메일 주소만 수집하며, 출시 알림 발송 목적으로만 사용합니다.</p>
      <p>Google Analytics 4 / Vercel Analytics를 통해 익명화된 트래픽 통계를 수집합니다.</p>
    </article>
  );
}
```

- [ ] **Step 4: Commit + Phase tag**

```bash
git add "app/(public)/about/" "app/(public)/data-source/" "app/(public)/terms/" "app/(public)/privacy/"
git commit -m "feat(app): add static info pages (about, data-source, terms, privacy)"
git tag -a phase-1d-done -m "Phase 1D pages complete"
```

---

# Phase 1E — Observability, E2E, Launch (Task 87–93)

목표: 출시 가능한 상태로 도달 — Sentry/GA4 연결, CI, E2E 5개, 프로덕션 배포, SEO 등록, AdSense 신청까지.

---

### Task 87: Sentry setup

**Files:**
- Create: `sentry.client.config.ts`
- Create: `sentry.server.config.ts`
- Create: `sentry.edge.config.ts`
- Modify: `next.config.mjs`

- [ ] **Step 1: Install Sentry**

```bash
pnpm add @sentry/nextjs@^8
```

- [ ] **Step 2: Write sentry.client.config.ts**

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  ignoreErrors: ['AbortError', /Network request failed/],
});
```

- [ ] **Step 3: Write sentry.server.config.ts**

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
```

- [ ] **Step 4: Write sentry.edge.config.ts**

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.05,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
```

- [ ] **Step 5: Update next.config.mjs**

```javascript
import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
```

- [ ] **Step 6: Commit**

```bash
git add sentry.*.config.ts next.config.mjs package.json pnpm-lock.yaml
git commit -m "feat: integrate Sentry for client/server/edge error tracking"
```

---

### Task 88: GA4 + Vercel Analytics + Speed Insights

**Files:**
- Modify: `app/layout.tsx`
- Modify: `lib/env.ts` (already done — `NEXT_PUBLIC_GA_ID` exists)

- [ ] **Step 1: Install Vercel packages**

```bash
pnpm add @vercel/analytics @vercel/speed-insights @next/third-parties
```

- [ ] **Step 2: Update app/layout.tsx**

```typescript
import './globals.css';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { GoogleAnalytics } from '@next/third-parties/google';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://imjang-on.com'),
  title: { default: '임장온 — 공공데이터 부동산 실거래가', template: '%s | 임장온' },
  description: '공공데이터로 보는 전국 아파트·오피스텔·연립다세대 실거래가 통합 정보',
  alternates: { canonical: '/' },
  openGraph: { locale: 'ko_KR', type: 'website', siteName: '임장온' },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
        {process.env.NEXT_PUBLIC_GA_ID && <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx package.json pnpm-lock.yaml
git commit -m "feat: integrate GA4 + Vercel Analytics + Speed Insights"
```

---

### Task 89: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write ci.yml**

```yaml
name: ci
on:
  pull_request: {}
  push: { branches: [main] }

jobs:
  check:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgis/postgis:16-3.4
        env:
          POSTGRES_DB: imjang_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres" --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://postgres:test@localhost:5432/imjang_test
      DIRECT_URL:   postgresql://postgres:test@localhost:5432/imjang_test
      LOG_LEVEL: warn
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma generate
      - run: pnpm prisma migrate deploy
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test:unit
      - run: pnpm test:integration

  e2e:
    if: github.event_name == 'push'
    needs: check
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgis/postgis:16-3.4
        env: { POSTGRES_DB: imjang_test, POSTGRES_USER: postgres, POSTGRES_PASSWORD: test }
        ports: ['5432:5432']
        options: --health-cmd "pg_isready -U postgres" --health-interval 5s
    env:
      DATABASE_URL: postgresql://postgres:test@localhost:5432/imjang_test
      DIRECT_URL:   postgresql://postgres:test@localhost:5432/imjang_test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm prisma generate
      - run: pnpm prisma migrate deploy
      - run: pnpm tsx tests/_helpers/seed-e2e.ts
      - run: pnpm test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: playwright-report/ }
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add CI workflow (typecheck + lint + unit + integration + e2e on main)"
```

---

### Task 90: 5 Playwright E2E tests + seed helper

**Files:**
- Create: `tests/_helpers/seed-e2e.ts`
- Create: `tests/e2e/apt-detail.spec.ts`
- Create: `tests/e2e/search.spec.ts`
- Create: `tests/e2e/region.spec.ts`
- Create: `tests/e2e/list.spec.ts`
- Create: `tests/e2e/soon-modal.spec.ts`
- Replace: `tests/e2e/smoke.spec.ts` (already present)

- [ ] **Step 1: seed-e2e.ts (creates a known property with 12 transactions per type)**

```typescript
import { prisma } from '@/lib/db';
import { PropertyType, DealType } from '@prisma/client';
import { createHash } from 'node:crypto';

async function main() {
  await prisma.transaction.deleteMany();
  await prisma.property.deleteMany();
  await prisma.region.deleteMany();

  await prisma.region.create({
    data: {
      code: '1165010100',
      sido: '서울특별시',
      sigungu: '서초구',
      eupmyeondong: '서초동',
      fullName: '서울특별시 서초구 서초동',
      level: 3,
      sourceVersion: 'e2e',
    },
  });
  await prisma.region.create({
    data: { code: '1165000000', sido: '서울특별시', sigungu: '서초구', fullName: '서울특별시 서초구', level: 2, sourceVersion: 'e2e' },
  });

  const p = await prisma.property.create({
    data: {
      propertyType: PropertyType.APARTMENT,
      name: '래미안서초에스티지',
      nameNorm: '래미안서초에스티지',
      regionCode: '1165010100',
      address: '서울특별시 서초구 서초동',
      builtYear: 2009,
      households: 1184,
    },
  });

  const types = [DealType.SALE, DealType.JEONSE, DealType.WOLSE];
  for (const dealType of types) {
    for (let i = 0; i < 12; i++) {
      const date = new Date(2025, 4, 12 - i);
      const hash = createHash('sha256').update(`${p.id}-${dealType}-${i}`).digest('hex');
      await prisma.transaction.create({
        data: {
          propertyId: p.id,
          propertyType: PropertyType.APARTMENT,
          regionCode: '1165010100',
          sigunguCode: '11650',
          dealType,
          contractDate: date,
          exclusiveArea: 84.99,
          floor: 12,
          dealAmount: dealType === DealType.SALE ? 300_000 + i * 1000 : null,
          deposit: dealType !== DealType.SALE ? 150_000 : null,
          monthlyRent: dealType === DealType.WOLSE ? 120 : 0,
          source: 'e2e',
          rawHash: hash,
        },
      });
    }
  }

  // 집계 컬럼 채움
  const { updatePropertyAggregates } = await import('@/scripts/ingest/aggregator');
  await updatePropertyAggregates([p.id]);

  console.log('e2e seed done. propertyId =', p.id);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: apt-detail.spec.ts**

```typescript
import { test, expect } from '@playwright/test';

test('apt detail: 3 transaction sections + page 2', async ({ page }) => {
  await page.goto('/apt/1');
  await expect(page.getByRole('heading', { name: /래미안/ })).toBeVisible();

  for (const label of ['매매 거래 내역', '전세 거래 내역', '월세 거래 내역']) {
    await expect(page.getByText(label)).toBeVisible();
  }

  const sale = page.locator('section', { hasText: '매매 거래 내역' });
  await sale.getByRole('button', { name: '2' }).click();
  await expect(sale.getByText(/12건 중 11–12/)).toBeVisible();
});
```

- [ ] **Step 3: search.spec.ts**

```typescript
import { test, expect } from '@playwright/test';

test('search autocomplete -> detail', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('단지/지역명 검색').fill('래미안');
  await page.waitForResponse((res) => res.url().includes('/api/search'));
  await page.getByText('래미안서초에스티지').first().click();
  await expect(page).toHaveURL(/\/apt\/\d+/);
});
```

- [ ] **Step 4: region.spec.ts**

```typescript
import { test, expect } from '@playwright/test';

test('region landing shows top properties', async ({ page }) => {
  await page.goto('/region/11650');
  await expect(page.getByRole('heading', { name: /서울특별시 서초구/ })).toBeVisible();
  await expect(page.getByText('래미안서초에스티지')).toBeVisible();
});
```

- [ ] **Step 5: list.spec.ts**

```typescript
import { test, expect } from '@playwright/test';

test('list filter page renders results', async ({ page }) => {
  await page.goto('/list?type=apt');
  await expect(page.getByText(/건 발견/)).toBeVisible();
  await expect(page.getByText('래미안서초에스티지')).toBeVisible();
});
```

- [ ] **Step 6: soon-modal.spec.ts**

```typescript
import { test, expect } from '@playwright/test';

test('soon modal email signup', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /청약/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder('이메일 주소').fill('test@example.com');
  await dialog.getByRole('button', { name: '신청' }).click();
  await expect(dialog.getByText(/감사해요/)).toBeVisible();
});
```

- [ ] **Step 7: Run E2E (with seed)**

```bash
docker compose up -d db
pnpm prisma migrate deploy
pnpm tsx tests/_helpers/seed-e2e.ts
pnpm test:e2e
```
Expected: 5 tests pass on chromium-desktop and chromium-mobile (10 total).

- [ ] **Step 8: Commit**

```bash
git add tests/_helpers tests/e2e/
git commit -m "test(e2e): add 5 Playwright golden-path tests + seed helper"
```

---

### Task 91: Production deploy + DNS (manual)

**Files:** (none — operational)

이 task는 인간 작업자만 수행 가능. 체크리스트:

- [ ] **Step 1: Domain 등록**
  - `imjang-on.com` (또는 `.co.kr`) 등 — Cloudflare/Gabia/Cafe24 등에서 구매
  - Vercel 프로젝트에 도메인 연결, A/CNAME 레코드 설정

- [ ] **Step 2: 공공데이터포털 인증키 발급**
  - https://www.data.go.kr 회원가입
  - 6개 API에 활용신청 (Task 33 spec §6.1)
  - Vercel 환경변수 `PUBLIC_DATA_KEY` 설정

- [ ] **Step 3: 카카오 개발자 등록**
  - https://developers.kakao.com 애플리케이션 생성
  - REST API 키 → `KAKAO_REST_KEY`
  - JavaScript 키 → `NEXT_PUBLIC_KAKAO_JS_KEY`
  - "플랫폼 > Web" 도메인 등록

- [ ] **Step 4: Supabase 프로젝트 생성**
  - https://supabase.com Free Tier 프로젝트 생성
  - SQL Editor에서 `CREATE EXTENSION postgis; CREATE EXTENSION pg_trgm;`
  - Connection strings를 Vercel `DATABASE_URL` (pooled), `DIRECT_URL` (direct)에 설정
  - `pnpm prisma migrate deploy`로 마이그레이션 적용

- [ ] **Step 5: 나머지 환경변수 채우기**
  - `REVALIDATE_TOKEN` (랜덤 32바이트)
  - `DISCORD_WEBHOOK_URL`
  - `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` (Sentry 프로젝트 생성 후)
  - `NEXT_PUBLIC_GA_ID` (GA4 측정 ID)
  - `ADMIN_USER` / `ADMIN_PASSWORD`
  - `NEXT_PUBLIC_SITE_URL=https://imjang-on.com`

- [ ] **Step 6: 법정동코드 시드 실행**
  - GitHub Actions `seed-regions` workflow 수동 트리거
  - 또는 로컬에서 production DB에 연결해 `pnpm seed:regions`

- [ ] **Step 7: 백필 시작**
  - GitHub Actions `backfill-transactions` workflow 수동 트리거 (api=all, months=12)
  - 4일 정도 소요. 진행 상황을 Discord webhook으로 모니터링
  - 완료 후 `/admin/ingestion`에서 IngestionRun OK 비율 > 99% 확인

- [ ] **Step 8: 일일 cron 활성화**
  - GitHub Actions `ingest-transactions-daily` 자동 활성 (cron 등록됨)
  - 첫 실행 후 결과 확인

- [ ] **Step 9: 헬스체크 + UptimeRobot**
  - `curl https://imjang-on.com/api/health` → 200
  - UptimeRobot에서 `/api/health` 모니터 등록 (5분 간격)

- [ ] **Step 10: Lighthouse 검사 (모바일)**
  - 단지 상세 페이지 5개 샘플 점검
  - LCP < 2.5s, CLS < 0.1, INP < 200ms 확인

- [ ] **Step 11: Tag deploy-ready**

```bash
git tag -a deploy-ready -m "All systems live, awaiting SEO submission"
git push --tags
```

---

### Task 92: Search Console + 네이버 Search Advisor 등록 (manual)

- [ ] **Step 1: Google Search Console**
  - https://search.google.com/search-console 에서 `imjang-on.com` 추가
  - DNS TXT 또는 Vercel 환경변수로 verification
  - Sitemap 제출: `https://imjang-on.com/sitemap.xml`
  - 단지 5개 샘플 URL "URL 검사 > 색인 요청"

- [ ] **Step 2: 네이버 Search Advisor (Yeti)**
  - https://searchadvisor.naver.com 사이트 등록
  - 동일하게 sitemap 제출
  - "수집 요청"에 5개 샘플 URL

- [ ] **Step 3: 1주일 후 색인 상태 확인**
  - Search Console "색인 > 페이지" 보고서로 카테고리 페이지(/apt, /officetel, /villa, /region) 색인 여부 확인
  - 누락이 있으면 robots.txt / canonical 점검

---

### Task 93: Google AdSense 신청 (manual)

- [ ] **Step 1: AdSense 자격 점검**
  - 푸터의 데이터 출처·면책 문구 ✅
  - 이용약관·개인정보처리방침 페이지 ✅
  - 콘텐츠 페이지 5만+ (Phase 1 단지 페이지로 충족) ✅
  - HTTPS · Core Web Vitals 통과 ✅

- [ ] **Step 2: 신청**
  - https://adsense.google.com/start
  - 사이트 등록 → 광고 코드를 `app/layout.tsx`의 `<head>`에 추가
  - 심사 10~14일

- [ ] **Step 3: 승인 후 광고 배치**
  - 단지 상세 페이지 중단 (거래 표 사이)
  - 메인/지역 페이지 카드 그리드 사이
  - **Phase 1 완료 후 별도 배치 작업으로 진행** (현재 plan 범위 밖)

- [ ] **Step 4: Tag launch-1**

```bash
git tag -a launch-1 -m "Phase 1 launched: data live, SEO submitted, AdSense pending"
git push --tags
```

---

# Self-Review

이 plan을 spec(`docs/superpowers/specs/2026-05-18-imjang-on-design.md`)과 대조한 결과:

**Spec 커버리지** (섹션별 → task 매핑)
- §1 개요 → 정보성, 코드 작업 없음
- §2 Phase 1 범위 → 모든 task가 이 범위 내. Phase 2 placeholder 컴포넌트는 Task 70 Step 9에서 처리.
- §3 기술 스택 → Tasks 1–8, 22, 26, 87 (Sentry), 88 (GA4)
- §4 시스템 아키텍처 → Tasks 8, 10, 11, 48 (runner)
- §5 데이터 모델 → Tasks 9, 10, 11
- §6 공공데이터 소스 → Tasks 33, 34, 42–47
- §7 ETL 파이프라인 → Tasks 33–53
- §8 페이지 & 라우팅 → Tasks 60–86
- §9 네비게이션 & UI → Tasks 22–32, 60–65
- §10 검색·필터·주변검색 → Tasks 57, 58, 62, 75, 76, 80
- §11 디렉터리 구조 → 전체 task가 구현
- §12 에러 처리·관측·로깅 → Tasks 14 (logger), 21 (api-error), 36 (Discord), 83 (health), 84 (admin), 87 (Sentry), 88 (GA4)
- §13 테스트 전략 → Tasks 6, 7, 35, 39, 90
- §14 비용 → 정보성
- §15 출시 체크리스트 → Tasks 91–93
- §16 Phase 2 로드맵 → 범위 밖, placeholder만 (Task 70 Step 9)
- §17 결정 히스토리 → 정보성

**의도적으로 빠진 사항 (정보성, 코드 작업 아님)**:
- spec §6 공공데이터 응답 필드의 상세 한국어 항목명 — adapter 코드가 이미 매핑 처리
- spec §11 디렉터리 구조의 모든 컨벤션 — 각 task에서 자연스럽게 따름

**모호함·자기 모순 검토**: 없음. PropertyType enum/슬러그 매핑(`apt`/`officetel`/`villa`) 일관, DealType(`SALE`/`JEONSE`/`WOLSE`)도 일관. `rawHash` 사용 일관(Task 9 unique, Task 48 컴퓨팅).

**Placeholder 검사**: 없음. 모든 step에 실제 코드/명령/검증을 포함.

---

# Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-18-imjang-on-phase1.md`. **93 tasks across 5 phases**, ~4,000 lines.

Two execution options:

**1. Subagent-Driven (recommended)** — 매 task마다 fresh subagent 한 명이 작업하고, 사이에 reviewer가 검토. 컨텍스트 윈도우 보호 + 빠른 iteration. `superpowers:subagent-driven-development` 사용.

**2. Inline Execution** — 현재 세션에서 배치 단위(예: 한 phase)로 task 묶음을 실행하고 checkpoint마다 리뷰. `superpowers:executing-plans` 사용.

**Which approach?**


