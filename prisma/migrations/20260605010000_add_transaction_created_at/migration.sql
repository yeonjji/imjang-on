-- AlterTable: createdAt 추가(우선 nullable로 추가 후 백필)
ALTER TABLE "Transaction" ADD COLUMN "createdAt" TIMESTAMP(3);

-- 기존 행 백필: 신고일(없으면 계약일)을 수집일 프록시로. 배포 첫날 왜곡 방지.
UPDATE "Transaction" SET "createdAt" = COALESCE("registerDate", "contractDate") WHERE "createdAt" IS NULL;

-- 신규 행은 INSERT 시각으로 자동 기록
ALTER TABLE "Transaction" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Transaction" ALTER COLUMN "createdAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Transaction_dealType_createdAt_idx" ON "Transaction"("dealType", "createdAt" DESC);
