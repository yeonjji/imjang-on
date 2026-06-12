# SEO Title/Description CTR 개선 — 설계

작성일: 2026-06-12

## 목표
검색 노출(중복 메타 해소·키워드)과 클릭률(CTR)을 높이도록 전 페이지의 `title`/`description`을 개선한다.

## 제약 (브랜드 톤)
`PRODUCT.md`/`CLAUDE.md`의 원칙을 지킨다: **과장 금지, 조용한 정보 안내자, 안티레퍼런스=자극적 부동산 광고.**
→ CTR 톤은 **"정보형 + 수치"** 로 한정. 의문형·과장·클릭베이트 금지.

## CTR 레버 (정보형+수치)
1. 숫자 front-load (가격·세대수·거래건수 등 구체 수치)
2. 최신성 신호 (`최근 1년`, 허브는 `매일 업데이트`)
3. 신뢰 신호 (`공공데이터`)
4. 가벼운 행동유도 (`확인하세요`)
5. 잘림 방지 (title은 깔끔하게, 수치는 description으로)
6. **상세별 고유 특징**을 맨 앞에 — 중복 메타 해소 + "이 페이지에 내가 찾는 정보가 있다" 신호

## 데이터 정책 (Tier)
- **Tier 1 (기본)**: `getXById` 한 번이 **이미 반환하는 필드만** 사용 → generateMetadata에 추가 쿼리 없음.
- **Tier 2 (예외 승인됨)**: `region/[code]` 상세는 단지수·거래수 노출을 위해 generateMetadata에 `getRegionStats` 1쿼리 추가.

공통 규칙: title 템플릿 `%s | 임장온` 자동 부착(아래 표기는 부착 전). description은 누락 필드를 **조건부로 제외**(빈 토큰·앞공백·`-` 금지). 목표 길이 description ≤ 약 80자(한글).

---

## 페이지별 기준

### 매물 상세 — apt / officetel / villa
- **title**: `{단지명} 실거래가 · {시군구}`
- **desc[데이터有]**: `{명} 매매 {매매가}·전세 {전세가}(전세가율 {N}%). {준공}년 준공 {세대}세대, {지역fullName} 실거래가를 공공데이터로 확인하세요.`
- **desc[데이터부족]**: `{명} {유형} 실거래가. {지역fullName} 단지 정보와 매매·전세 시세를 공공데이터로 확인하세요. (최근 1년 신고 거래는 아직 적습니다.)`
- 필드(getPropertyById): name·region(fullName/sigungu)·builtYear·households·saleAvgPrice12m·jeonseAvgDeposit12m·txCount12m. 전세가율 = 전세/매매. 유형: 아파트/오피스텔/연립·다세대.
- 가격·전세가율·준공·세대수는 **있을 때만** 각각 조립.
- 3개 페이지 공통이므로 `lib/seo/blurb.ts`에 `propertyMetaDescription()` 헬퍼로 분리.

### 지역 — region/[code]  (Tier 2)
- **title**: `{지역fullName} 아파트 실거래가·시세`
- **desc**: `{지역} 아파트 {단지수}개 단지·최근 1년 {거래수}건 실거래. 매매·전세·월세 시세와 거래 많은 단지를 공공데이터로 확인하세요.`
- generateMetadata에 `getRegionStats(sigunguCode)` 추가. 단지수/거래수 0이면 일반 문구로 폴백.

### 청약 — subscription/[id]
- **title**: `{공고명} 청약 · {카테고리}`
- **desc**: `{지역 }{공고명} 청약, {공급}세대 공급. 접수 일정·주택형별 분양가와 주변 단지 시세를 한눈에 확인하세요.`
- 필드: name·regionName·totalSupply·category. regionName/ totalSupply 없으면 해당 토큰 제외.

### 금융 — finance/[seq]
- **title**: `{상품명} 한도·금리 — 주거금융`
- **desc**: `{제공기관 }{상품명} 한도 {한도}만원{, 대상태그}. 금리·자격요건·신청방법을 한눈에 확인하세요.`
- 필드: finprdnm·ofrinstnm·lnlmt·targetTags. ofrinstnm/lnlmt/targetTags 조건부. irt(금리)는 장문이라 title 키워드로만.

### 학교 — school/[..]/[id]
- **title**: `{학교명} — {학교급} 정보·주변 아파트`
- **desc**: `{학교명}({설립유형}·{공학유형}) {학교급} 정보와 도보권 아파트 실거래가. {지역} 배정·통학 정보를 공공데이터로 확인하세요.`
- 필드: name·schoolKind·foundType·coeduType·region.

### 병원 — medical/hospital/[..]/[id]
- **title**: `{병원명} — {종별} 정보·주변 아파트`
- **desc**: `{병원명} {종별}{, 의사 {N}명}. 진료·시설·교통 정보와 도보권 아파트 실거래가를 함께 확인하세요.`
- 필드: name·typeName·totalDoctors(있을 때만). 진료과 수 필드는 없음.

### 어린이집 — childcare/[..]/[id]
- **title**: `{시설명} — {유형} 정원 {정원}`
- **desc**: `{시설명}({유형}) 정원 {정원}명·현원 {현원}명·교직원 {교직원}명. 도보권 아파트 실거래가와 보육정보를 한눈에.`
- 필드: name·crType·capacity·currentCount·staffCount(각 조건부).

### 약국 — medical/pharmacy/[..]/[id]
- **title**: `{약국명} — 약국 정보·주변 아파트`
- **desc**: `{약국명} 위치·연락처와 도보권 아파트 실거래가. {지역} 주변 생활 인프라를 한눈에 확인하세요.`
- distinctive 필드가 적어 위치·인프라 후크 중심.

### 상권/도시인프라 — amenity·urban·charger 상세
- **title**: `{명} — {카테고리} 정보·주변 아파트` (charger: 전기차충전소)
- **desc**: `{명} {카테고리} 정보와 도보권 아파트 실거래가. {지역} 주변 시세를 공공데이터로 확인하세요.` (charger는 "실시간 충전기 현황" 후크 유지)

### 허브/정적 (고정 텍스트 교체)
- `/` : `아파트·오피스텔·빌라 실거래가부터 청약·학군·생활편의까지. 공공데이터로 보는 전국 부동산 시세를 한 곳에서 확인하세요.`
- `/apt` : `전국 아파트 매매·전세·월세 실거래가를 단지별로. 평균 시세·거래량·최근 거래 흐름을 공공데이터로 매일 업데이트.`
- `/officetel` : `전국 오피스텔 매매·전세·월세 실거래가. 단지별 시세·거래량을 공공데이터로 한눈에.`
- `/villa` : `전국 연립·다세대 매매·전세·월세 실거래가. 단지별 시세·거래량을 공공데이터로 한눈에.`
- `/medical/pharmacy` : `전국 시·군·구별 약국 위치·연락처를 찾고, 주변 아파트 실거래가까지 함께 확인하세요.`
- `/medical/hospital` : `전국 시·군·구별 병원·의원·종합병원 진료·위치 정보와 주변 아파트 실거래가를 한눈에.`
- `/childcare/regions` : `전국 시·도·시군구별 어린이집 분포를 보고 우리 동네 국공립·민간·가정 어린이집을 찾아보세요.`
- 나머지 허브(life·school·childcare·region·school/regions)·법적 페이지: 현행 유지.

---

## 구현 노트
- description 조립은 **부분 배열 → 조건부 push → join** 패턴으로 빈 토큰/앞공백/`-` 노출 방지.
- 매물은 `propertyMetaDescription()` 공통 헬퍼(`lib/seo/blurb.ts`)로 DRY (apt/officetel/villa 재사용).
- 검증: `tsc --noEmit` 0 errors, `next lint` clean. 가능하면 헬퍼 단위 테스트(빈 데이터/풀데이터 분기) 추가.

## 범위 밖
- robots.txt allow 리스트 (동작 무변화 — 제외).
- OG 이미지/JSON-LD (이미 별도 작업 완료).
- amenity/urban 상세 sitemap 등재 (thin-page, 의도적 제외 유지).
