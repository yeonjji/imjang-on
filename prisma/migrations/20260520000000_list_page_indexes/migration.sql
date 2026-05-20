-- AddIndex: list page filter and sort indexes for Property

-- 거래유형 + 정렬용
CREATE INDEX "Property_propertyType_saleLastAt_idx" ON "Property"("propertyType", "saleLastAt" DESC);
CREATE INDEX "Property_propertyType_saleCount12m_idx" ON "Property"("propertyType", "saleCount12m" DESC);
CREATE INDEX "Property_propertyType_jeonseLastAt_idx" ON "Property"("propertyType", "jeonseLastAt" DESC);
CREATE INDEX "Property_propertyType_jeonseCount12m_idx" ON "Property"("propertyType", "jeonseCount12m" DESC);
CREATE INDEX "Property_propertyType_wolseLastAt_idx" ON "Property"("propertyType", "wolseLastAt" DESC);
CREATE INDEX "Property_propertyType_wolseCount12m_idx" ON "Property"("propertyType", "wolseCount12m" DESC);

-- 가격대 필터용
CREATE INDEX "Property_propertyType_saleAvgPrice12m_idx" ON "Property"("propertyType", "saleAvgPrice12m");
CREATE INDEX "Property_propertyType_jeonseAvgDeposit12m_idx" ON "Property"("propertyType", "jeonseAvgDeposit12m");
CREATE INDEX "Property_propertyType_wolseAvgDeposit12m_idx" ON "Property"("propertyType", "wolseAvgDeposit12m");
