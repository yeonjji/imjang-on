-- 방식 B1: 폐지지역 orphan 삭제 후에도 구 URL → 신 URL 301 유지용 매핑
-- CreateTable
CREATE TABLE "UrlRedirect" (
    "kind" VARCHAR(12) NOT NULL,
    "fromId" BIGINT NOT NULL,
    "toPath" VARCHAR(120) NOT NULL,

    CONSTRAINT "UrlRedirect_pkey" PRIMARY KEY ("kind","fromId")
);
