-- CreateTable
CREATE TABLE "TransactionArchive" (
    "id" BIGSERIAL NOT NULL,
    "transactionId" BIGINT NOT NULL,
    "propertyId" BIGINT NOT NULL,
    "sigunguCode" VARCHAR(5) NOT NULL,
    "row" JSONB NOT NULL,
    "reason" VARCHAR(20) NOT NULL,
    "runId" BIGINT NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconcileInsert" (
    "runId" BIGINT NOT NULL,
    "transactionId" BIGINT NOT NULL,

    CONSTRAINT "ReconcileInsert_pkey" PRIMARY KEY ("runId","transactionId")
);

-- CreateIndex
CREATE INDEX "TransactionArchive_runId_idx" ON "TransactionArchive"("runId");

-- CreateIndex
CREATE INDEX "TransactionArchive_transactionId_idx" ON "TransactionArchive"("transactionId");

-- CreateIndex
CREATE INDEX "ReconcileInsert_transactionId_idx" ON "ReconcileInsert"("transactionId");

