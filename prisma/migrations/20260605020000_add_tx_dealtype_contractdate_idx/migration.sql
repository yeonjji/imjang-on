-- CreateIndex
CREATE INDEX "Transaction_dealType_contractDate_idx" ON "Transaction"("dealType", "contractDate" DESC);
