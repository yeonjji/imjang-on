-- CreateTable
CREATE TABLE "HospitalNemcHours" (
    "hospitalId" BIGINT NOT NULL,
    "hpid" VARCHAR(20) NOT NULL,
    "openMon" INTEGER,
    "closeMon" INTEGER,
    "openTue" INTEGER,
    "closeTue" INTEGER,
    "openWed" INTEGER,
    "closeWed" INTEGER,
    "openThu" INTEGER,
    "closeThu" INTEGER,
    "openFri" INTEGER,
    "closeFri" INTEGER,
    "openSat" INTEGER,
    "closeSat" INTEGER,
    "openSun" INTEGER,
    "closeSun" INTEGER,
    "openHol" INTEGER,
    "closeHol" INTEGER,
    "note" VARCHAR(300),
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalNemcHours_pkey" PRIMARY KEY ("hospitalId")
);

-- AddForeignKey
ALTER TABLE "HospitalNemcHours" ADD CONSTRAINT "HospitalNemcHours_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

