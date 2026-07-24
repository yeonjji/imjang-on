-- 2026-07-01 행정구역 개편: 폐지지역 구 property → 신 property 301 리다이렉트용 self-FK (데이터 변경 없음)
-- AlterTable
ALTER TABLE "Property" ADD COLUMN "redirectToId" BIGINT;

-- CreateIndex
CREATE INDEX "Property_redirectToId_idx" ON "Property"("redirectToId");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_redirectToId_fkey" FOREIGN KEY ("redirectToId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
