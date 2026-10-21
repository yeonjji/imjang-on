-- CreateTable
CREATE TABLE "SubscriptionResult" (
    "noticeId" BIGINT NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "competition" JSONB,
    "scores" JSONB,
    "special" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubscriptionResult_pkey" PRIMARY KEY ("noticeId")
);

-- CreateIndex
CREATE INDEX "SubscriptionResult_status_idx" ON "SubscriptionResult"("status");
