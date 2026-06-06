# subscription 데일리 수집 증분화 설계

- 날짜: 2026-06-06
- 대상: `scripts/ingest/subscriptions/` (runner.ts, adapter-applyhome.ts, upsert.ts), `prisma/schema.prisma`, `.github/workflows/ingest-subscriptions.yml`
- 접근: 변경 감지(contentHash) 기반 증분 — 바뀐 공고만 비싼 처리

## 문제

2026-06-05 schedule 실행에서 `apt` leg가 **120분 타임아웃**으로 실패. 같은 실행의 `remndr`는 1h10m으로 한계 근접.

### 진단 (실제 로그 기반)

| 시각 | 코드 | 로그 |
|---|---|---|
| 20:22→20:58 (~36분) | `fetchApplyhomeCategory` 수집 | `applyhome page` 정상 (page 1→28, fetched 2784) |
| 20:58→22:22 (~84분) | `geocodeItems` + upsert 루프 | **로그 없음** → 타임아웃 |

`runOne`(runner.ts:44-51)은 `collect → geocodeItems → upsert`를 **완전 순차**로 처리.

### 구조적 원인

1. **증분 수집 없음 — 매일 전체 이력 재처리.** 청약홈 `getAPTLttotPblancDetail`은 마감된 과거 공고까지 누적 반환(2,784건, 계속 증가). `fetchApplyhomeCategory`(adapter-applyhome.ts:90-104)는 **페이징 루프 안에서 공고 1건마다 `fetchUnits`** 호출, 각 odcloud 호출마다 `sleep(150ms)`(http.ts:43) → 수집만 36분.
2. **지오코딩 가드가 죽어 있음.** runner.ts:30의 `notice.lat != null` 가드는 절대 참이 안 됨 — 어댑터가 normalize 시 항상 `lat:null/lng:null`로 세팅(adapter-applyhome.ts:66-67). DB의 기존 좌표를 안 봄 → 매 실행 카카오 호출 2,784회 거의 전부 낭비.
3. **공고 1건당 DB 왕복 3회 순차.** `upsertNoticeWithUnits`(upsert.ts:62-86)는 건당 upsert + `deleteMany`(무조건) + `createMany` = 2,784 × 3 ≈ 8,300회 원격 Supabase 왕복.

### 확증 근거

같은 스케줄 실행에서 소요 시간이 카테고리 데이터 크기에 정확히 비례(remndr 1h10m, urbty 32m, apt 타임아웃). apt만의 버그가 아니라 구조적 스케일링 문제이며 apt가 가장 커서 먼저 한계를 넘음.

## 결정

- transaction-daily(고정 윈도우 재처리, resume+청크)와 달리 **subscription은 누적 이력이 무한 증가**하므로 **작업량 자체를 줄인다.**
- **변경 감지(change detection)**: notice의 `contentHash`로 신규·변경 공고만 골라 비싼 처리(units fetch + geocode + upsert)를 하고 나머지는 skip.
- **수용한 휴리스틱:** notice detail row가 그대로면 units도 그대로라고 간주(units만 단독 변경되는 드문 경우는 놓침). 이 가정이 절감의 전제 — 사용자 승인됨.

## 설계

### 1. 어댑터 구조 재편 (핵심)

현재는 페이징 루프 안에서 공고마다 `fetchUnits`를 호출 → 필터 전에 36분을 이미 소비. **2단계로 분리**한다:

```
1단계  fetchNoticeList(cfg)   ← detail 페이징만 (약 28콜). units 미수집.
          각 notice의 contentHash 계산
2단계  DB에서 기존 (sourceKey → {contentHash, lat, lng}) 일괄 로드 (1쿼리)
          diff: 신규 | 해시 변경 → "처리 대상"  /  나머지 → skip
3단계  처리 대상에 한해서만:
          fetchUnits → geocode(신규/주소 변경 시만) → upsert
```

- `fetchUnits`가 **필터 뒤로 이동**하는 게 핵심. 평상시 처리 대상은 소수 → 36분이 수 분으로.
- `fetchApplyhomeCategory`를 `fetchNoticeList`(units 없는 notice 목록)와 `fetchUnits`(기존 함수 재사용, 3단계에서 호출)로 분리.

### 2. contentHash 정의

- 정규화된 notice의 **영속 필드**(name/status/regionCode/regionName/address/totalSupply/dates/homepage/noticeUrl/developer/constructor/tel 등)를 **키 정렬 canonical JSON 직렬화** 후 sha256(hex 64자).
- **제외:** `lat`/`lng`(파생값), `rawJson`(노이즈), units.
- 구현 위치: `adapter-applyhome.ts`에 `computeContentHash(notice)` 헬퍼. LH(`adapter-lh-presub.ts`)도 동일 함수 재사용 가능하나 1차 범위는 청약홈 중심(LH는 소수 반환이라 영향 적음 — 4단계 참고).

### 3. 스키마 변경

```prisma
model SubscriptionNotice {
  ...
  contentHash String? @db.VarChar(64)
  ...
}
```

- nullable 추가 → **기존 행은 hash 없음 = 첫 실행 시 전부 "변경"으로 간주**되어 1회 풀 backfill, 이후부터 증분.
- Prisma migration 생성. unique 제약 `@@unique([source, sourceKey])`는 그대로(2단계 로드 키).
- `upsertNotice`의 INSERT/ON CONFLICT에 `contentHash` 컬럼 추가(set + EXCLUDED).

### 4. geocode 최적화

- 처리 대상 중 **신규이거나 주소가 바뀐 경우만** 카카오 호출.
- 변경됐으나 주소 동일 → 2단계에서 로드한 기존 `lat/lng` 재사용(notice에 주입).
- runner.ts:30의 죽은 가드는 이 흐름으로 대체되어 제거.
- geocoder의 in-process `cache`(geocoder.ts:13)는 그대로 유지(같은 실행 내 중복 방지).

### 5. upsert 처리

- 3단계 처리 대상만 `upsertNoticeWithUnits` 호출 → 일일 DB 왕복이 변경분 규모로 축소.
- **범위 제외:** 배치 upsert. 증분화 후 일일 변경분이 소수라 기존 건당 3왕복으로 충분(YAGNI).

### 6. 관측성 & 안전장치

- Phase별 + 주기적 진행 로그 추가: `notice list fetched`(건수), `change diff`(신규/변경/skip 카운트), units/geocode/upsert 진행. 현재 무로그 84분 공백 해소 → 다음 실패 시 병목 즉시 식별.
- `.github/workflows/ingest-subscriptions.yml`의 `timeout-minutes: 120`을 **첫 backfill 1회 대비 일시 상향**(예: 300, GitHub job 캡 360분 이내), backfill 정상 완료 확인 후 **원복**. (사용자 결정)

### 7. LH 처리

- 2단계 diff/skip 오케스트레이션은 `runOne`에 두어 **모든 source 공통**으로 적용. source별 fetch는 어댑터 함수로 분리: applyhome은 `fetchNoticeList`(units 없음) + `fetchUnits`(처리 대상만), LH는 units 분리 엔드포인트가 없으므로 `collect`가 units를 이미 붙여 반환 → runOne에서 LH는 units 재fetch 없이 그대로 사용(skip 대상이면 통째로 건너뜀).
- contentHash는 source 무관하게 모든 collect 결과 notice에 대해 계산·저장. 따라서 LH도 증분 skip 혜택을 받음. 단 LH는 소수 반환(메모리: 좌표 미수집 등 제약)이라 비용 영향은 미미.

## 검증

1. **로컬 2회 연속 실행**(`pnpm ingest:subscriptions --source=apt`, `.env.test` 대상): 1회차는 전건 처리(backfill), 2회차는 `change diff` 로그에서 신규/변경 0 → 대부분 skip 확인. 2회차 소요 시간이 1회차 대비 급감하는지 확인.
2. **변경 감지 동작**: 임의 공고의 DB `contentHash`를 수동 변조 후 재실행 → 해당 건만 "변경"으로 재처리되는지 로그 확인.
3. **무손실 확인**: 2회차 후 `SubscriptionUnit` 행 수·좌표가 1회차와 동일하게 보존되는지(skip된 공고의 units/coords 미삭제).
4. **단위 테스트**: `computeContentHash` 안정성(필드 순서 무관 동일 해시, lat/lng/units 무관), diff 분류 로직. 기존 `tests/ingest/subscriptions/adapter-applyhome.test.ts` 패턴 활용.
5. **workflow_dispatch 1회**(apt): backfill 완주 + `IngestionRun` OK 기록 확인 후 timeout 원복.

## 범위

- 수정: `scripts/ingest/subscriptions/{runner.ts, adapter-applyhome.ts, upsert.ts}`, `prisma/schema.prisma`(+ migration), `.github/workflows/ingest-subscriptions.yml`.
- 신규 테스트: `computeContentHash` + diff 로직.
- 제외: 배치 upsert, Node 20→24 액션 업그레이드(무관한 별개 이슈 — 언급만), LH 구조 재편.
