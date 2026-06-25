-- CreateTable
CREATE TABLE "JeonseGuaranteeProduct" (
    "grntDvcd" TEXT NOT NULL,
    "rcmdProdNm" TEXT NOT NULL,
    "rcmdGrntProdDvcd" TEXT,
    "grntReqTrgtDvcd" TEXT,
    "reqTrgtCont" TEXT,
    "exptGrfeRateCont" TEXT,
    "intSprtCont" TEXT,
    "grntPrmeCont" TEXT,
    "rentGrntMaxLoanLmtRate" DOUBLE PRECISION,
    "maxLoanLmtAmt" INTEGER,
    "trtBankCont" TEXT,
    "guidUrl" TEXT,
    "rawJson" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JeonseGuaranteeProduct_pkey" PRIMARY KEY ("grntDvcd")
);

-- CreateTable
CREATE TABLE "JeonseRegionLimit" (
    "id" BIGSERIAL NOT NULL,
    "grntDvcd" TEXT NOT NULL,
    "trgtLwdgCd" TEXT NOT NULL,
    "maxRentGrntAmt" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JeonseRegionLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JeonseGuaranteeProduct_grntReqTrgtDvcd_idx" ON "JeonseGuaranteeProduct"("grntReqTrgtDvcd");

-- CreateIndex
CREATE UNIQUE INDEX "JeonseRegionLimit_grntDvcd_trgtLwdgCd_key" ON "JeonseRegionLimit"("grntDvcd", "trgtLwdgCd");

-- CreateIndex
CREATE INDEX "JeonseRegionLimit_trgtLwdgCd_idx" ON "JeonseRegionLimit"("trgtLwdgCd");

-- Enable Row-Level Security (new public tables). App uses the `postgres` role
-- (BYPASSRLS) via Prisma; enabling RLS with no policy denies anon/authenticated
-- Supabase Data API access. Mirrors 20260617000000_enable_rls_public_tables.
ALTER TABLE "JeonseGuaranteeProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JeonseRegionLimit" ENABLE ROW LEVEL SECURITY;
