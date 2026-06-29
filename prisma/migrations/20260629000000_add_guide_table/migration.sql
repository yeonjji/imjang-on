-- CreateEnum
CREATE TYPE "GuideCategory" AS ENUM ('REALESTATE', 'SUBSCRIPTION', 'FINANCE', 'MEDICAL', 'CHILDCARE', 'SCHOOL', 'LIFE');

-- CreateTable
CREATE TABLE "Guide" (
    "id" BIGSERIAL NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" "GuideCategory" NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceName" VARCHAR(120) NOT NULL,
    "sourceUrl" VARCHAR(500) NOT NULL,
    "sourceDate" DATE NOT NULL,
    "sourceExcerpt" TEXT NOT NULL,
    "dedupeKey" VARCHAR(120) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Guide_slug_key" ON "Guide"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Guide_dedupeKey_key" ON "Guide"("dedupeKey");

-- CreateIndex
CREATE INDEX "Guide_status_publishedAt_idx" ON "Guide"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Guide_category_status_idx" ON "Guide"("category", "status");
