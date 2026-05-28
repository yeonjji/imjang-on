-- AlterTable
ALTER TABLE "TraditionalMarket" ADD COLUMN "sigunguCode" VARCHAR(5);

-- CreateIndex
CREATE INDEX "TraditionalMarket_sigunguCode_idx" ON "TraditionalMarket"("sigunguCode");

-- CreateIndex (marketType은 기존 schema에는 인덱스 없었음; 필터에 쓰니 추가)
CREATE INDEX "TraditionalMarket_marketType_idx" ON "TraditionalMarket"("marketType");
