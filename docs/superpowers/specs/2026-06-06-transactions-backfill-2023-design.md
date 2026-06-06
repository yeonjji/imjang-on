# 실거래가 역사 구간 백필 (2023-01 → 2025-05)

작성일: 2026-06-06

## 1. 목표 & 범위

`2023-01` ~ `2025-05` (29개월) 구간의 실거래/전월세 데이터를 백필한다.

- **대상 API: 6종 전체** — apt/offi/rh × trade(매매)/rent(전월세)
  - `molit-apt-trade`, `molit-apt-rent`, `molit-offi-trade`, `molit-offi-rent`, `molit-rh-trade`, `molit-rh-rent`
- **현재 보유 구간**: `2025-06 ~ 2026-06` (13개월, ~1.65M rows). 백필은 이 앞 구간만 채운다.
- 데이터 추가는 **순수 additive** — 스키마 변경 없음. 어댑터가 이미 `contractDate`/`registerDate`를 파싱하고, `transaction.createMany({ skipDuplicates: true })`가 `rawHash` 기준으로 멱등하므로 재실행/중복 안전.
- daily ingest(`2025-06 ~ 2026-06` self-heal)와 **월 구간이 겹치지 않음** + 멱등 upsert → 충돌 없음.

**규모**: 261 시군구 × 29개월 × 6 API ≈ **45,400 타깃**, ≈ **54,000 API 호출** (≈1.2 calls/target),
**+3~4M rows** 예상.

## 2. Runner 변경 (`scripts/ingest/transactions/runner.ts`)

기존 `months`/`month-offset`와 나란히 명시적 구간 지정을 추가한다.

- `parseArgs`에 `--from=YYYYMM`, `--to=YYYYMM` 추가.
- `getRangeMonths(from, to)` 신규 — 구간의 월 목록 생성. `--from`/`--to`가 있으면 `months`보다 우선.
- **정렬: 최신 → 과거** (`2025-05` 먼저, `2023-01`까지). 기존 데이터에 인접한 구간부터 채워 차트가 과거로 점진 확장되도록.
- resume(`ingestionRun`), `--limit`, concurrency 2, aggregate 갱신 등 나머지 로직은 그대로.

### 2-1. Result-code guard (`scripts/ingest/xml-parse.ts`) — **필수 (correctness)**

**문제**: `getItems()`는 item이 없으면 `[]`, `getTotalCount()`는 `0`을 반환한다. data.go.kr은
**quota 초과를 HTTP 200 + `<header><resultCode>22</resultCode>` (LIMITED NUMBER OF SERVICE
REQUESTS EXCEEDS ERROR)** 로 응답한다. `http.ts`의 재시도는 429/5xx만 잡으므로 이 에러를 통과시킨다.
결과적으로 quota 소진 후 모든 타깃이 "0 rows"로 파싱되어 `runOne`이 `ingestionRun`을 **OK /
rowsUpserted: 0**으로 마킹 → resume가 그 시군구-월을 **영구 스킵** → 조용한 데이터 유실.

**해결**:
- `xml-parse.ts`에 `response.header.resultCode`/`resultMsg`를 읽는 검증 추가. 정상 코드
  (`00`/`000`, "NORMAL SERVICE") 외에는 에러로 취급.
- `fetchAll`이 비정상 코드에서 throw → `runOne`이 해당 run을 **ERROR**로 마킹 → resume가
  **다음 패스에서 재시도**(스킵 아님).
- quota 코드(`22`)는 구분 가능한 에러로 throw → 워크플로 로그/notify에서 식별 가능.
- 효과: quota를 도중에 소진해도 해당 타깃은 다음 패스/다음 날로 자연 연기 → 백필 전체가
  quota에 대해 self-healing.

## 3. 자동 루프 cron 워크플로 (`.github/workflows/backfill-transactions-loop.yml`, 신규)

기존 `backfill-transactions.yml`를 본떠(6 API 매트릭스, 동일 env/secrets) 다음을 추가:

- `schedule: cron` **매시간** + `workflow_dispatch` (수동 kick).
- `concurrency` group + `cancel-in-progress: false` → 패스 간 겹침 방지.
- 각 job 실행:
  `runner.ts --api=<matrix> --mode=backfill --from=202301 --to=202505 --limit=261`
- `--limit=261` ≈ API job 1개당 1개월치 시군구 → 패스당 ≈1개월 진행, resume가 다음 시간에 이어감.
- **완주/자동 정지**: 사전 step에서 pending 타깃 수(구간 타깃 − `OK` `ingestionRun`)를 카운트.
  0이면 job no-op + Discord "backfill complete" notify. 이후 cron은 시간당 cheap no-op이 되며,
  완료 알림을 받으면 `schedule:` 블록을 제거(또는 워크플로 삭제)한다.

### 3-1. 페이싱 근거 (quota = 10,000/op/일)

- 매시간 ≈ 24 패스/일 × ~310 calls/op ≈ ~7,400 + daily ingest ~600–1,200 ≈ **일 quota의 80–86%**.
- ~29개월 → **~1.2일**에 완주.
- 집중 월(서울 구 apt 다중 페이지)에서 일부 타깃이 quota를 넘겨 ERROR가 나도 §2-1 guard가
  다음 패스/다음 날 재시도로 안전 처리.

## 4. 검증 & 리스크

### 검증
- `scripts/verify-counts.ts`를 확장(또는 동등 스크립트)하여 구간에 대해 source별 `OK` 월 수와
  남은 pending 수를 보고. 종료 시 **pending 0** 확인.
- 완주 후 `transaction.aggregate`로 `_min.contractDate`가 `2023-01`로 내려갔는지 확인.

### 리스크
- **API quota (주 제약)**: 10,000/op/일. 매시간 페이스는 ~80–86% 사용 → daily ingest와 예산을
  공유하므로 집중일에 일시 초과 가능. §2-1 guard가 self-healing 보장.
- **Supabase 디스크**: +3~4M rows (현재 1.65M의 ~2–3배). 기존 read-only(25006) 처리 + resume로
  디스크 압박 실패는 다음 패스 재시도로 흡수. **시작 전 Supabase 플랜의 디스크 여유 확인 권장.**
- daily ingest와 무충돌 (월 구간 분리 + 멱등 upsert).

## 5. 변경 파일 요약

| 파일 | 변경 |
|------|------|
| `scripts/ingest/transactions/runner.ts` | `--from`/`--to` 파싱 + `getRangeMonths` (최신→과거) |
| `scripts/ingest/xml-parse.ts` | resultCode/resultMsg 검증 (비정상 코드 throw, quota 코드 구분) |
| `scripts/ingest/transactions/adapter-*.ts` 또는 `runner.fetchAll` | guard 호출 지점 연결 |
| `.github/workflows/backfill-transactions-loop.yml` | 신규: 매시간 cron, `--limit=261`, pending=0 자동 정지 |
| `scripts/verify-counts.ts` | 구간 pending/coverage 보고 확장 |
