-- AlterTable
ALTER TABLE "School" ADD COLUMN "sigunguCode" VARCHAR(5);

-- CreateIndex
CREATE INDEX "School_sigunguCode_schoolKind_idx" ON "School"("sigunguCode", "schoolKind");
