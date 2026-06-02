# 병원·약국 데이터 수집 및 DB 설계

**날짜:** 2026-06-02  
**범위:** 전국 병의원 및 약국 현황 (2026.3) ZIP 파일 → PostgreSQL 적재

---

## 1. 데이터 소스

| 파일 | 행 수 | 용도 |
|------|-------|------|
| 1. 병원정보서비스.xlsx | 79,562 | Hospital 기본정보 |
| 2. 약국정보서비스.xlsx | 25,688 | Pharmacy 기본정보 |
| 3. 시설정보.xlsx | 105,250 | 병상수·설립구분 (1:1) |
| 4. 세부정보.xlsx | 25,015 | 진료시간·응급실·주차 (1:1) |
| 5. 진료과목정보.xlsx | 433,337 | 진료과목 (M:N) |
| 6. 교통정보.xlsx | 40,525 | 교통편 (M:N) |
| 7. 의료장비정보.xlsx | 62,783 | 의료장비 (M:N) |
| 8. 식대가산정보.xlsx | 15,664 | 식대가산 (M:N) |
| 9. 간호등급정보.xlsx | 13,166 | 간호등급 (M:N) |
| 10. 특수진료정보.xlsx | 64,629 | 특수진료 검색코드 (M:N) |
| 11. 전문병원지정분야.xlsx | 110 | 전문병원 지정 (M:N) |
| 12. 기타인력정보.xlsx | 43,965 | 기타 인력 (M:N) |

**공통 PK:** `암호화요양기호` → `sourceId` (VarChar(100))  
**좌표:** 파일1·2의 `좌표(X)` = 경도(lng), `좌표(Y)` = 위도(lat) → `geography(Point,4326)`  
**시군구코드:** 건강보험 6자리 코드 (행정구역 5자리 코드와 다름, Region 테이블과 직접 join 불가)

---

## 2. Prisma 스키마

### Hospital
```prisma
model Hospital {
  id          BigInt    @id @default(autoincrement())
  sourceId    String    @unique @db.VarChar(100)
  name        String    @db.VarChar(100)
  typeCode    String    @db.VarChar(10)
  typeName    String    @db.VarChar(40)

  sido         String?  @db.VarChar(20)
  sigungu      String?  @db.VarChar(40)
  sigunguCode  String?  @db.VarChar(10)
  eupmyeondong String?  @db.VarChar(40)
  zipcode      String?  @db.VarChar(10)
  address      String   @db.VarChar(300)
  tel          String?  @db.VarChar(30)
  homepage     String?  @db.VarChar(200)
  openedAt     DateTime? @db.Date

  totalDoctors     Int?
  drMedGeneral     Int?
  drMedIntern      Int?
  drMedResident    Int?
  drMedSpecialist  Int?
  drDentGeneral    Int?
  drDentIntern     Int?
  drDentResident   Int?
  drDentSpecialist Int?
  drKorGeneral     Int?
  drKorIntern      Int?
  drKorResident    Int?
  drKorSpecialist  Int?
  midwifeCount     Int?

  location  Unsupported("geography(Point,4326)")?
  updatedAt DateTime @updatedAt

  facility         HospitalFacility?
  detail           HospitalDetail?
  depts            HospitalDept[]
  transits         HospitalTransit[]
  equipment        HospitalEquipment[]
  mealSurcharges   HospitalMealSurcharge[]
  nursingGrades    HospitalNursingGrade[]
  specialTreatments HospitalSpecialTreatment[]
  specialties      HospitalSpecialty[]
  staff            HospitalStaff[]

  @@index([typeCode])
  @@index([sigunguCode])
  @@index([sigunguCode, typeCode])
}
```

### HospitalFacility (파일3, 1:1)
```prisma
model HospitalFacility {
  id         BigInt   @id @default(autoincrement())
  hospitalId BigInt   @unique
  hospital   Hospital @relation(fields: [hospitalId], references: [id], onDelete: Cascade)

  foundTypeCode String? @db.VarChar(5)
  foundTypeName String? @db.VarChar(20)

  generalBedPremium       Int?
  generalBedNormal        Int?
  icuAdultBed             Int?
  icuPediatricBed         Int?
  icuNeonatalBed          Int?
  deliveryBed             Int?
  operatingRoomBed        Int?
  erBed                   Int?
  physicalTherapyBed      Int?
  psychiatryClosedPremium Int?
  psychiatryClosedNormal  Int?
  psychiatryOpenPremium   Int?
  psychiatryOpenNormal    Int?
  isolationBed            Int?
  sterileRoomBed          Int?

  updatedAt DateTime @updatedAt
}
```

### HospitalDetail (파일4, 1:1)
```prisma
model HospitalDetail {
  id         BigInt   @id @default(autoincrement())
  hospitalId BigInt   @unique
  hospital   Hospital @relation(fields: [hospitalId], references: [id], onDelete: Cascade)

  locationBuilding  String? @db.VarChar(100)
  locationDirection String? @db.VarChar(100)
  locationDistance  String? @db.VarChar(50)

  parkingCapacity Int?
  parkingFee      String? @db.VarChar(4)
  parkingNote     String? @db.Text

  closedSunday  String? @db.VarChar(100)
  closedHoliday String? @db.VarChar(100)

  erDayOpen   String? @db.VarChar(4)
  erDayTel1   String? @db.VarChar(30)
  erDayTel2   String? @db.VarChar(30)
  erNightOpen String? @db.VarChar(4)
  erNightTel1 String? @db.VarChar(30)
  erNightTel2 String? @db.VarChar(30)

  lunchWeekday  String? @db.VarChar(50)
  lunchSaturday String? @db.VarChar(50)

  receptionWeekday  String? @db.VarChar(50)
  receptionSaturday String? @db.VarChar(50)

  // 진료시간: HHMM 정수 (예: 900 = 09:00, 1800 = 18:00)
  openSun  Int?
  closeSun Int?
  openMon  Int?
  closeMon Int?
  openTue  Int?
  closeTue Int?
  openWed  Int?
  closeWed Int?
  openThu  Int?
  closeThu Int?
  openFri  Int?
  closeFri Int?
  openSat  Int?
  closeSat Int?

  updatedAt DateTime @updatedAt
}
```

### HospitalDept (파일5, M:N)
```prisma
model HospitalDept {
  id         BigInt   @id @default(autoincrement())
  hospitalId BigInt
  hospital   Hospital @relation(fields: [hospitalId], references: [id], onDelete: Cascade)
  deptCode   String   @db.VarChar(10)
  deptName   String   @db.VarChar(40)
  specialistCount     Int?
  optionalDoctorCount Int?

  @@unique([hospitalId, deptCode])
  @@index([hospitalId])
  @@index([deptCode])
}
```

### HospitalTransit (파일6, M:N)
```prisma
model HospitalTransit {
  id         BigInt   @id @default(autoincrement())
  hospitalId BigInt
  hospital   Hospital @relation(fields: [hospitalId], references: [id], onDelete: Cascade)
  transitName  String? @db.VarChar(50)
  routeNumber  String? @db.VarChar(30)
  stopPoint    String? @db.VarChar(100)
  direction    String? @db.VarChar(100)
  distance     String? @db.VarChar(50)
  note         String? @db.VarChar(200)

  @@index([hospitalId])
}
```

### HospitalEquipment (파일7, M:N)
```prisma
model HospitalEquipment {
  id         BigInt   @id @default(autoincrement())
  hospitalId BigInt
  hospital   Hospital @relation(fields: [hospitalId], references: [id], onDelete: Cascade)
  equipCode  String   @db.VarChar(20)
  equipName  String   @db.VarChar(60)
  equipCount Int?

  @@unique([hospitalId, equipCode])
  @@index([hospitalId])
}
```

### HospitalMealSurcharge (파일8, M:N)
```prisma
model HospitalMealSurcharge {
  id         BigInt   @id @default(autoincrement())
  hospitalId BigInt
  hospital   Hospital @relation(fields: [hospitalId], references: [id], onDelete: Cascade)
  typeCode      String  @db.VarChar(10)
  typeName      String  @db.VarChar(40)
  hasGeneral    String? @db.VarChar(4)
  staffCount    Int?
  treatmentGrade String? @db.VarChar(10)

  @@unique([hospitalId, typeCode])
  @@index([hospitalId])
}
```

### HospitalNursingGrade (파일9, M:N)
```prisma
model HospitalNursingGrade {
  id         BigInt   @id @default(autoincrement())
  hospitalId BigInt
  hospital   Hospital @relation(fields: [hospitalId], references: [id], onDelete: Cascade)
  typeCode     String  @db.VarChar(10)
  typeName     String  @db.VarChar(40)
  nursingGrade String? @db.VarChar(10)

  @@unique([hospitalId, typeCode])
  @@index([hospitalId])
}
```

### HospitalSpecialTreatment (파일10, M:N)
```prisma
model HospitalSpecialTreatment {
  id         BigInt   @id @default(autoincrement())
  hospitalId BigInt
  hospital   Hospital @relation(fields: [hospitalId], references: [id], onDelete: Cascade)
  searchCode String   @db.VarChar(20)
  searchName String   @db.VarChar(60)

  @@unique([hospitalId, searchCode])
  @@index([hospitalId])
}
```

### HospitalSpecialty (파일11, M:N)
```prisma
model HospitalSpecialty {
  id         BigInt   @id @default(autoincrement())
  hospitalId BigInt
  hospital   Hospital @relation(fields: [hospitalId], references: [id], onDelete: Cascade)
  searchCode String   @db.VarChar(20)
  searchName String   @db.VarChar(60)

  @@unique([hospitalId, searchCode])
  @@index([hospitalId])
}
```

### HospitalStaff (파일12, M:N)
```prisma
model HospitalStaff {
  id         BigInt   @id @default(autoincrement())
  hospitalId BigInt
  hospital   Hospital @relation(fields: [hospitalId], references: [id], onDelete: Cascade)
  staffCode  String   @db.VarChar(20)
  staffName  String   @db.VarChar(60)
  staffCount Int?

  @@unique([hospitalId, staffCode])
  @@index([hospitalId])
}
```

### Pharmacy
```prisma
model Pharmacy {
  id          BigInt    @id @default(autoincrement())
  sourceId    String    @unique @db.VarChar(100)
  name        String    @db.VarChar(100)
  typeCode    String?   @db.VarChar(10)
  typeName    String?   @db.VarChar(20)

  sido         String?  @db.VarChar(20)
  sigungu      String?  @db.VarChar(40)
  sigunguCode  String?  @db.VarChar(10)
  eupmyeondong String?  @db.VarChar(40)
  zipcode      String?  @db.VarChar(10)
  address      String   @db.VarChar(300)
  tel          String?  @db.VarChar(30)
  openedAt     DateTime? @db.Date

  location  Unsupported("geography(Point,4326)")?
  updatedAt DateTime @updatedAt

  @@index([sigunguCode])
}
```

---

## 3. 적재 전략

### 순서
1. `Hospital` 적재 (파일1) — sourceId 기준 upsert
2. `HospitalFacility` (파일3) — hospitalId FK, upsert
3. `HospitalDetail` (파일4) — hospitalId FK, upsert
4. `HospitalDept` (파일5) — delete-then-insert per hospital
5. `HospitalTransit` (파일6) — delete-then-insert per hospital
6. `HospitalEquipment` (파일7) — upsert on (hospitalId, equipCode)
7. `HospitalMealSurcharge` (파일8) — upsert on (hospitalId, typeCode)
8. `HospitalNursingGrade` (파일9) — upsert on (hospitalId, typeCode)
9. `HospitalSpecialTreatment` (파일10) — upsert on (hospitalId, searchCode)
10. `HospitalSpecialty` (파일11) — upsert on (hospitalId, searchCode)
11. `HospitalStaff` (파일12) — upsert on (hospitalId, staffCode)
12. `Pharmacy` (파일2) — sourceId 기준 upsert

### 스크립트 위치
`scripts/ingest-hospital.ts`, `scripts/ingest-pharmacy.ts`

기존 스크립트 패턴(Park, School, Childcare 등) 동일하게 적용:
- xlsx → row 파싱 → batch upsert (1000건 단위)
- `IngestionRun` 테이블에 실행 기록
- 좌표는 `ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography` 변환

### 주의사항
- 파일3 행 수(105,250)가 파일1(79,562)보다 많음 → Hospital에 없는 sourceId는 skip
- 시군구코드는 건강보험 6자리 코드로 저장 (Region 테이블과 join 불가)
- 진료시간은 HHMM 정수로 저장 (0 = 미운영, null = 데이터 없음 구분 필요)

---

## 4. 파일 위치 (적재 시 참조)
```
/Users/jiyeonjeong/Downloads/전국 병의원 및 약국 현황 2026.3.zip
  └─ 전국 병의원 및 약국 현황 2026.3/
       ├─ 1.병원정보서비스(2026.3.).xlsx
       ├─ 2.약국정보서비스(2026.3.).xlsx
       ├─ 3~12 ...
```
