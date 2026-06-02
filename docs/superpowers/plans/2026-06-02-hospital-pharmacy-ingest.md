# Hospital & Pharmacy Data Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로컬 xlsx 파일(전국 병의원 및 약국 현황 2026.3)을 파싱해 Hospital 12개 테이블과 Pharmacy 테이블에 batch upsert한다.

**Architecture:** 기존 amenity 패턴(adapter 파싱 → runner raw SQL upsert) 동일하게 따름. xlsx 파일은 로컬 디렉토리에서 읽음. Hospital용 standalone 스크립트(`scripts/ingest-hospital.ts`)와 Pharmacy용(`scripts/ingest-pharmacy.ts`)을 별도로 작성.

**Tech Stack:** SheetJS(`xlsx`), Prisma raw SQL, vitest, tsx

---

## 데이터 파일 위치

```
/Users/jiyeonjeong/Downloads/전국 병의원 및 약국 현황 2026.3/
  1.병원정보서비스(2026.3.).xlsx          # Hospital 기본 (79,562행)
  2.약국정보서비스(2026.3.).xlsx          # Pharmacy (25,688행)
  3.의료기관별상세정보서비스_01_시설정보.xlsx   # HospitalFacility (105,250행)
  4.의료기관별상세정보서비스_02_세부정보.xlsx   # HospitalDetail (25,015행)
  5.의료기관별상세정보서비스_03_진료과목정보.xlsx # HospitalDept (433,337행)
  6.의료기관별상세정보서비스_04_교통정보.xlsx   # HospitalTransit (40,525행)
  7.의료기관별상세정보서비스_05_의료장비정보.xlsx # HospitalEquipment (62,783행)
  8.의료기관별상세정보서비스_06_식대가산정보.xlsx # HospitalMealSurcharge (15,664행)
  9.의료기관별상세정보서비스_07_간호등급정보.xlsx # HospitalNursingGrade (13,166행)
  10.의료기관별상세정보서비스_08_특수진료정보서비스.xlsx # HospitalSpecialTreatment (64,629행)
  11.의료기관별상세정보서비스_09_전문병원지정분야.xlsx  # HospitalSpecialty (110행)
  12.의료기관별상세정보서비스_10_기타인력정보.xlsx     # HospitalStaff (43,965행)
```

## 파일 구조

| 파일 | 역할 |
|------|------|
| `prisma/schema.prisma` | 12개 모델 추가 |
| `scripts/ingest/amenities/types.ts` | Normalized 타입 추가 |
| `scripts/ingest/amenities/xlsx-parse.ts` (신규) | xlsx → rows 유틸 |
| `scripts/ingest/amenities/adapter-hospital.ts` (신규) | 파일1,3~12 parse 함수들 |
| `scripts/ingest/amenities/adapter-pharmacy.ts` (신규) | 파일2 parse 함수 |
| `scripts/ingest-hospital.ts` (신규) | DB write + runner |
| `scripts/ingest-pharmacy.ts` (신규) | DB write + runner |
| `tests/ingest/amenities/adapter-hospital.test.ts` (신규) | parse 함수 테스트 |
| `tests/ingest/amenities/adapter-pharmacy.test.ts` (신규) | parse 함수 테스트 |

---

## Task 1: xlsx 라이브러리 설치 + Prisma 스키마 추가 + 마이그레이션

**Files:**
- Modify: `package.json` (dependency 추가)
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: xlsx 설치**

```bash
pnpm add xlsx
```

Expected: `node_modules/xlsx` 생성됨

- [ ] **Step 2: schema.prisma에 12개 모델 추가**

`prisma/schema.prisma` 맨 끝에 아래 내용을 추가:

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
  facility          HospitalFacility?
  detail            HospitalDetail?
  depts             HospitalDept[]
  transits          HospitalTransit[]
  equipment         HospitalEquipment[]
  mealSurcharges    HospitalMealSurcharge[]
  nursingGrades     HospitalNursingGrade[]
  specialTreatments HospitalSpecialTreatment[]
  specialties       HospitalSpecialty[]
  staff             HospitalStaff[]
  @@index([typeCode])
  @@index([sigunguCode])
  @@index([sigunguCode, typeCode])
}

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

model HospitalMealSurcharge {
  id         BigInt   @id @default(autoincrement())
  hospitalId BigInt
  hospital   Hospital @relation(fields: [hospitalId], references: [id], onDelete: Cascade)
  typeCode       String  @db.VarChar(10)
  typeName       String  @db.VarChar(40)
  hasGeneral     String? @db.VarChar(4)
  staffCount     Int?
  treatmentGrade String? @db.VarChar(10)
  @@unique([hospitalId, typeCode])
  @@index([hospitalId])
}

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

model HospitalSpecialTreatment {
  id         BigInt   @id @default(autoincrement())
  hospitalId BigInt
  hospital   Hospital @relation(fields: [hospitalId], references: [id], onDelete: Cascade)
  searchCode String   @db.VarChar(20)
  searchName String   @db.VarChar(60)
  @@unique([hospitalId, searchCode])
  @@index([hospitalId])
}

model HospitalSpecialty {
  id         BigInt   @id @default(autoincrement())
  hospitalId BigInt
  hospital   Hospital @relation(fields: [hospitalId], references: [id], onDelete: Cascade)
  searchCode String   @db.VarChar(20)
  searchName String   @db.VarChar(60)
  @@unique([hospitalId, searchCode])
  @@index([hospitalId])
}

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

- [ ] **Step 3: 마이그레이션 생성 및 적용**

```bash
pnpm prisma migrate dev --name add_hospital_pharmacy
```

Expected: `prisma/migrations/..._add_hospital_pharmacy/migration.sql` 생성 후 DB에 적용됨

- [ ] **Step 4: Prisma 클라이언트 재생성 확인**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: 타입 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations package.json pnpm-lock.yaml
git commit -m "feat(hospital): Prisma 스키마 12개 모델 추가 + xlsx 의존성"
```

---

## Task 2: Normalized 타입 추가

**Files:**
- Modify: `scripts/ingest/amenities/types.ts`

- [ ] **Step 1: types.ts에 타입 추가**

`scripts/ingest/amenities/types.ts`의 `AmenitySourceKey` 정의 앞에 아래 인터페이스들을 추가:

```typescript
export interface NormalizedHospital {
  sourceId: string;
  name: string;
  typeCode: string;
  typeName: string;
  sido: string | null;
  sigungu: string | null;
  sigunguCode: string | null;
  eupmyeondong: string | null;
  zipcode: string | null;
  address: string;
  tel: string | null;
  homepage: string | null;
  openedAt: Date | null;
  totalDoctors: number | null;
  drMedGeneral: number | null;
  drMedIntern: number | null;
  drMedResident: number | null;
  drMedSpecialist: number | null;
  drDentGeneral: number | null;
  drDentIntern: number | null;
  drDentResident: number | null;
  drDentSpecialist: number | null;
  drKorGeneral: number | null;
  drKorIntern: number | null;
  drKorResident: number | null;
  drKorSpecialist: number | null;
  midwifeCount: number | null;
  lat: number | null;
  lng: number | null;
}

export interface NormalizedHospitalFacility {
  hospitalSourceId: string;
  foundTypeCode: string | null;
  foundTypeName: string | null;
  generalBedPremium: number | null;
  generalBedNormal: number | null;
  icuAdultBed: number | null;
  icuPediatricBed: number | null;
  icuNeonatalBed: number | null;
  deliveryBed: number | null;
  operatingRoomBed: number | null;
  erBed: number | null;
  physicalTherapyBed: number | null;
  psychiatryClosedPremium: number | null;
  psychiatryClosedNormal: number | null;
  psychiatryOpenPremium: number | null;
  psychiatryOpenNormal: number | null;
  isolationBed: number | null;
  sterileRoomBed: number | null;
}

export interface NormalizedHospitalDetail {
  hospitalSourceId: string;
  locationBuilding: string | null;
  locationDirection: string | null;
  locationDistance: string | null;
  parkingCapacity: number | null;
  parkingFee: string | null;
  parkingNote: string | null;
  closedSunday: string | null;
  closedHoliday: string | null;
  erDayOpen: string | null;
  erDayTel1: string | null;
  erDayTel2: string | null;
  erNightOpen: string | null;
  erNightTel1: string | null;
  erNightTel2: string | null;
  lunchWeekday: string | null;
  lunchSaturday: string | null;
  receptionWeekday: string | null;
  receptionSaturday: string | null;
  openSun: number | null;
  closeSun: number | null;
  openMon: number | null;
  closeMon: number | null;
  openTue: number | null;
  closeTue: number | null;
  openWed: number | null;
  closeWed: number | null;
  openThu: number | null;
  closeThu: number | null;
  openFri: number | null;
  closeFri: number | null;
  openSat: number | null;
  closeSat: number | null;
}

export interface NormalizedHospitalDept {
  hospitalSourceId: string;
  deptCode: string;
  deptName: string;
  specialistCount: number | null;
  optionalDoctorCount: number | null;
}

export interface NormalizedHospitalTransit {
  hospitalSourceId: string;
  transitName: string | null;
  routeNumber: string | null;
  stopPoint: string | null;
  direction: string | null;
  distance: string | null;
  note: string | null;
}

export interface NormalizedHospitalEquipment {
  hospitalSourceId: string;
  equipCode: string;
  equipName: string;
  equipCount: number | null;
}

export interface NormalizedHospitalMealSurcharge {
  hospitalSourceId: string;
  typeCode: string;
  typeName: string;
  hasGeneral: string | null;
  staffCount: number | null;
  treatmentGrade: string | null;
}

export interface NormalizedHospitalNursingGrade {
  hospitalSourceId: string;
  typeCode: string;
  typeName: string;
  nursingGrade: string | null;
}

export interface NormalizedHospitalSpecialTreatment {
  hospitalSourceId: string;
  searchCode: string;
  searchName: string;
}

export interface NormalizedHospitalSpecialty {
  hospitalSourceId: string;
  searchCode: string;
  searchName: string;
}

export interface NormalizedHospitalStaff {
  hospitalSourceId: string;
  staffCode: string;
  staffName: string;
  staffCount: number | null;
}

export interface NormalizedPharmacy {
  sourceId: string;
  name: string;
  typeCode: string | null;
  typeName: string | null;
  sido: string | null;
  sigungu: string | null;
  sigunguCode: string | null;
  eupmyeondong: string | null;
  zipcode: string | null;
  address: string;
  tel: string | null;
  openedAt: Date | null;
  lat: number | null;
  lng: number | null;
}
```

- [ ] **Step 2: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add scripts/ingest/amenities/types.ts
git commit -m "feat(hospital): Normalized 타입 정의 추가"
```

---

## Task 3: xlsx-parse 유틸 + adapter-hospital.ts

**Files:**
- Create: `scripts/ingest/amenities/xlsx-parse.ts`
- Create: `scripts/ingest/amenities/adapter-hospital.ts`

- [ ] **Step 1: xlsx-parse.ts 작성**

```typescript
// scripts/ingest/amenities/xlsx-parse.ts
import * as XLSX from 'xlsx';

export function readXlsxRows(filePath: string): Record<string, unknown>[] {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
}
```

- [ ] **Step 2: adapter-hospital.ts 작성**

```typescript
// scripts/ingest/amenities/adapter-hospital.ts
import type {
  NormalizedHospital,
  NormalizedHospitalFacility,
  NormalizedHospitalDetail,
  NormalizedHospitalDept,
  NormalizedHospitalTransit,
  NormalizedHospitalEquipment,
  NormalizedHospitalMealSurcharge,
  NormalizedHospitalNursingGrade,
  NormalizedHospitalSpecialTreatment,
  NormalizedHospitalSpecialty,
  NormalizedHospitalStaff,
} from './types';

function str(v: unknown): string { return String(v ?? '').trim(); }
function strOrNull(v: unknown): string | null { const s = str(v); return s || null; }
function intOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function dateOrNull(v: unknown): Date | null { return v instanceof Date ? v : null; }
function hhmm(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
function isKoreaCoord(lat: number | null, lng: number | null): boolean {
  return lat !== null && lng !== null && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}

export function parseHospitalRows(rows: Record<string, unknown>[]): NormalizedHospital[] {
  const result: NormalizedHospital[] = [];
  for (const row of rows) {
    const sourceId = str(row['암호화요양기호']);
    if (!sourceId) continue;
    const rawLng = Number(row['좌표(X)']);
    const rawLat = Number(row['좌표(Y)']);
    const lat = Number.isFinite(rawLat) && rawLat !== 0 ? rawLat : null;
    const lng = Number.isFinite(rawLng) && rawLng !== 0 ? rawLng : null;
    result.push({
      sourceId,
      name: str(row['요양기관명']),
      typeCode: str(row['종별코드']),
      typeName: str(row['종별코드명']),
      sido: strOrNull(row['시도코드명']),
      sigungu: strOrNull(row['시군구코드명']),
      sigunguCode: strOrNull(String(row['시군구코드'] ?? '')),
      eupmyeondong: strOrNull(row['읍면동']),
      zipcode: strOrNull(row['우편번호']),
      address: str(row['주소']),
      tel: strOrNull(row['전화번호']),
      homepage: strOrNull(row['병원홈페이지']),
      openedAt: dateOrNull(row['개설일자']),
      totalDoctors: intOrNull(row['총의사수']),
      drMedGeneral: intOrNull(row['의과일반의 인원수']),
      drMedIntern: intOrNull(row['의과인턴 인원수']),
      drMedResident: intOrNull(row['의과레지던트 인원수']),
      drMedSpecialist: intOrNull(row['의과전문의 인원수']),
      drDentGeneral: intOrNull(row['치과일반의 인원수']),
      drDentIntern: intOrNull(row['치과인턴 인원수']),
      drDentResident: intOrNull(row['치과레지던트 인원수']),
      drDentSpecialist: intOrNull(row['치과전문의 인원수']),
      drKorGeneral: intOrNull(row['한방일반의 인원수']),
      drKorIntern: intOrNull(row['한방인턴 인원수']),
      drKorResident: intOrNull(row['한방레지던트 인원수']),
      drKorSpecialist: intOrNull(row['한방전문의 인원수']),
      midwifeCount: intOrNull(row['조산사 인원수']),
      lat: isKoreaCoord(lat, lng) ? lat : null,
      lng: isKoreaCoord(lat, lng) ? lng : null,
    });
  }
  return result;
}

export function parseFacilityRows(rows: Record<string, unknown>[]): NormalizedHospitalFacility[] {
  const result: NormalizedHospitalFacility[] = [];
  for (const row of rows) {
    const hospitalSourceId = str(row['암호화요양기호']);
    if (!hospitalSourceId) continue;
    result.push({
      hospitalSourceId,
      foundTypeCode: strOrNull(row['설립구분코드']),
      foundTypeName: strOrNull(row['설립구분코드명']),
      generalBedPremium: intOrNull(row['일반입원실상급병상수']),
      generalBedNormal: intOrNull(row['일반입원실일반병상수']),
      icuAdultBed: intOrNull(row['성인중환자병상수']),
      icuPediatricBed: intOrNull(row['소아중환자병상수']),
      icuNeonatalBed: intOrNull(row['신생아중환자병상수']),
      deliveryBed: intOrNull(row['분만실병상수']),
      operatingRoomBed: intOrNull(row['수술실병상수']),
      erBed: intOrNull(row['응급실병상수']),
      physicalTherapyBed: intOrNull(row['물리치료실병상수']),
      psychiatryClosedPremium: intOrNull(row['정신과폐쇄상급병상수']),
      psychiatryClosedNormal: intOrNull(row['정신과폐쇄일반병상수']),
      psychiatryOpenPremium: intOrNull(row['정신과개방상급병상수']),
      psychiatryOpenNormal: intOrNull(row['정신과개방일반병상수']),
      isolationBed: intOrNull(row['격리병실병상수']),
      sterileRoomBed: intOrNull(row['무균치료실병상수']),
    });
  }
  return result;
}

export function parseDetailRows(rows: Record<string, unknown>[]): NormalizedHospitalDetail[] {
  const result: NormalizedHospitalDetail[] = [];
  for (const row of rows) {
    const hospitalSourceId = str(row['암호화요양기호']);
    if (!hospitalSourceId) continue;
    result.push({
      hospitalSourceId,
      locationBuilding: strOrNull(row['위치_공공건물(장소)명']),
      locationDirection: strOrNull(row['위치_방향']),
      locationDistance: strOrNull(row['위치_거리']),
      parkingCapacity: intOrNull(row['주차_가능대수']),
      parkingFee: strOrNull(row['주차_비용 부담여부']),
      parkingNote: strOrNull(row['주차_기타 안내사항']),
      closedSunday: strOrNull(row['휴진안내_일요일']),
      closedHoliday: strOrNull(row['휴진안내_공휴일']),
      erDayOpen: strOrNull(row['응급실_주간_운영여부']),
      erDayTel1: strOrNull(row['응급실_주간_전화번호1']),
      erDayTel2: strOrNull(row['응급실_주간_전화번호2']),
      erNightOpen: strOrNull(row['응급실_야간_운영여부']),
      erNightTel1: strOrNull(row['응급실_야간_전화번호1']),
      erNightTel2: strOrNull(row['응급실_야간_전화번호2']),
      lunchWeekday: strOrNull(row['점심시간_평일']),
      lunchSaturday: strOrNull(row['점심시간_토요일']),
      receptionWeekday: strOrNull(row['접수시간_평일']),
      receptionSaturday: strOrNull(row['접수시간_토요일']),
      openSun: hhmm(row['진료시작시간_일요일']),
      closeSun: hhmm(row['진료종료시간_일요일']),
      openMon: hhmm(row['진료시작시간_월요일']),
      closeMon: hhmm(row['진료종료시간_월요일']),
      openTue: hhmm(row['진료시작시간_화요일']),
      closeTue: hhmm(row['진료종료시간_화요일']),
      openWed: hhmm(row['진료시작시간_수요일']),
      closeWed: hhmm(row['진료종료시간_수요일']),
      openThu: hhmm(row['진료시작시간_목요일']),
      closeThu: hhmm(row['진료종료시간_목요일']),
      openFri: hhmm(row['진료시작시간_금요일']),
      closeFri: hhmm(row['진료종료시간_금요일']),
      openSat: hhmm(row['진료시작시간_토요일']),
      closeSat: hhmm(row['진료종료시간_토요일']),
    });
  }
  return result;
}

export function parseDeptRows(rows: Record<string, unknown>[]): NormalizedHospitalDept[] {
  const result: NormalizedHospitalDept[] = [];
  for (const row of rows) {
    const hospitalSourceId = str(row['암호화요양기호']);
    const deptCode = str(row['진료과목코드']);
    if (!hospitalSourceId || !deptCode) continue;
    result.push({
      hospitalSourceId,
      deptCode,
      deptName: str(row['진료과목코드명']),
      specialistCount: intOrNull(row['과목별 전문의수']),
      optionalDoctorCount: intOrNull(row['선택진료 의사수']),
    });
  }
  return result;
}

export function parseTransitRows(rows: Record<string, unknown>[]): NormalizedHospitalTransit[] {
  const result: NormalizedHospitalTransit[] = [];
  for (const row of rows) {
    const hospitalSourceId = str(row['암호화요양기호']);
    if (!hospitalSourceId) continue;
    result.push({
      hospitalSourceId,
      transitName: strOrNull(row['교통편명']),
      routeNumber: strOrNull(row['노선번호']),
      stopPoint: strOrNull(row['하차지점']),
      direction: strOrNull(row['방향']),
      distance: strOrNull(row['거리']),
      note: strOrNull(row['비고']),
    });
  }
  return result;
}

export function parseEquipmentRows(rows: Record<string, unknown>[]): NormalizedHospitalEquipment[] {
  const result: NormalizedHospitalEquipment[] = [];
  for (const row of rows) {
    const hospitalSourceId = str(row['암호화요양기호']);
    const equipCode = str(row['장비코드']);
    if (!hospitalSourceId || !equipCode) continue;
    result.push({ hospitalSourceId, equipCode, equipName: str(row['장비코드명']), equipCount: intOrNull(row['장비대수']) });
  }
  return result;
}

export function parseMealSurchargeRows(rows: Record<string, unknown>[]): NormalizedHospitalMealSurcharge[] {
  const result: NormalizedHospitalMealSurcharge[] = [];
  for (const row of rows) {
    const hospitalSourceId = str(row['암호화요양기호']);
    const typeCode = str(row['유형코드']);
    if (!hospitalSourceId || !typeCode) continue;
    result.push({
      hospitalSourceId, typeCode,
      typeName: str(row['유형코드명']),
      hasGeneral: strOrNull(row['일반식 가산여부']),
      staffCount: intOrNull(row['산정인원수']),
      treatmentGrade: strOrNull(row['치료식 등급']),
    });
  }
  return result;
}

export function parseNursingGradeRows(rows: Record<string, unknown>[]): NormalizedHospitalNursingGrade[] {
  const result: NormalizedHospitalNursingGrade[] = [];
  for (const row of rows) {
    const hospitalSourceId = str(row['암호화요양기호']);
    const typeCode = str(row['유형코드']);
    if (!hospitalSourceId || !typeCode) continue;
    result.push({ hospitalSourceId, typeCode, typeName: str(row['유형코드명']), nursingGrade: strOrNull(row['간호등급']) });
  }
  return result;
}

export function parseSpecialTreatmentRows(rows: Record<string, unknown>[]): NormalizedHospitalSpecialTreatment[] {
  const result: NormalizedHospitalSpecialTreatment[] = [];
  for (const row of rows) {
    const hospitalSourceId = str(row['암호화요양기호']);
    const searchCode = str(row['검색코드']);
    if (!hospitalSourceId || !searchCode) continue;
    result.push({ hospitalSourceId, searchCode, searchName: str(row['검색코드명']) });
  }
  return result;
}

export function parseSpecialtyRows(rows: Record<string, unknown>[]): NormalizedHospitalSpecialty[] {
  const result: NormalizedHospitalSpecialty[] = [];
  for (const row of rows) {
    const hospitalSourceId = str(row['암호화요양기호']);
    const searchCode = str(row['검색코드']);
    if (!hospitalSourceId || !searchCode) continue;
    result.push({ hospitalSourceId, searchCode, searchName: str(row['검색코드명']) });
  }
  return result;
}

export function parseStaffRows(rows: Record<string, unknown>[]): NormalizedHospitalStaff[] {
  const result: NormalizedHospitalStaff[] = [];
  for (const row of rows) {
    const hospitalSourceId = str(row['암호화요양기호']);
    const staffCode = str(row['기타인력코드']);
    if (!hospitalSourceId || !staffCode) continue;
    result.push({ hospitalSourceId, staffCode, staffName: str(row['기타인력코드명']), staffCount: intOrNull(row['기타인력수']) });
  }
  return result;
}
```

- [ ] **Step 3: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add scripts/ingest/amenities/xlsx-parse.ts scripts/ingest/amenities/adapter-hospital.ts
git commit -m "feat(hospital): xlsx-parse 유틸 + adapter-hospital 파싱 함수"
```

---

## Task 4: adapter-hospital 테스트

**Files:**
- Create: `tests/ingest/amenities/adapter-hospital.test.ts`

- [ ] **Step 1: 테스트 파일 작성**

```typescript
// tests/ingest/amenities/adapter-hospital.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseHospitalRows,
  parseFacilityRows,
  parseDetailRows,
  parseDeptRows,
} from '@/scripts/ingest/amenities/adapter-hospital';

const HOSPITAL_ROWS: Record<string, unknown>[] = [
  {
    '암호화요양기호': 'ABC123',
    '요양기관명': '서울중앙의원',
    '종별코드': '31',
    '종별코드명': '의원',
    '시도코드': 110000,
    '시도코드명': '서울',
    '시군구코드': 110001,
    '시군구코드명': '서울종로구',
    '읍면동': '종로동',
    '우편번호': '03181',
    '주소': '서울특별시 종로구 종로 1',
    '전화번호': '02-1234-5678',
    '병원홈페이지': 'https://hospital.kr',
    '개설일자': new Date('2010-03-15'),
    '총의사수': 5,
    '의과일반의 인원수': 1,
    '의과인턴 인원수': 0,
    '의과레지던트 인원수': 1,
    '의과전문의 인원수': 3,
    '치과일반의 인원수': 0,
    '치과인턴 인원수': 0,
    '치과레지던트 인원수': 0,
    '치과전문의 인원수': 0,
    '한방일반의 인원수': 0,
    '한방인턴 인원수': 0,
    '한방레지던트 인원수': 0,
    '한방전문의 인원수': 0,
    '조산사 인원수': 0,
    '좌표(X)': 126.978,
    '좌표(Y)': 37.572,
  },
  {
    '암호화요양기호': 'DEF456',
    '요양기관명': '부산의원',
    '종별코드': '31',
    '종별코드명': '의원',
    '시도코드': 210000,
    '시도코드명': '부산',
    '시군구코드': 210010,
    '시군구코드명': '부산해운대구',
    '읍면동': null,
    '우편번호': null,
    '주소': '부산광역시 해운대구 해운대로 1',
    '전화번호': null,
    '병원홈페이지': null,
    '개설일자': null,
    '총의사수': 1,
    '의과일반의 인원수': 0,
    '의과인턴 인원수': 0,
    '의과레지던트 인원수': 0,
    '의과전문의 인원수': 1,
    '치과일반의 인원수': 0,
    '치과인턴 인원수': 0,
    '치과레지던트 인원수': 0,
    '치과전문의 인원수': 0,
    '한방일반의 인원수': 0,
    '한방인턴 인원수': 0,
    '한방레지던트 인원수': 0,
    '한방전문의 인원수': 0,
    '조산사 인원수': 0,
    '좌표(X)': 0,
    '좌표(Y)': 0,
  },
];

describe('parseHospitalRows', () => {
  it('기본 필드를 파싱한다', () => {
    const rows = parseHospitalRows(HOSPITAL_ROWS);
    expect(rows).toHaveLength(2);
    const r = rows[0];
    expect(r.sourceId).toBe('ABC123');
    expect(r.name).toBe('서울중앙의원');
    expect(r.typeCode).toBe('31');
    expect(r.sido).toBe('서울');
    expect(r.sigunguCode).toBe('110001');
    expect(r.address).toBe('서울특별시 종로구 종로 1');
    expect(r.tel).toBe('02-1234-5678');
    expect(r.totalDoctors).toBe(5);
    expect(r.drMedSpecialist).toBe(3);
    expect(r.openedAt).toEqual(new Date('2010-03-15'));
    expect(r.lat).toBeCloseTo(37.572);
    expect(r.lng).toBeCloseTo(126.978);
  });

  it('좌표 0은 null 처리한다', () => {
    const rows = parseHospitalRows(HOSPITAL_ROWS);
    expect(rows[1].lat).toBeNull();
    expect(rows[1].lng).toBeNull();
  });

  it('sourceId 없는 행은 스킵한다', () => {
    const rows = parseHospitalRows([{ ...HOSPITAL_ROWS[0], '암호화요양기호': '' }]);
    expect(rows).toHaveLength(0);
  });

  it('전화번호/홈페이지 null 처리', () => {
    const rows = parseHospitalRows(HOSPITAL_ROWS);
    expect(rows[1].tel).toBeNull();
    expect(rows[1].homepage).toBeNull();
    expect(rows[1].openedAt).toBeNull();
  });
});

describe('parseFacilityRows', () => {
  it('병상수를 파싱한다', () => {
    const rows = parseFacilityRows([{
      '암호화요양기호': 'ABC123',
      '요양기관명': '서울중앙의원',
      '종별코드': '31',
      '종별코드명': '의원',
      '설립구분코드': '12',
      '설립구분코드명': '개인',
      '시도코드': 110000,
      '시도코드명': '서울',
      '시군구코드': 110001,
      '시군구코드명': '서울종로구',
      '읍면동': '종로동',
      '우편번호': '03181',
      '주소': '서울특별시 종로구 종로 1',
      '전화번호': '02-1234-5678',
      '개설일자': new Date('2010-03-15'),
      '일반입원실상급병상수': 0,
      '일반입원실일반병상수': 10,
      '성인중환자병상수': 2,
      '소아중환자병상수': 0,
      '신생아중환자병상수': 0,
      '분만실병상수': 0,
      '수술실병상수': 1,
      '응급실병상수': 3,
      '물리치료실병상수': 0,
      '정신과폐쇄상급병상수': 0,
      '정신과폐쇄일반병상수': 0,
      '정신과개방상급병상수': 0,
      '정신과개방일반병상수': 0,
      '격리병실병상수': 0,
      '무균치료실병상수': 0,
    }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].hospitalSourceId).toBe('ABC123');
    expect(rows[0].foundTypeName).toBe('개인');
    expect(rows[0].generalBedNormal).toBe(10);
    expect(rows[0].icuAdultBed).toBe(2);
    expect(rows[0].erBed).toBe(3);
    expect(rows[0].operatingRoomBed).toBe(1);
  });
});

describe('parseDetailRows', () => {
  it('진료시간을 HHMM 정수로 파싱한다', () => {
    const rows = parseDetailRows([{
      '암호화요양기호': 'ABC123',
      '요양기관명': '서울중앙의원',
      '위치_공공건물(장소)명': '율하역 2번 출구',
      '위치_방향': null,
      '위치_거리': null,
      '주차_가능대수': 30,
      '주차_비용 부담여부': 'N',
      '주차_기타 안내사항': null,
      '휴진안내_일요일': '전부 휴진',
      '휴진안내_공휴일': null,
      '응급실_주간_운영여부': 'N',
      '응급실_주간_전화번호1': null,
      '응급실_주간_전화번호2': null,
      '응급실_야간_운영여부': 'N',
      '응급실_야간_전화번호1': null,
      '응급실_야간_전화번호2': null,
      '점심시간_평일': '13:00-14:00',
      '점심시간_토요일': null,
      '접수시간_평일': '09:00-18:00',
      '접수시간_토요일': null,
      '진료시작시간_일요일': 0,
      '진료종료시간_일요일': 0,
      '진료시작시간_월요일': 900,
      '진료종료시간_월요일': 1800,
      '진료시작시간_화요일': 900,
      '진료종료시간_화요일': 1800,
      '진료시작시간_수요일': 900,
      '진료종료시간_수요일': 1800,
      '진료시작시간_목요일': 900,
      '진료종료시간_목요일': 1800,
      '진료시작시간_금요일': 900,
      '진료종료시간_금요일': 1800,
      '진료시작시간_토요일': 900,
      '진료종료시간_토요일': 1300,
    }]);
    expect(rows[0].openMon).toBe(900);
    expect(rows[0].closeMon).toBe(1800);
    expect(rows[0].openSat).toBe(900);
    expect(rows[0].closeSat).toBe(1300);
    expect(rows[0].openSun).toBeNull();
    expect(rows[0].parkingCapacity).toBe(30);
    expect(rows[0].locationBuilding).toBe('율하역 2번 출구');
  });
});

describe('parseDeptRows', () => {
  it('진료과목을 파싱한다', () => {
    const rows = parseDeptRows([
      { '암호화요양기호': 'ABC123', '요양기관명': '서울중앙의원', '진료과목코드': '01', '진료과목코드명': '내과', '과목별 전문의수': 2, '선택진료 의사수': 0 },
      { '암호화요양기호': 'ABC123', '요양기관명': '서울중앙의원', '진료과목코드': '05', '진료과목코드명': '정형외과', '과목별 전문의수': 1, '선택진료 의사수': 0 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].deptCode).toBe('01');
    expect(rows[0].deptName).toBe('내과');
    expect(rows[0].specialistCount).toBe(2);
  });

  it('deptCode 없는 행 스킵', () => {
    const rows = parseDeptRows([{ '암호화요양기호': 'ABC123', '진료과목코드': '', '진료과목코드명': '', '과목별 전문의수': 0, '선택진료 의사수': 0 }]);
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인 (어댑터 파일 없으면)**

```bash
pnpm test -- tests/ingest/amenities/adapter-hospital.test.ts 2>&1 | grep -E "PASS|FAIL|Tests"
```

Expected: PASS (Task 3에서 어댑터 이미 작성됨)

- [ ] **Step 3: 커밋**

```bash
git add tests/ingest/amenities/adapter-hospital.test.ts
git commit -m "test(hospital): parseHospitalRows / parseFacilityRows / parseDetailRows / parseDeptRows 테스트"
```

---

## Task 5: adapter-pharmacy.ts + 테스트

**Files:**
- Create: `scripts/ingest/amenities/adapter-pharmacy.ts`
- Create: `tests/ingest/amenities/adapter-pharmacy.test.ts`

- [ ] **Step 1: adapter-pharmacy.ts 작성**

```typescript
// scripts/ingest/amenities/adapter-pharmacy.ts
import type { NormalizedPharmacy } from './types';

function str(v: unknown): string { return String(v ?? '').trim(); }
function strOrNull(v: unknown): string | null { const s = str(v); return s || null; }
function dateOrNull(v: unknown): Date | null { return v instanceof Date ? v : null; }
function isKoreaCoord(lat: number | null, lng: number | null): boolean {
  return lat !== null && lng !== null && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}

export function parsePharmacyRows(rows: Record<string, unknown>[]): NormalizedPharmacy[] {
  const result: NormalizedPharmacy[] = [];
  for (const row of rows) {
    const sourceId = str(row['암호화요양기호']);
    if (!sourceId) continue;
    const rawLng = Number(row['좌표(X)']);
    const rawLat = Number(row['좌표(Y)']);
    const lat = Number.isFinite(rawLat) && rawLat !== 0 ? rawLat : null;
    const lng = Number.isFinite(rawLng) && rawLng !== 0 ? rawLng : null;
    result.push({
      sourceId,
      name: str(row['요양기관명']),
      typeCode: strOrNull(String(row['종별코드'] ?? '')),
      typeName: strOrNull(row['종별코드명']),
      sido: strOrNull(row['시도코드명']),
      sigungu: strOrNull(row['시군구코드명']),
      sigunguCode: strOrNull(String(row['시군구코드'] ?? '')),
      eupmyeondong: strOrNull(row['읍면동']),
      zipcode: strOrNull(row['우편번호']),
      address: str(row['주소']),
      tel: strOrNull(row['전화번호']),
      openedAt: dateOrNull(row['개설일자']),
      lat: isKoreaCoord(lat, lng) ? lat : null,
      lng: isKoreaCoord(lat, lng) ? lng : null,
    });
  }
  return result;
}
```

- [ ] **Step 2: 테스트 작성**

```typescript
// tests/ingest/amenities/adapter-pharmacy.test.ts
import { describe, it, expect } from 'vitest';
import { parsePharmacyRows } from '@/scripts/ingest/amenities/adapter-pharmacy';

const PHARMACY_ROWS: Record<string, unknown>[] = [
  {
    '암호화요양기호': 'PH001',
    '요양기관명': '행복약국',
    '종별코드': 81,
    '종별코드명': '약국',
    '시도코드': 110000,
    '시도코드명': '서울',
    '시군구코드': 110001,
    '시군구코드명': '서울종로구',
    '읍면동': '종로동',
    '우편번호': '03181',
    '주소': '서울특별시 종로구 종로 10',
    '전화번호': '02-111-2222',
    '개설일자': new Date('2015-06-01'),
    '좌표(X)': 126.979,
    '좌표(Y)': 37.573,
  },
  {
    '암호화요양기호': 'PH002',
    '요양기관명': '건강약국',
    '종별코드': 81,
    '종별코드명': '약국',
    '시도코드': 340000,
    '시도코드명': '충남',
    '시군구코드': 340600,
    '시군구코드명': '서산시',
    '읍면동': '지곡면',
    '우편번호': '31919',
    '주소': '충청남도 서산시 지곡면 충의로 1',
    '전화번호': null,
    '개설일자': null,
    '좌표(X)': 0,
    '좌표(Y)': 0,
  },
];

describe('parsePharmacyRows', () => {
  it('기본 필드를 파싱한다', () => {
    const rows = parsePharmacyRows(PHARMACY_ROWS);
    expect(rows).toHaveLength(2);
    const r = rows[0];
    expect(r.sourceId).toBe('PH001');
    expect(r.name).toBe('행복약국');
    expect(r.typeCode).toBe('81');
    expect(r.typeName).toBe('약국');
    expect(r.sido).toBe('서울');
    expect(r.sigunguCode).toBe('110001');
    expect(r.address).toBe('서울특별시 종로구 종로 10');
    expect(r.tel).toBe('02-111-2222');
    expect(r.openedAt).toEqual(new Date('2015-06-01'));
    expect(r.lat).toBeCloseTo(37.573);
    expect(r.lng).toBeCloseTo(126.979);
  });

  it('좌표 0은 null 처리한다', () => {
    const rows = parsePharmacyRows(PHARMACY_ROWS);
    expect(rows[1].lat).toBeNull();
    expect(rows[1].lng).toBeNull();
  });

  it('전화번호/개설일자 null 처리', () => {
    const rows = parsePharmacyRows(PHARMACY_ROWS);
    expect(rows[1].tel).toBeNull();
    expect(rows[1].openedAt).toBeNull();
  });

  it('sourceId 없는 행 스킵', () => {
    const rows = parsePharmacyRows([{ ...PHARMACY_ROWS[0], '암호화요양기호': '' }]);
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 3: 테스트 실행**

```bash
pnpm test -- tests/ingest/amenities/adapter-pharmacy.test.ts 2>&1 | grep -E "PASS|FAIL|Tests"
```

Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add scripts/ingest/amenities/adapter-pharmacy.ts tests/ingest/amenities/adapter-pharmacy.test.ts
git commit -m "feat(hospital): adapter-pharmacy 파싱 함수 + 테스트"
```

---

## Task 6: scripts/ingest-hospital.ts 작성

**Files:**
- Create: `scripts/ingest-hospital.ts`

- [ ] **Step 1: ingest-hospital.ts 작성**

```typescript
// scripts/ingest-hospital.ts
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { readXlsxRows } from '@/scripts/ingest/amenities/xlsx-parse';
import {
  parseHospitalRows,
  parseFacilityRows,
  parseDetailRows,
  parseDeptRows,
  parseTransitRows,
  parseEquipmentRows,
  parseMealSurchargeRows,
  parseNursingGradeRows,
  parseSpecialTreatmentRows,
  parseSpecialtyRows,
  parseStaffRows,
} from '@/scripts/ingest/amenities/adapter-hospital';
import type {
  NormalizedHospital,
  NormalizedHospitalFacility,
  NormalizedHospitalDetail,
  NormalizedHospitalDept,
  NormalizedHospitalTransit,
  NormalizedHospitalEquipment,
  NormalizedHospitalMealSurcharge,
  NormalizedHospitalNursingGrade,
  NormalizedHospitalSpecialTreatment,
  NormalizedHospitalSpecialty,
  NormalizedHospitalStaff,
} from '@/scripts/ingest/amenities/types';

const CHUNK = 500;
const CHUNK_DETAIL = 300;
const CHUNK_LARGE = 1000;

function parseArgs(): { dir: string } {
  const args = process.argv.slice(2);
  const dir = args.find((a) => a.startsWith('--dir='))?.split('=')[1];
  if (!dir) throw new Error('--dir=<xlsx 디렉토리 경로> 가 필요합니다');
  return { dir };
}

function findXlsx(dir: string, fileNum: number): string {
  const prefix = `${fileNum}.`;
  const found = readdirSync(dir).find((f) => f.startsWith(prefix) && f.endsWith('.xlsx'));
  if (!found) throw new Error(`${dir} 에서 "${prefix}"로 시작하는 xlsx 파일을 찾을 수 없습니다`);
  return join(dir, found);
}

function dedupeBySourceId<T extends { sourceId: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of rows) map.set(r.sourceId, r);
  return Array.from(map.values());
}

function locationSql(lat: number | null, lng: number | null) {
  return lat != null && lng != null
    ? Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`
    : Prisma.sql`NULL::geography`;
}

const HOSPITAL_COLS = [
  'sourceId', 'name', 'typeCode', 'typeName',
  'sido', 'sigungu', 'sigunguCode', 'eupmyeondong', 'zipcode',
  'address', 'tel', 'homepage', 'openedAt',
  'totalDoctors',
  'drMedGeneral', 'drMedIntern', 'drMedResident', 'drMedSpecialist',
  'drDentGeneral', 'drDentIntern', 'drDentResident', 'drDentSpecialist',
  'drKorGeneral', 'drKorIntern', 'drKorResident', 'drKorSpecialist',
  'midwifeCount',
] as const;
type HospitalCol = typeof HOSPITAL_COLS[number];

async function writeHospitals(rows: NormalizedHospital[]): Promise<number> {
  const cols = HOSPITAL_COLS.map((c) => `"${c}"`).join(', ');
  const updates = HOSPITAL_COLS.filter((c) => c !== 'sourceId')
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk.map((r) => {
      const cells = HOSPITAL_COLS.map((c) => Prisma.sql`${r[c as HospitalCol] ?? null}`);
      return Prisma.sql`(${Prisma.join(cells)}, ${locationSql(r.lat, r.lng)}, NOW())`;
    });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "Hospital" (${Prisma.raw(cols)}, location, "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("sourceId") DO UPDATE SET
        ${Prisma.raw(updates)},
        location = EXCLUDED.location,
        "updatedAt" = NOW()
    `);
  }
  return rows.length;
}

async function buildIdMap(sourceIds: string[]): Promise<Map<string, bigint>> {
  const result = await prisma.$queryRaw<{ id: bigint; sourceId: string }[]>`
    SELECT id, "sourceId" FROM "Hospital" WHERE "sourceId" = ANY(${sourceIds})
  `;
  return new Map(result.map((r) => [r.sourceId, r.id]));
}

async function writeFacilities(rows: NormalizedHospitalFacility[], idMap: Map<string, bigint>): Promise<void> {
  const mapped = rows.flatMap((r) => {
    const hospitalId = idMap.get(r.hospitalSourceId);
    return hospitalId ? [{ ...r, hospitalId }] : [];
  });
  for (let i = 0; i < mapped.length; i += CHUNK) {
    const chunk = mapped.slice(i, i + CHUNK);
    const values = chunk.map((r) => Prisma.sql`(
      ${r.hospitalId}, ${r.foundTypeCode}, ${r.foundTypeName},
      ${r.generalBedPremium}, ${r.generalBedNormal},
      ${r.icuAdultBed}, ${r.icuPediatricBed}, ${r.icuNeonatalBed},
      ${r.deliveryBed}, ${r.operatingRoomBed}, ${r.erBed}, ${r.physicalTherapyBed},
      ${r.psychiatryClosedPremium}, ${r.psychiatryClosedNormal},
      ${r.psychiatryOpenPremium}, ${r.psychiatryOpenNormal},
      ${r.isolationBed}, ${r.sterileRoomBed}, NOW()
    )`);
    await prisma.$executeRaw`
      INSERT INTO "HospitalFacility" (
        "hospitalId", "foundTypeCode", "foundTypeName",
        "generalBedPremium", "generalBedNormal",
        "icuAdultBed", "icuPediatricBed", "icuNeonatalBed",
        "deliveryBed", "operatingRoomBed", "erBed", "physicalTherapyBed",
        "psychiatryClosedPremium", "psychiatryClosedNormal",
        "psychiatryOpenPremium", "psychiatryOpenNormal",
        "isolationBed", "sterileRoomBed", "updatedAt"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("hospitalId") DO UPDATE SET
        "foundTypeCode" = EXCLUDED."foundTypeCode",
        "foundTypeName" = EXCLUDED."foundTypeName",
        "generalBedPremium" = EXCLUDED."generalBedPremium",
        "generalBedNormal" = EXCLUDED."generalBedNormal",
        "icuAdultBed" = EXCLUDED."icuAdultBed",
        "icuPediatricBed" = EXCLUDED."icuPediatricBed",
        "icuNeonatalBed" = EXCLUDED."icuNeonatalBed",
        "deliveryBed" = EXCLUDED."deliveryBed",
        "operatingRoomBed" = EXCLUDED."operatingRoomBed",
        "erBed" = EXCLUDED."erBed",
        "physicalTherapyBed" = EXCLUDED."physicalTherapyBed",
        "psychiatryClosedPremium" = EXCLUDED."psychiatryClosedPremium",
        "psychiatryClosedNormal" = EXCLUDED."psychiatryClosedNormal",
        "psychiatryOpenPremium" = EXCLUDED."psychiatryOpenPremium",
        "psychiatryOpenNormal" = EXCLUDED."psychiatryOpenNormal",
        "isolationBed" = EXCLUDED."isolationBed",
        "sterileRoomBed" = EXCLUDED."sterileRoomBed",
        "updatedAt" = NOW()
    `;
  }
}

const DETAIL_COLS = [
  'hospitalId',
  'locationBuilding', 'locationDirection', 'locationDistance',
  'parkingCapacity', 'parkingFee', 'parkingNote',
  'closedSunday', 'closedHoliday',
  'erDayOpen', 'erDayTel1', 'erDayTel2',
  'erNightOpen', 'erNightTel1', 'erNightTel2',
  'lunchWeekday', 'lunchSaturday',
  'receptionWeekday', 'receptionSaturday',
  'openSun', 'closeSun', 'openMon', 'closeMon',
  'openTue', 'closeTue', 'openWed', 'closeWed',
  'openThu', 'closeThu', 'openFri', 'closeFri',
  'openSat', 'closeSat',
] as const;
type DetailCol = typeof DETAIL_COLS[number];

async function writeDetails(rows: NormalizedHospitalDetail[], idMap: Map<string, bigint>): Promise<void> {
  const mapped = rows.flatMap((r) => {
    const hospitalId = idMap.get(r.hospitalSourceId);
    return hospitalId ? [{ ...r, hospitalId }] : [];
  });
  const cols = DETAIL_COLS.map((c) => `"${c}"`).join(', ');
  const updates = DETAIL_COLS.filter((c) => c !== 'hospitalId')
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');
  for (let i = 0; i < mapped.length; i += CHUNK_DETAIL) {
    const chunk = mapped.slice(i, i + CHUNK_DETAIL);
    const values = chunk.map((r) => {
      const cells = DETAIL_COLS.map((c) => Prisma.sql`${(r as Record<string, unknown>)[c] ?? null}`);
      return Prisma.sql`(${Prisma.join(cells)}, NOW())`;
    });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "HospitalDetail" (${Prisma.raw(cols)}, "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("hospitalId") DO UPDATE SET ${Prisma.raw(updates)}, "updatedAt" = NOW()
    `);
  }
}

async function writeDepts(rows: NormalizedHospitalDept[], idMap: Map<string, bigint>): Promise<void> {
  const mapped = rows.flatMap((r) => {
    const hospitalId = idMap.get(r.hospitalSourceId);
    return hospitalId ? [{ ...r, hospitalId }] : [];
  });
  for (let i = 0; i < mapped.length; i += CHUNK_LARGE) {
    const chunk = mapped.slice(i, i + CHUNK_LARGE);
    const values = chunk.map((r) =>
      Prisma.sql`(${r.hospitalId}, ${r.deptCode}, ${r.deptName}, ${r.specialistCount}, ${r.optionalDoctorCount})`,
    );
    await prisma.$executeRaw`
      INSERT INTO "HospitalDept" ("hospitalId", "deptCode", "deptName", "specialistCount", "optionalDoctorCount")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("hospitalId", "deptCode") DO UPDATE SET
        "deptName" = EXCLUDED."deptName",
        "specialistCount" = EXCLUDED."specialistCount",
        "optionalDoctorCount" = EXCLUDED."optionalDoctorCount"
    `;
  }
}

async function writeTransits(rows: NormalizedHospitalTransit[], idMap: Map<string, bigint>): Promise<void> {
  const mapped = rows.flatMap((r) => {
    const hospitalId = idMap.get(r.hospitalSourceId);
    return hospitalId ? [{ ...r, hospitalId }] : [];
  });
  // Transit은 composite unique 없음 → 전체 삭제 후 재삽입
  const hospitalIds = [...new Set(mapped.map((r) => r.hospitalId))];
  for (let i = 0; i < hospitalIds.length; i += CHUNK_LARGE) {
    const chunk = hospitalIds.slice(i, i + CHUNK_LARGE);
    await prisma.$executeRaw`DELETE FROM "HospitalTransit" WHERE "hospitalId" = ANY(${chunk})`;
  }
  for (let i = 0; i < mapped.length; i += CHUNK_LARGE) {
    const chunk = mapped.slice(i, i + CHUNK_LARGE);
    const values = chunk.map((r) =>
      Prisma.sql`(${r.hospitalId}, ${r.transitName}, ${r.routeNumber}, ${r.stopPoint}, ${r.direction}, ${r.distance}, ${r.note})`,
    );
    await prisma.$executeRaw`
      INSERT INTO "HospitalTransit" ("hospitalId", "transitName", "routeNumber", "stopPoint", direction, distance, note)
      VALUES ${Prisma.join(values)}
    `;
  }
}

async function writeEquipment(rows: NormalizedHospitalEquipment[], idMap: Map<string, bigint>): Promise<void> {
  const mapped = rows.flatMap((r) => {
    const hospitalId = idMap.get(r.hospitalSourceId);
    return hospitalId ? [{ ...r, hospitalId }] : [];
  });
  for (let i = 0; i < mapped.length; i += CHUNK_LARGE) {
    const chunk = mapped.slice(i, i + CHUNK_LARGE);
    const values = chunk.map((r) =>
      Prisma.sql`(${r.hospitalId}, ${r.equipCode}, ${r.equipName}, ${r.equipCount})`,
    );
    await prisma.$executeRaw`
      INSERT INTO "HospitalEquipment" ("hospitalId", "equipCode", "equipName", "equipCount")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("hospitalId", "equipCode") DO UPDATE SET
        "equipName" = EXCLUDED."equipName",
        "equipCount" = EXCLUDED."equipCount"
    `;
  }
}

async function writeMealSurcharges(rows: NormalizedHospitalMealSurcharge[], idMap: Map<string, bigint>): Promise<void> {
  const mapped = rows.flatMap((r) => {
    const hospitalId = idMap.get(r.hospitalSourceId);
    return hospitalId ? [{ ...r, hospitalId }] : [];
  });
  for (let i = 0; i < mapped.length; i += CHUNK_LARGE) {
    const chunk = mapped.slice(i, i + CHUNK_LARGE);
    const values = chunk.map((r) =>
      Prisma.sql`(${r.hospitalId}, ${r.typeCode}, ${r.typeName}, ${r.hasGeneral}, ${r.staffCount}, ${r.treatmentGrade})`,
    );
    await prisma.$executeRaw`
      INSERT INTO "HospitalMealSurcharge" ("hospitalId", "typeCode", "typeName", "hasGeneral", "staffCount", "treatmentGrade")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("hospitalId", "typeCode") DO UPDATE SET
        "typeName" = EXCLUDED."typeName",
        "hasGeneral" = EXCLUDED."hasGeneral",
        "staffCount" = EXCLUDED."staffCount",
        "treatmentGrade" = EXCLUDED."treatmentGrade"
    `;
  }
}

async function writeNursingGrades(rows: NormalizedHospitalNursingGrade[], idMap: Map<string, bigint>): Promise<void> {
  const mapped = rows.flatMap((r) => {
    const hospitalId = idMap.get(r.hospitalSourceId);
    return hospitalId ? [{ ...r, hospitalId }] : [];
  });
  for (let i = 0; i < mapped.length; i += CHUNK_LARGE) {
    const chunk = mapped.slice(i, i + CHUNK_LARGE);
    const values = chunk.map((r) =>
      Prisma.sql`(${r.hospitalId}, ${r.typeCode}, ${r.typeName}, ${r.nursingGrade})`,
    );
    await prisma.$executeRaw`
      INSERT INTO "HospitalNursingGrade" ("hospitalId", "typeCode", "typeName", "nursingGrade")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("hospitalId", "typeCode") DO UPDATE SET
        "typeName" = EXCLUDED."typeName",
        "nursingGrade" = EXCLUDED."nursingGrade"
    `;
  }
}

async function writeSpecialTreatments(rows: NormalizedHospitalSpecialTreatment[], idMap: Map<string, bigint>): Promise<void> {
  const mapped = rows.flatMap((r) => {
    const hospitalId = idMap.get(r.hospitalSourceId);
    return hospitalId ? [{ ...r, hospitalId }] : [];
  });
  for (let i = 0; i < mapped.length; i += CHUNK_LARGE) {
    const chunk = mapped.slice(i, i + CHUNK_LARGE);
    const values = chunk.map((r) => Prisma.sql`(${r.hospitalId}, ${r.searchCode}, ${r.searchName})`);
    await prisma.$executeRaw`
      INSERT INTO "HospitalSpecialTreatment" ("hospitalId", "searchCode", "searchName")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("hospitalId", "searchCode") DO UPDATE SET "searchName" = EXCLUDED."searchName"
    `;
  }
}

async function writeSpecialties(rows: NormalizedHospitalSpecialty[], idMap: Map<string, bigint>): Promise<void> {
  const mapped = rows.flatMap((r) => {
    const hospitalId = idMap.get(r.hospitalSourceId);
    return hospitalId ? [{ ...r, hospitalId }] : [];
  });
  for (let i = 0; i < mapped.length; i += CHUNK_LARGE) {
    const chunk = mapped.slice(i, i + CHUNK_LARGE);
    const values = chunk.map((r) => Prisma.sql`(${r.hospitalId}, ${r.searchCode}, ${r.searchName})`);
    await prisma.$executeRaw`
      INSERT INTO "HospitalSpecialty" ("hospitalId", "searchCode", "searchName")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("hospitalId", "searchCode") DO UPDATE SET "searchName" = EXCLUDED."searchName"
    `;
  }
}

async function writeStaff(rows: NormalizedHospitalStaff[], idMap: Map<string, bigint>): Promise<void> {
  const mapped = rows.flatMap((r) => {
    const hospitalId = idMap.get(r.hospitalSourceId);
    return hospitalId ? [{ ...r, hospitalId }] : [];
  });
  for (let i = 0; i < mapped.length; i += CHUNK_LARGE) {
    const chunk = mapped.slice(i, i + CHUNK_LARGE);
    const values = chunk.map((r) => Prisma.sql`(${r.hospitalId}, ${r.staffCode}, ${r.staffName}, ${r.staffCount})`);
    await prisma.$executeRaw`
      INSERT INTO "HospitalStaff" ("hospitalId", "staffCode", "staffName", "staffCount")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("hospitalId", "staffCode") DO UPDATE SET
        "staffName" = EXCLUDED."staffName",
        "staffCount" = EXCLUDED."staffCount"
    `;
  }
}

async function main() {
  const { dir } = parseArgs();
  const run = await prisma.ingestionRun.create({
    data: { source: 'amenity-hospital', targetKey: 'all', status: 'RUNNING' },
  });

  try {
    // 1. Hospital (파일1)
    logger.info('hospital: 파일1 파싱 중...');
    const hospitalRows = dedupeBySourceId(parseHospitalRows(readXlsxRows(findXlsx(dir, 1))));
    const upserted = await writeHospitals(hospitalRows);
    logger.info({ upserted }, 'hospital: Hospital upsert 완료');

    // 2. idMap 구성
    const idMap = await buildIdMap(hospitalRows.map((r) => r.sourceId));
    logger.info({ mapped: idMap.size }, 'hospital: idMap 구성 완료');

    // 3. HospitalFacility (파일3)
    logger.info('hospital: 파일3 시설정보 처리 중...');
    await writeFacilities(parseFacilityRows(readXlsxRows(findXlsx(dir, 3))), idMap);

    // 4. HospitalDetail (파일4)
    logger.info('hospital: 파일4 세부정보 처리 중...');
    await writeDetails(parseDetailRows(readXlsxRows(findXlsx(dir, 4))), idMap);

    // 5. HospitalDept (파일5)
    logger.info('hospital: 파일5 진료과목 처리 중...');
    await writeDepts(parseDeptRows(readXlsxRows(findXlsx(dir, 5))), idMap);

    // 6. HospitalTransit (파일6)
    logger.info('hospital: 파일6 교통정보 처리 중...');
    await writeTransits(parseTransitRows(readXlsxRows(findXlsx(dir, 6))), idMap);

    // 7. HospitalEquipment (파일7)
    logger.info('hospital: 파일7 의료장비 처리 중...');
    await writeEquipment(parseEquipmentRows(readXlsxRows(findXlsx(dir, 7))), idMap);

    // 8. HospitalMealSurcharge (파일8)
    logger.info('hospital: 파일8 식대가산 처리 중...');
    await writeMealSurcharges(parseMealSurchargeRows(readXlsxRows(findXlsx(dir, 8))), idMap);

    // 9. HospitalNursingGrade (파일9)
    logger.info('hospital: 파일9 간호등급 처리 중...');
    await writeNursingGrades(parseNursingGradeRows(readXlsxRows(findXlsx(dir, 9))), idMap);

    // 10. HospitalSpecialTreatment (파일10)
    logger.info('hospital: 파일10 특수진료 처리 중...');
    await writeSpecialTreatments(parseSpecialTreatmentRows(readXlsxRows(findXlsx(dir, 10))), idMap);

    // 11. HospitalSpecialty (파일11)
    logger.info('hospital: 파일11 전문병원 처리 중...');
    await writeSpecialties(parseSpecialtyRows(readXlsxRows(findXlsx(dir, 11))), idMap);

    // 12. HospitalStaff (파일12)
    logger.info('hospital: 파일12 기타인력 처리 중...');
    await writeStaff(parseStaffRows(readXlsxRows(findXlsx(dir, 12))), idMap);

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: upserted, finishedAt: new Date() },
    });
    logger.info({ upserted }, 'hospital ingest 완료');
  } catch (err) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
    });
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  logger.error({ err }, 'ingest-hospital fatal');
  process.exit(1);
});
```

- [ ] **Step 2: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add scripts/ingest-hospital.ts
git commit -m "feat(hospital): ingest-hospital 스크립트 (DB write + runner)"
```

---

## Task 7: scripts/ingest-pharmacy.ts 작성

**Files:**
- Create: `scripts/ingest-pharmacy.ts`

- [ ] **Step 1: ingest-pharmacy.ts 작성**

```typescript
// scripts/ingest-pharmacy.ts
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { readXlsxRows } from '@/scripts/ingest/amenities/xlsx-parse';
import { parsePharmacyRows } from '@/scripts/ingest/amenities/adapter-pharmacy';
import type { NormalizedPharmacy } from '@/scripts/ingest/amenities/types';

const CHUNK = 1000;

function parseArgs(): { dir: string } {
  const args = process.argv.slice(2);
  const dir = args.find((a) => a.startsWith('--dir='))?.split('=')[1];
  if (!dir) throw new Error('--dir=<xlsx 디렉토리 경로> 가 필요합니다');
  return { dir };
}

function findXlsx(dir: string, fileNum: number): string {
  const prefix = `${fileNum}.`;
  const found = readdirSync(dir).find((f) => f.startsWith(prefix) && f.endsWith('.xlsx'));
  if (!found) throw new Error(`${dir} 에서 "${prefix}"로 시작하는 xlsx 파일을 찾을 수 없습니다`);
  return join(dir, found);
}

function dedupeBySourceId<T extends { sourceId: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of rows) map.set(r.sourceId, r);
  return Array.from(map.values());
}

function locationSql(lat: number | null, lng: number | null) {
  return lat != null && lng != null
    ? Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`
    : Prisma.sql`NULL::geography`;
}

async function writePharmacies(rows: NormalizedPharmacy[]): Promise<number> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk.map((r) =>
      Prisma.sql`(
        ${r.sourceId}, ${r.name}, ${r.typeCode}, ${r.typeName},
        ${r.sido}, ${r.sigungu}, ${r.sigunguCode}, ${r.eupmyeondong}, ${r.zipcode},
        ${r.address}, ${r.tel}, ${r.openedAt},
        ${locationSql(r.lat, r.lng)}, NOW()
      )`,
    );
    await prisma.$executeRaw`
      INSERT INTO "Pharmacy" (
        "sourceId", name, "typeCode", "typeName",
        sido, sigungu, "sigunguCode", eupmyeondong, zipcode,
        address, tel, "openedAt",
        location, "updatedAt"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("sourceId") DO UPDATE SET
        name = EXCLUDED.name,
        "typeCode" = EXCLUDED."typeCode",
        "typeName" = EXCLUDED."typeName",
        sido = EXCLUDED.sido,
        sigungu = EXCLUDED.sigungu,
        "sigunguCode" = EXCLUDED."sigunguCode",
        eupmyeondong = EXCLUDED.eupmyeondong,
        zipcode = EXCLUDED.zipcode,
        address = EXCLUDED.address,
        tel = EXCLUDED.tel,
        "openedAt" = EXCLUDED."openedAt",
        location = EXCLUDED.location,
        "updatedAt" = NOW()
    `;
  }
  return rows.length;
}

async function main() {
  const { dir } = parseArgs();
  const run = await prisma.ingestionRun.create({
    data: { source: 'amenity-pharmacy', targetKey: 'all', status: 'RUNNING' },
  });

  try {
    logger.info('pharmacy: 파일2 파싱 중...');
    const rows = dedupeBySourceId(parsePharmacyRows(readXlsxRows(findXlsx(dir, 2))));
    const upserted = await writePharmacies(rows);

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: upserted, finishedAt: new Date() },
    });
    logger.info({ upserted }, 'pharmacy ingest 완료');
  } catch (err) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
    });
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  logger.error({ err }, 'ingest-pharmacy fatal');
  process.exit(1);
});
```

- [ ] **Step 2: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add scripts/ingest-pharmacy.ts
git commit -m "feat(hospital): ingest-pharmacy 스크립트"
```

---

## Task 8: 전체 테스트 통과 확인 + 실제 데이터 적재

- [ ] **Step 1: 전체 테스트 실행**

```bash
pnpm test -- tests/ingest/amenities/adapter-hospital.test.ts tests/ingest/amenities/adapter-pharmacy.test.ts 2>&1 | grep -E "PASS|FAIL|Tests"
```

Expected: 모두 PASS

- [ ] **Step 2: ZIP 압축 해제 (실제 데이터)**

```bash
unzip -o "/Users/jiyeonjeong/Downloads/전국 병의원 및 약국 현황 2026.3.zip" -d /tmp/hospital_data
```

- [ ] **Step 3: Pharmacy ingest 먼저 실행 (행 수 적음, 동작 확인용)**

```bash
pnpm tsx scripts/ingest-pharmacy.ts --dir="/tmp/hospital_data/전국 병의원 및 약국 현황 2026.3"
```

Expected: `pharmacy ingest 완료 { upserted: 25688 }` 로그 출력

- [ ] **Step 4: DB 확인**

```bash
pnpm tsx -e "import { prisma } from '@/lib/db'; prisma.pharmacy.count().then(n => { console.log('Pharmacy count:', n); prisma.\$disconnect(); })"
```

Expected: `Pharmacy count: 25688` (근사값)

- [ ] **Step 5: Hospital ingest 실행 (시간 소요: 수 분)**

```bash
pnpm tsx scripts/ingest-hospital.ts --dir="/tmp/hospital_data/전국 병의원 및 약국 현황 2026.3"
```

Expected: 각 파일별 로그 출력 후 `hospital ingest 완료 { upserted: 79562 }`

- [ ] **Step 6: DB 확인**

```bash
pnpm tsx -e "
import { prisma } from '@/lib/db';
Promise.all([
  prisma.hospital.count(),
  prisma.hospitalDept.count(),
  prisma.hospitalFacility.count(),
]).then(([h, d, f]) => {
  console.log({ hospital: h, dept: d, facility: f });
  prisma.\$disconnect();
});
"
```

Expected: `{ hospital: ~79562, dept: ~433337, facility: ~79562 }`

- [ ] **Step 7: 최종 커밋**

```bash
git add tests/ingest/amenities/adapter-hospital.test.ts scripts/ingest/amenities/adapter-pharmacy.ts tests/ingest/amenities/adapter-pharmacy.test.ts scripts/ingest/amenities/xlsx-parse.ts scripts/ingest/amenities/adapter-hospital.ts scripts/ingest-hospital.ts scripts/ingest-pharmacy.ts scripts/ingest/amenities/types.ts
git commit -m "feat(hospital): 병원·약국 ingest 전체 구현 완료"
```
