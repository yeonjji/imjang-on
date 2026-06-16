-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('PROGRAM', 'TREND');

-- CreateEnum
CREATE TYPE "PostCategory" AS ENUM ('FINANCE', 'LOAN', 'ECONOMY', 'SUBSCRIPTION', 'REALESTATE');

-- CreateTable
CREATE TABLE "Post" (
    "id" BIGSERIAL NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" "PostType" NOT NULL,
    "category" "PostCategory" NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceName" VARCHAR(120) NOT NULL,
    "sourceUrl" VARCHAR(500) NOT NULL,
    "sourceDate" DATE NOT NULL,
    "sourceExcerpt" TEXT NOT NULL,
    "dedupeKey" VARCHAR(120) NOT NULL,
    "detectedFrom" VARCHAR(200),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Post_dedupeKey_key" ON "Post"("dedupeKey");

-- CreateIndex
CREATE INDEX "Post_status_publishedAt_idx" ON "Post"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Post_category_status_idx" ON "Post"("category", "status");
