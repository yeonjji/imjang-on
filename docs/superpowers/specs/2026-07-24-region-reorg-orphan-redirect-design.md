# 폐지지역 구 URL → 신 URL 301 리다이렉트 (T4b, 삭제 없음)

작성 2026-07-24. 2026-07-01 행정구역 개편 마이그레이션의 후속(T4b). 선행: [[2026-07-23-region-reorg-2026jul-migration-design]].

## 목표

MOLIT/NEIS가 구 코드 데이터를 신 코드로 소급 재매핑하면서, 우리 DB에 **구 폐지지역(인천 중구·동구·서구, 광주, 전남)의 redundant property/school 레코드**가 남았다. 이들은 신 레코드와 **중복 콘텐츠**(같은 아파트가 `/apt/[구id]`·`/apt/[신id]` 두 페이지)라 SEO에 해롭다.

**방식 A(확정): 삭제하지 않고 구 페이지를 신 페이지로 301 영구 리다이렉트.** 데이터는 보존(FK·되돌리기 안전), 중복 콘텐츠만 해소.

**성공 기준**
- 구 폐지지역 property `/apt|/villa|/officetel/[구id]` → 신 `/…/[신id]` **308 영구 리다이렉트**
- 색인 신호가 신 URL로 통합, 중복 콘텐츠 제거
- 기존 데이터 삭제 0, FK 무손상

## 범위 (조사 확정 수치)

| 대상 | 수 | 처리 |
|---|--:|---|
| 구 폐지지역 Property | 11,029 | redirectToId 설정 → 301 |
| 구 폐지지역 Transaction | 494,161 | **유지**(URL 없음, 폐지지역이라 nav·집계서 제외됨) |
| 구 광주전남 School | 1,210 | (2차) redirectToId 설정 → 301 |
| 구 childcare 스트래글러 | 14 | 무시(폐업분 추정, 미미) |

FK 분리 검증 완료: 구prop↔신tx=0, 신prop↔구tx=0. 크로스워크 가능성: 구 전남 property 3,142개 **전부** 신에 이름+타입 매칭.

## 스키마 변경

`Property`에 자기참조 nullable FK 추가:
```prisma
model Property {
  ...
  redirectToId BigInt?    @db.BigInt
  redirectTo   Property?  @relation("PropertyRedirect", fields: [redirectToId], references: [id])
  redirectedFrom Property[] @relation("PropertyRedirect")
  @@index([redirectToId])
}
```
- `redirectToId != null` = 이 property는 폐지지역 구 레코드이며 해당 신 property로 301한다.
- 마이그레이션: 컬럼 + 인덱스 추가(데이터 변경 없음). **⚠️ 배포 전 `prisma migrate deploy` 온박스 필요**([[project_vercel_migration_deploy_gap]] 참고 — 새 마이그레이션은 배포가 자동 적용하나 순서 확인).
- (2차) `School.redirectToId`도 동일 패턴.

## 페이지 리다이렉트 로직

`app/(public)/apt/[id]/page.tsx`(및 villa·officetel)에서 property 로드 직후:
```ts
if (property.redirectToId) permanentRedirect(propertyPath(property.propertyType, property.redirectToId));
```
- 크로스워크가 동일 propertyType으로만 매칭하므로 경로 prefix(`/apt` 등) 동일.
- 메타데이터 생성보다 먼저 리다이렉트(불필요 렌더 회피).
- (2차) `/school/[sigunguCode]/[id]`도 `school.redirectToId` 있으면 `permanentRedirect(/school/[신sigunguCode]/[신id])`.

## 크로스워크 알고리즘 (구 → 신 매핑)

`scripts/ops/populate-property-redirects.ts` (신규, 온박스 실행):
1. 구 property 조회: `regionCode` prefix ∈ {2811,2814,2826,29,46} (폐지 sigungu).
2. 각 구 property에 대해 신 property 후보 찾기:
   - **1차 키: `nameNorm` + `propertyType` 동일** + `regionCode`가 신 코드(2812·2815·2827·2829·12 prefix)
   - **위치 근접으로 중복 해소**: 후보 여럿이면 구 property의 `location`과 가장 가까운(예: 200m 이내) 신 property 채택. (같은 건물 = MOLIT가 같은 주소로 재서빙 → 좌표 ≈ 동일)
   - 좌표 없음(지오코딩 실패) 폴백: 이름+타입 유일하면 채택, 아니면 미매칭 리포트.
3. 매칭된 신 property id를 구 property의 `redirectToId`에 UPDATE.
4. **미매칭 구 property는 redirectToId=null 유지** → 페이지는 그대로(신 페이지 없음 = 리다이렉트 대상 없음). 미매칭 수·샘플 리포트.

멱등: 재실행 시 동일 결과(UPDATE). 삭제 없음.

## 실행 계획 (TDD)

Phase 1 — Property 301 [코드 PR]
- **T1** 스키마: `Property.redirectToId` 마이그레이션 + `prisma generate`. → verify: migrate status, 컬럼 존재
- **T2** 페이지: apt·villa·officetel 상세에 `redirectToId` 301 분기 + 단위/통합 테스트(redirectToId 있으면 permanentRedirect 호출). → verify: 테스트, lint·typecheck
- **T3** 크로스워크 스크립트 + 순수 매칭 함수 단위테스트(이름+타입+근접 선택 로직). → verify: 테스트
- PR → 머지 → 배포(마이그레이션 자동 적용 확인)

Phase 2 — 온박스 채우기 [데이터]
- **T4** `populate-property-redirects.ts` 온박스 실행(etl 컨테이너). → verify: 구 property 중 매칭율, 샘플 `/apt/[구id]` 301 확인, 미매칭 리포트 검토
- **T5** 스팟체크: 구 목포·중구 아파트 URL → 신 URL 308, 신 페이지 정상

Phase 3 — School 301 (2차, 선택) — 위 패턴을 School에 반복(1,210건)

## 테스트
- 페이지: `redirectToId` set → `permanentRedirect` 호출(mock). null → 정상 렌더.
- 크로스워크 순수함수: 후보 다수 시 근접 우선, 좌표 없음 폴백, 미매칭 처리.
- 통합: 마이그레이션 후 컬럼 nullable·기존 행 영향 0.

## 롤백
- 스키마: 컬럼 추가라 무해(되돌리려면 컬럼 drop). 데이터: `redirectToId`는 UPDATE만 → `SET redirectToId=NULL`로 원복.
- **삭제가 없어 근본적으로 안전.**

## 범위 밖 / 후속
## ⚠️ 2026-07-24 방식 B1으로 전환 (삭제 + redirect 테이블)

**전환 사유**: 방식 A의 301은 **상세 URL만** 커버 — 리스트/검색/nearby는 구 orphan을 여전히 노출(사용자가 학교 목록에서 중복 발견). property·school 리스트 쿼리 모두 isAbolished/redirect 필터 없음. 리스트마다 필터를 다는 것보다 **구 orphan을 물리 삭제**하는 게 깨끗하다는 판단(B). 단 구 URL 색인 신호는 **`UrlRedirect` 테이블로 301 유지**(B1).

**대상**: 구 실거래 ~494K · 구 Property ~11K · 구 School(광주전남) ~1,210 · 구 Childcare 14.

**무중단 순서 (공백 없음)**:
1. **코드 배포**: `UrlRedirect` 테이블 + 페이지 로직 — 엔티티 not-found 시 `UrlRedirect` 조회해 301(없으면 404). 기존 `Property.redirectToId` 301 분기는 **유지**(삭제 전 구 행이 존재하는 동안 커버).
2. **온박스 스냅샷**: 구→신 매핑을 `UrlRedirect`에 적재 — property는 `Property.redirectToId`(이미 채워짐)에서, school은 크로스워크(`pickRedirectTarget` 재사용, name+kind+좌표근접)로.
3. **백업** 후 **삭제**: 실거래 → Property → School → Childcare(FK 순서). 삭제되는 순간 not-found → `UrlRedirect` 301이 이어받음(공백 0). 리스트에서 구 orphan 사라짐.
4. **검증**: 학교/매물 리스트 중복 0, 구 URL → 신 URL 308.

**되돌림**: 삭제 전 pg_dump 백업 → 복원 가능. `UrlRedirect`는 스냅샷이라 재생성 가능.
**주의**: `Property.redirectToId` 컬럼은 삭제 후 미사용이 되나 유지(무해, 스냅샷 소스). 리스트 필터는 불필요(구 행이 사라짐).
- childcare 스트래글러 14건: 미미, 무시.
- sitemap: 구 property는 이미 폐지지역이라 sitemap 제외(getAllSigungus isAbolished 필터). 추가 작업 불요.
