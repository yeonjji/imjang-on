# transaction-daily 타임아웃 해결 설계

- 날짜: 2026-06-03
- 대상: `ingest-transactions-daily` 워크플로 + `scripts/ingest/transactions/runner.ts`
- 접근: A — resume 복구 + 청크 분산 (기존 인프라 활용, 저위험)

## 문제

2026-06-02 schedule 실행에서 `apt-trade`, `apt-rent`, `rh-trade(villa)` leg가 **정확히 2시간(`timeout-minutes: 120`)에 타임아웃**으로 실패.

### 진단 (실제 로그 기반)

| Leg | 계획 타깃 | 2시간 내 완료 | 결과 |
|---|---|---|---|
| apt-trade | 458 | 265 (58%) | ❌ 타임아웃 |
| apt-rent | ~458 | — | ❌ 타임아웃 |
| rh-trade(villa) | ~458 | — | ❌ 타임아웃 |
| offi-trade | 458 | 458 (100%) | ✅ 39분 |
| offi-rent | 458 | 458 | ✅ 1h30m |

- 모든 leg가 동일하게 **458개 타깃(약 229 시군구 × 2개월: 이번달+전달)** 처리.
- 처리 속도가 데이터량에 비례. offi(오피스텔)는 시군구당 ~5s → 완주. apt/villa는 거래가 많아 시군구당 실효 ~53s(conc 2 기준) → 458개 완주에 느린 날 ~3.4시간 필요 → 한 윈도우에 안 들어감.

### 구조적 원인

1. **daily 모드가 resume를 무력화** — `runner.ts`의 `reprocessMonths`가 이번달·전달로 끝나는 `targetKey`를 `doneKeys`에서 무조건 제외 → 매 실행이 458개를 처음부터 전부 재처리. 못 끝내면 통째로 실패.
2. **이미 구현된 `--limit` 청크 기능을 daily 워크플로가 미사용.**
3. **concurrency 2 고정** — Supabase pooler 제약으로 상향 불가. 시간을 잡아먹는 외부 공공데이터 API fetch가 DB 제약에 함께 묶여 throttle됨.

## 결정

- **작업량은 줄이지 않는다.** 매일 이번달+전달 전체 재처리(self-heal)를 그대로 유지 — 실거래 신고가 계약 후 최대 30일까지 들어오므로 전달 재처리는 의미가 있고, 데이터 최신성을 최우선으로 둔다.
- 타임아웃은 **청크 분산 + resume**로만 해결한다.

## 설계

### 1. 핵심 수정 — daily 모드가 resume를 존중

**현재 (`runner.ts:72-82`):**

```ts
const reprocessMonths = args.mode === 'daily' ? new Set(getDailyMonths()) : null;
const doneKeys = new Set(
  doneRuns
    .filter((r) => !reprocessMonths || !Array.from(reprocessMonths).some((m) => r.targetKey.endsWith(`-${m}`)))
    .map((r) => `${r.source}:${r.targetKey}`),
);
```

daily면 이번달·전달 타깃을 항상 재처리 → resume 무력화.

**변경:** daily 모드의 스킵 기준을 *"같은 KST 날짜 안에서 이미 OK로 끝난 타깃"*으로 바꾼다.

- `IngestionRun` 조회에 `finishedAt >= 오늘 0시(KST)` 조건을 추가 → 오늘 완료한 타깃은 `doneKeys`에 포함되어 스킵.
- 날짜가 바뀌면(다음날 첫 패스) 어제 완료분은 더 이상 "오늘 완료"가 아니므로 전부 다시 재처리 → **매일 1회 self-heal 보장.**
- backfill 모드는 기존 로직 그대로(전체 `doneKeys` 사용).

**KST 자정(UTC 환산) 계산:**

```ts
// 서버는 UTC. 오늘 0시 KST = UTC 기준 (KST 날짜의) 전날 15:00.
const nowKstMs = Date.now() + 9 * 3600 * 1000;
const kst = new Date(nowKstMs);
const kstMidnightUtc = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600 * 1000);
```

이 값을 daily 모드일 때 `IngestionRun.finishedAt`의 하한(`gte`)으로 사용.

### 2. 워크플로 변경 (`ingest-transactions-daily.yml`)

방식: **단일 패스(전량 처리) + 하루 2회 cron**. 청크 `--limit`을 쓰지 않고 한 패스에서 458개 전체를 처리하되, GitHub Actions job 6시간 하드 캡 안에서 끝나도록 timeout을 늘린다. 2회 cron은 복원력용 — 1차가 잘리면 같은 날 2차가 resume로 이어받고, 1차가 완주하면 2차는 즉시 스킵 종료.

| 항목 | 현재 | 변경 |
|---|---|---|
| `--limit` | 없음 | 사용 안 함(전량 1패스) |
| `timeout-minutes` | 120 | 300 (느린 날 추정 ~3.4h + 여유. GitHub 캡 360분 이내) |
| `cron` | `0 18 * * *` (KST 03시 1회) | `0 15,19 * * *` (KST 00·04시, 하루 2회) |
| concurrency group | 없음 | 추가 (`group: ingest-transactions-daily`, `cancel-in-progress: false`) |

**동작:** 1차 패스(KST 00시)가 458개 전체를 처리. 느린 날 ~3.4시간이라 5시간 timeout 안에 완주. 2차 패스(KST 04시)는 resume가 오늘 완료분을 스킵하므로 즉시 종료. 1차가 6시간 캡 부근에서 잘려 일부만 OK된 경우에만 2차가 나머지를 이어받음. 저볼륨(offi)은 1차에서 끝.

**겹침 방지:** 최악의 날 1차가 5시간 가까이 돌면 2차(4시간 뒤)와 겹칠 수 있어 concurrency group을 둔다. `cancel-in-progress: false`로 1차를 죽이지 않고 2차를 큐잉 → 동시 DB 부하 방지.

**트레이드오프:** 단일 패스라 한 패스가 6시간 캡을 넘기면 그날은 실패(다음날 재처리). 관측된 느린 날(~3.4h)엔 충분하지만, 공공데이터 API가 평소의 ~1.8배 이상 느려지는 장애일엔 같은 날 복구가 2차 패스 1회로 제한됨. 더 강한 복원력이 필요하면 `--limit` 청크 분산(다회 cron)으로 전환 가능.

### 3. 검증

1. **로컬 resume 단위검증:** `--mode=daily --limit=5`로 2회 연속 실행 → 2번째 실행이 1번째 완료분을 `skipped`로 건너뛰는지 로그 확인. KST 날짜 경계 로직이 핵심이라 여기 집중.
2. **workflow_dispatch 1패스:** 실제 1회 수동 실행 → 90분 내 종료 + `IngestionRun` OK 기록 + 부분 진행 확인.
3. **2~3일 모니터링:** 6개 leg 전부 `success`, 하루 누적으로 458 완주, Discord 알림 정상.

**부분완료 안전성:** 각 패스 끝의 `updatePropertyAggregates` + `revalidatePaths`는 그 패스의 affected만 처리(현행 그대로) → 데이터가 하루 동안 점진적으로 갱신될 뿐 일관성 깨짐 없음.

## 범위

- 수정: `scripts/ingest/transactions/runner.ts` (resume 조건 1곳), `.github/workflows/ingest-transactions-daily.yml`.
- 새 인프라/스키마 변경 없음. `--limit`·resume·`IngestionRun` 모두 기존 자산.
