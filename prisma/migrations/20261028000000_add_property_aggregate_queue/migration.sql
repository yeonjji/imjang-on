-- CreateTable
CREATE TABLE "PropertyAggregateQueue" (
    "propertyId" BIGINT NOT NULL,
    "enqueuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyAggregateQueue_pkey" PRIMARY KEY ("propertyId")
);

-- CreateIndex
CREATE INDEX "PropertyAggregateQueue_enqueuedAt_idx" ON "PropertyAggregateQueue"("enqueuedAt");

