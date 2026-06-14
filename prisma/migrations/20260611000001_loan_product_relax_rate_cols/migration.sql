-- AlterTable: 금리 텍스트가 설명형이라 길이 제한 제거(VarChar → text)
ALTER TABLE "LoanProduct" ALTER COLUMN "irt" SET DATA TYPE TEXT;
ALTER TABLE "LoanProduct" ALTER COLUMN "irtCtg" SET DATA TYPE TEXT;
