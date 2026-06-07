-- CreateTable
CREATE TABLE "StatsSnapshot" (
    "id" BIGSERIAL NOT NULL,
    "payload" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatsSnapshot_computedAt_idx" ON "StatsSnapshot"("computedAt" DESC);
