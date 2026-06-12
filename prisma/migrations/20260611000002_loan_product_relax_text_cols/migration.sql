-- AlterTable: 자유 텍스트 컬럼 길이 제한 제거(VarChar → text). 한 값 초과가 전체 스냅샷 적재를 막는 위험 회피.
ALTER TABLE "LoanProduct" ALTER COLUMN "finprdnm" SET DATA TYPE TEXT;
ALTER TABLE "LoanProduct" ALTER COLUMN "ofrinstnm" SET DATA TYPE TEXT;
ALTER TABLE "LoanProduct" ALTER COLUMN "instCtg" SET DATA TYPE TEXT;
