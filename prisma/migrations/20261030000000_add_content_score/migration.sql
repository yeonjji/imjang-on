-- 목록 기본 정렬용 상세 내용 점수(설계 docs/superpowers/specs/2026-10-30-list-content-score-design.md).
-- 상수 기본값 컬럼 추가라 테이블 재작성 없음.
ALTER TABLE "Hospital"  ADD COLUMN "contentScore" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "contentNearby" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "listRank" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Pharmacy"  ADD COLUMN "contentScore" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "contentNearby" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "listRank" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Childcare" ADD COLUMN "contentScore" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "contentNearby" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "listRank" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "School"    ADD COLUMN "contentScore" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "contentNearby" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "listRank" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Park"      ADD COLUMN "contentScore" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "contentNearby" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "listRank" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Parking"   ADD COLUMN "contentScore" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "contentNearby" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "listRank" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EvCharger" ADD COLUMN "contentScore" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "contentNearby" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "listRank" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Hospital_listRank_id_idx"  ON "Hospital"("listRank" DESC, "id");
CREATE INDEX "Pharmacy_listRank_id_idx"  ON "Pharmacy"("listRank" DESC, "id");
CREATE INDEX "Childcare_listRank_id_idx" ON "Childcare"("listRank" DESC, "id");
CREATE INDEX "School_listRank_id_idx"    ON "School"("listRank" DESC, "id");
CREATE INDEX "Park_listRank_id_idx"      ON "Park"("listRank" DESC, "id");
CREATE INDEX "Parking_listRank_id_idx"   ON "Parking"("listRank" DESC, "id");
CREATE INDEX "EvCharger_listRank_id_idx" ON "EvCharger"("listRank" DESC, "id");
