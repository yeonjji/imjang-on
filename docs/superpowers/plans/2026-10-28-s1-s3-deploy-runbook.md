# S1~S3 운영 배포 런북 (매물 집계 정합성 · 거래 재정합)

- 작성일: 2026-10-28 · 상태: **승인 대기(이 문서로 운영 반영 여부를 결정)**
- 대상 PR: #344(S1) ← #345(S2) ← #346(S3). 설계: `docs/superpowers/specs/2026-10-27-property-aggregate-integrity-design.md` (§11·§12·§14~§16)
- 원칙: 각 단계는 **확인 기준을 통과해야 다음으로** 간다. 기준을 못 넘으면 '중단' 또는 '롤백' 표를 따른다. 운영 쓰기가 있는 단계는 배포 당일 승인자가 지켜본다.

---

## 0. 결정 요약

### 0-1. 머지 전략 — #346 하나를 main으로(merge commit)

> **2026-10-31 준비 결과(P6 진행분):** main이 `c853388` → `0091ba7`로 움직였다(목록 정렬 #347~#350, 마이그레이션 `20261030000000_add_content_score` 운영 적용됨). #346에 main을 merge(`663553a`) — 충돌은 `deploy/run-etl.sh`·`deploy/systemd/install-timers.sh` 두 곳(같은 자리에 잡·타이머 추가)으로 **양쪽 모두 유지**(타이머 16개, 시각 겹침 없음). **마이그레이션 순서:** S2·S3(`20261028`·`20261029`)가 운영에 이미 적용된 `20261030`보다 이름이 앞서지만, main 상태로 만든 로컬 DB에서 `migrate deploy`가 두 개를 정상 적용하고 `up to date`·스키마 차이 없음을 확인. 로컬 전체 검증: lint·typecheck·unit 2,078·integration 208(10 skip = 병합 도구 --apply 차단)·build 통과. #346 기준을 main으로 변경(REST API — `gh pr edit`은 토큰 scope 부족) 후 닫았다 다시 열어 CI. **아래 표의 '충돌 없음·빨리감기'는 더 이상 사실이 아니다 — merge commit으로만 머지.**
>
> **P7 — 웹훅 없이 진행(사용자 결정, 2026-10-31):** 박스 `.env.production`에 `DISCORD_WEBHOOK_URL`이 없어 모든 ETL 알림이 `notify (no webhook configured)`로 버려진다(OCI 이전 이후 계속). 사용자가 웹훅 없이 진행하기로 결정. 대가: S3 자동 중단(halt)이 나도 알림이 없어, 확인 전까지 거래 수집이 멈춘 채 남는다. **대체:** D0·D+1에는 단계마다 `reconcile-transactions.ts --halt-status`와 `IngestionRun`(source `reconcile-halt`·transactions)을 직접 확인한다. 그 뒤에는 수동 확인(헬스 체크에 정지 상태 노출은 후속 선택 사항).

| 확인 | 결과(2026-10-28) |
|---|---|
| main 최신 | `c853388`(#343). S1 브랜치의 분기점과 같다 → **main은 그 뒤로 움직이지 않았다** |
| 브랜치 관계 | S1 2커밋 → S2 4커밋 → S3 5커밋, **한 줄로 이어진 11커밋**(중복·되돌림 커밋 없음) |
| 충돌 | 없음(main이 분기점 그대로라 빨리감기 가능) |
| 마이그레이션 | 새 것 2개: `20261028000000_add_property_aggregate_queue`(S2) → `20261029000000_add_transaction_reconcile`(S3). main 최신(`20261027000000`)보다 뒤, 이름순 = 적용순. **둘 다 새 테이블만 만든다**(기존 테이블 변경 없음) |
| 배포 트리거 | main push → CI 성공 → `deploy`(SSH → `remote-deploy.sh`). 머지마다 배포된다 |

- **방법:** 머지 직전 `gh pr edit 346 --base main`으로 #346의 기준을 main으로 바꾼다 → #346이 11커밋 전체를 담는다 → **merge commit**으로 한 번 머지(저장소 관례, squash 금지: 커밋 이력과 #344·#345의 '병합됨' 자동 표시가 사라진다) → 배포 1회. #344·#345는 커밋이 main에 들어가면 GitHub가 병합됨으로 표시한다(안 되면 "#346로 병합" 코멘트 후 닫기).
- **CI 재검증:** 기준 변경(`edited`)은 CI를 다시 돌리지 않는다. 기준을 바꾼 뒤 PR을 닫았다 다시 열어(`reopened`) **main과 합친 상태로 CI를 새로 돌리고** 초록을 확인한 뒤 머지한다. CI에 `pnpm build`가 없으므로 같은 커밋으로 로컬 `pnpm build`도 한다.
- **머지 직전 재확인:** `git log origin/main` 이 `c853388` 그대로인지. 움직였으면 #346에 main을 merge → 충돌·마이그레이션 이름순(새 main 마이그레이션이 생겨도 `migrate deploy`는 미적용분을 이름순으로 모두 적용) 확인 → CI 다시.
- 대안(브랜치끼리 아래에서 위로 머지: #346→S2 브랜치, #345→S1 브랜치, #344→main)도 배포 1회지만 단계가 많고 최종 CI가 #344에서 돈다. 위 방법을 권한다.

### 0-2. 데이터 복구 순서 — 2단계(D0 해제 아파트 → D+1 전체)를 권한다
| 비교 | A. 2단계(D0 해제 아파트 14,924 → D+1 전체) | B. D0 전체 한 번(276,846 검사 · 99,670 변경) |
|---|---|---|
| S1이 만드는 불일치(해제 아파트의 화면 실시간값 ≠ 저장값) 노출 | 배포 후 **수 분**(1~3분 + 1묶음 검증) | 배포 후 **15~30분**(전체 10~20분 + 1묶음·롤백 검증) |
| 이미 있던 불일치(D1·D2, 약 8.5만) | 하루 더 유지(수개월째 있던 상태) | 배포 당일 해소 |
| D0 배포 창 쓰기 부하 | 약 1.5만 UPDATE · WAL 약 50MB | 약 10만 UPDATE · WAL 약 340MB, 배포 직후(웹 재시작·ISR 캐시가 빈 상태)와 겹침 |
| 중복 처리 | 해제 아파트 1.5만을 D+1에 **다시 검사만**(값이 이미 맞아 쓰기 0, 1초 내외). 총 쓰기량은 같다 | 없음 |
| 장애 원인 구분 | 배포·S3 첫 실행·전체 재집계가 **다른 날** → 문제가 생기면 원인이 분명 | 배포·재집계가 같은 창, 그날 밤 S3 첫 실행까지 겹침 |
| D0 되돌리기 범위 | 백업 JSONL 1.5만 행 | 10만 행(되돌리기 수 분, 롤백 검증도 커짐) |
| D+1 전체 재집계 시점의 상태 | 첫 S3 일일 실행(이번 달·전달) 결과까지 반영된 뒤 → 대기열이 이미 고친 매물은 다시 쓰지 않는다 | — |
| 결론 | **권장.** S1 불일치 노출이 더 짧고, 당일 위험·되돌리기 범위가 작고, 원인 구분이 쉽다. 비용은 기존 불일치 하루 연장뿐 | 기존 불일치를 하루 일찍 없애지만, 배포 당일 위험을 키운다 |

- 두 방식의 최종 집계값은 같다(1차 리허설에서 순서와 무관하게 같은 값 확인).

---

## 1. 사전 준비 (D−2 ~ D−1, 운영 쓰기 없음)

| # | 할 일 | 방법 | 통과 기준 |
|---|---|---|---|
| P1 | **API 일일 한도 확인** | 공공데이터포털 → 마이페이지 → 데이터활용 → Open API → 활용신청 현황 → 국토교통부 실거래가 6종(아파트 매매·전월세, 오피스텔 매매·전월세, 연립다세대 매매·전월세) 각각 '상세' → 트래픽(일일 허용량), 계정 유형(개발/운영) 확인. 박스 `.env.production`의 `PUBLIC_DATA_KEY`가 그 계정 키인지 확인(키 값은 화면에 출력하지 않고 앞 4자리만 대조) | API마다 **일 3,000회 이상**(예상 최대 약 2,100회/일, 아래). 개발계정 기준 10,000회 |
| P2 | 예상 호출량 확인 | 지금 일일 3,072범위/일(실측, API당 512). S3 후 일일은 같고(5,000건 한 번 호출이라 1,000건 넘는 범위는 오히려 줄어듦), 재확인이 최대 1,550범위/일. 첫 바퀴에 상한이 한 API에 몰리면 그 API 하루 약 1,712~2,100회. D0 점검 dry-run 약 30회 | P1 한도의 70% 이하 |
| P3 | **외부 백업**(2026-10-28 1회 실시·검증 완료 — §8) | 정기 백업이 없다(`pg-dump-backup` 워크플로는 Supabase 시절 것, 7/19 이후 수동 비활성). 박스 디스크에 두지 않고 **로컬로 바로 받는다**(읽기 전용 세션·낮은 CPU 우선순위): `ssh <box> 'cd /opt/imjang/deploy && docker compose --env-file .env.production exec -T db sh -c "PGOPTIONS=\"-c default_transaction_read_only=on\" nice -n 19 pg_dump -U \$POSTGRES_USER -d \$POSTGRES_DB -Fc -Z3 --exclude-table-data=\"\\\"EmailSignup\\\"\""' > ~/imjang-backups/imjang-prod-YYYYMMDD.dump` (`umask 077`). 실측 96초·880MB. **덤프 중 박스 CPU 평균 87%·최대 100%, 응답 평균 96ms·최대 0.69초** → 이용이 적은 시간, 수집 타이머가 없는 시간(02:00~14:00 UTC)에. 배포 직전 다시 받는다 | 덤프 전·후 운영 대조 출력이 같음(그 사이 변경 없음 = 덤프와 일치) |
| P4 | **복원 검증**(2026-10-28 실시·일치) | 운영과 **같은 이미지**(`imresamu/postgis:17-3.5` — 운영은 PostgreSQL 17·PostGIS 3.5, 로컬 개발 DB는 16이라 쓰지 않는다)로 별도 컨테이너를 띄워 `template0`에서 만든 빈 DB에 `pg_restore --no-owner --no-acl -j 4`(이미지 기본 DB는 tiger·topology 스키마가 미리 있어 오류 3건) → `~/imjang-backups/verify.sql`(전 테이블 정확한 행 수, 스키마 지문, 핵심 집계, 행 내용 해시)을 운영(읽기 전용)과 복원본에서 돌려 `diff` → 끝나면 복원 컨테이너·볼륨 삭제 | `diff` 출력 없음 |
| P5 | 디스크·WAL | `df -BG /`, `SELECT pg_size_pretty(sum(size)) FROM pg_ls_waldir()` | 여유 **12GB 이상**(ISR 캐시 톱니 최저점 기준). WAL은 `max_wal_size` 1GB 안에서 재활용(아카이브·슬롯 없음) |
| P6 | 머지 준비 | 0-1 절차대로 #346 기준을 main으로 → 닫았다 다시 열어 CI → 초록. 같은 커밋 로컬 `pnpm build` | CI check·e2e 통과(통합 테스트는 로그에서 실패 0 확인 — CI는 통합 실패를 continue-on-error로 넘긴다) |
| P7 | 알림 확인 | Discord 웹훅으로 ETL 알림이 오는지 최근 일일 알림 확인 | 최근 24시간 일일 알림 수신 |

**예상 쓰기·디스크(설계 §14·§12 근거)**

| 단계 | 변경 | WAL | 디스크 |
|---|---|---|---|
| D0 마이그레이션 | 새 테이블 3개(빈 상태) | 수 MB | 수 MB |
| D0 해제 아파트 재집계 | 약 14,923 매물 | 약 50MB | 백업 JSONL 약 7MB |
| D0 밤 첫 S3 일일(이번 달·전달) | 거래 삽입 약 2.5만~3만, 보관 약 0.2만 | 약 70~100MB | 거래 +20MB 안팎 |
| D+1 S5 전체 | 약 8.5만 매물(해제 아파트 제외분) | 약 300MB | 백업 JSONL 약 40MB |
| D+2~ 재확인 첫 바퀴(7~30일 분산) | 삽입 16만~19만 · 보관 0.5만~1.4만 | 약 420MB(분산) | 거래 +120~140MB, 보관 약 13MB |

---

## 2. D0 체크리스트 (ETL 없는 시간대, 예: 02:00 UTC 시작 · 소요 약 1시간)

**D0 날짜 조건(박스 타이머 기준, 2026-10-29 확인):** 화~금, 매월 1일 제외. 월요일 02:00 UTC는 `board-posts`(게시글 생성), 매월 1일 02:00 UTC는 `amenities`(생활시설 대량 적재)가 배포 창과 겹친다.

### 2-0. 배포 직전 백업과 데이터 동결 (D0 이른 오전)
백업과 배포 사이에 S1~S3가 다루는 데이터가 바뀌지 않게, **수집 타이머를 백업 전에 멈춘다.**

| # | 할 일 | 명령 | 통과 기준 |
|---|---|---|---|
| B1 | 실행 중인 ETL 없음 | `systemctl list-units 'imjang-etl@*' --state=active` | 없음. `building-register`(21:00 UTC 시작, 최대 약 100분)가 끝난 뒤 — 보통 22:40 UTC(07:40 KST) 이후 |
| B2 | **수집 타이머 정지**(기존 2단계를 여기로 앞당김) | `sudo systemctl stop imjang-etl@transactions-daily.timer` | `inactive` |
| B3 | 백업 | P3 명령(로컬로 직접) | 종료 0, 크기 약 0.9GB |
| B4 | 백업 확인 | 덤프 직후 운영에서 `verify.sql` 실행 → 덤프 직전 출력과 `diff` | 차이 없음. 시간이 되면 P4 복원 검증(약 3분)까지 |
| B5 | **배포 직전 변동 확인**(2단계 3번 머지 직전) | `verify.sql`을 다시 실행해 B4 출력과 비교 | 거래·매물·지역 항목(행 수·집계·행 해시)과 `IngestionRun` 행 수가 같다. 다르면 원인 확인 후 B3부터 다시 |

- **백업 뒤에도 바뀔 수 있는 것(정상):** 웹의 이메일 구독(`EmailSignup`)·관리자 게시글·가이드 편집(`Post`·`Guide`)·화면 캐시(`DashboardSnapshot`). S1~S3와 무관한 테이블이고, 롤백 R5는 이 테이블들을 복원하지 않으므로 그 사이 기록을 잃지 않는다. 배포 창 동안 관리자 편집과 DB를 쓰는 수동 GitHub 워크플로(`generate-guides`·`generate-board-topic`·`restructure-articles`·`coord-quality`·`ingest-apt-complex` — 모두 일정 없음) 실행은 하지 않는다.
- **바뀌면 안 되는 것:** `Transaction`·`Property`·`Region`은 거래 수집(정지됨)과 D0 작업만 바꾼다(다른 ETL·웹은 쓰지 않음 — 코드 확인). D0 작업의 변경은 재집계 백업·재정합 감사 로그로 되돌린다.

박스에서 쓰는 약칭:
```bash
cd /opt/imjang
DC="docker compose -f deploy/docker-compose.yml --profile tools --env-file deploy/.env.production"
# 운영 도구는 일회용 컨테이너에서 돈다 → 백업·감사 로그·정지 파일은 반드시 호스트 디렉터리에 마운트
OPS="$DC run --rm -v /opt/imjang/backups:/backups etl pnpm tsx"
sudo mkdir -p /opt/imjang/backups/{reagg,reconcile-rollback} && sudo chown -R ubuntu /opt/imjang/backups
```

| # | 할 일 | 명령 | 통과 기준(→ 아니면) |
|---|---|---|---|
| 1 | 시작 전 상태 기록 | `df -BG /` · `uptime` · `systemctl list-timers 'imjang-*'` · 박스 커밋 `git log --oneline -1` | 여유 12GB 이상, load 2 이하, 박스 = `c853388` (→ 중단: 시작하지 않음) |
| 2 | **수집 타이머 정지 확인**(B2에서 정지 — 배포 중 새 ETL 이미지가 옛 스키마에 붙는 것 방지) | `systemctl is-active imjang-etl@transactions-daily.timer imjang-etl@transactions-daily.service` | 둘 다 `inactive` (→ B2) |
| 2-1 | 배포 직전 변동 확인 | B5 | 같음 (→ 다르면 B3부터) |
| 3 | 머지 → 자동 배포 | #346 merge commit. GitHub Actions `ci` → `deploy` 완료 확인 | deploy 성공, 박스 `git log -1` = 머지 커밋, 웹 응답 200 (→ 마이그레이션 실패면 R1, 앱 이상이면 R2) |
| 4 | 마이그레이션 확인 | `$DC run --rm etl pnpm prisma migrate status` · 새 테이블 3개 존재 | "Database schema is up to date", 테이블 3개 (→ R1) |
| 5 | **수집 정지 걸기**(점검 끝까지 수집이 돌지 않게, 이중 안전) | `$OPS scripts/ops/reconcile-transactions.ts --set-halt --reason="D0 배포 점검"` | `"active": true` |
| 6 | 화면 확인(해제 배지 등 S1) | 해제 거래가 있는 아파트 3곳·없는 곳 2곳, 모바일 포함 | 해제 배지·범례·건수 정상(→ R2) |
| 7 | 해제 아파트 재집계 dry-run | `$OPS scripts/ops/reaggregate-properties.ts --target=cancelled-apartments` | 변경 예정 약 14,900(S4: 14,923). ±10% 밖이면 중단·확인 |
| 8 | **1묶음 적용** | `$OPS scripts/ops/reaggregate-properties.ts --target=cancelled-apartments --apply --max-batches=1 --backup-dir=/backups/reagg --checkpoint=/backups/reagg/cp.json --stop-file=/backups/reagg.stop` | 백업 행 수 = 변경 행 수, 앱 응답 1초 미만 |
| 9 | **1묶음 롤백 검증** | 8의 백업 파일로 `--rollback=/backups/reagg/<파일>.jsonl` → 같은 `--max-batches=1` dry-run이 다시 같은 변경 수를 보이는지 | 복원 행 수 = 백업 행 수, 재 dry-run 변경 수 = 8과 같음 (→ 다르면 R3, 중단) |
| 10 | 해제 아파트 전체 적용 | 8과 같은 명령에서 `--max-batches` 빼고(체크포인트 새로) | 완료, 재 dry-run 변경 0, 화면 3곳 상단 최근가 = 그래프 최근가 |
| 11 | **S3 1묶음**(일일 수집 20범위만, 수동) | 정지를 잠깐 풀지 않고 쓰기 위해 해제 → 실행 → 다시 정지: `--clear-halt --reason="D0 S3 1묶음"` → `$DC run --rm etl pnpm ingest:run --mode=daily --limit=20` → `--set-halt --reason="D0 S3 1묶음 검증"` | 종료 0, 차단기 없음, 범위 20개 OK, 가드 0, 보관 ≤ 2%·삽입 ≤ 25%(요약 로그) |
| 12 | S3 1묶음 검증 | 바뀐 매물 3곳 화면(해제 표시·건수), `reaggregate-properties --target=ids --ids=<바뀐 매물>` dry-run | 집계 차이 0 |
| 13 | **S3 1묶음 롤백 검증**(운영에서 롤백 경로를 한 번 실제로) | `$OPS scripts/ops/reconcile-transactions.ts --rollback-since=<11 시작 시각>` (dry-run: 대상 = 변경 있던 실행, 충돌 0) → `--apply --audit-dir=/backups/reconcile-rollback` | `verify.ok = true`(거래 수 변화 = 복원 − 삭제, 남은 기록 0, 집계 차이 0) (→ 실패면 R4) |
| 14 | 다시 적용 | `--clear-halt` → `$DC run --rm etl pnpm ingest:run --mode=daily --limit=<13에서 되돌린 실행 수>` → `--set-halt`. 변경 없이 끝난 범위는 OK라 건너뛰고, 되돌린 실행(ERROR)이 앞 순서라 그것만 다시 처리된다 | 11과 같은 삽입·보관 수 |
| 15 | **정지 해제 전 표본 dry-run**(§3) | 아래 절차 | 기준 통과 |
| 16 | 정지 해제·타이머 재개 | `--clear-halt --reason="D0 점검 통과"` → `sudo systemctl start imjang-etl@transactions-daily.timer` | 다음 실행 15:00 UTC 예약 표시 |
| 17 | 종료 기록 | `df` · WAL 크기 · load · 앱 응답 | 여유 11GB 이상 |

**D0 밤(15:00·19:00 UTC 일일 수집 = 첫 S3 전체 일일)** — 다음 날 아침 확인: 알림 요약의 `breaker`(없어야 함)·`notStarted`(0)·가드 수·삽입·보관, `aggregateQueueRemaining`(0), 정지 상태(`--halt-status` = false). 이상이면 §4 표.

## 3. 정지 해제 전 표본 dry-run 절차 (D0 15번, 그리고 자동 중단 뒤 매번)
1. 표본: 이상이 났던(또는 대표) API별로 시군구·월 5개씩, 최소 10범위. 자동 중단 뒤라면 중단 로그의 `lastScope` 범위를 반드시 넣는다.
2. 실행(읽기만, 매물 생성 없음): `$OPS scripts/ops/reconcile-transactions.ts --api=<api> --sgg=<코드들> --months=<YYYYMM들> --out=/backups/dryrun-<시각>.jsonl`
3. 기준(모두 만족해야 해제): 가드 0 · 오류 0 · 보관 ≤ 2%(DB 행 대비) · 삽입 ≤ 25%(원천 행 대비, 첫 바퀴 아파트 전월세는 ≤ 15% 관측) · `abnormal`·`incomplete` 없음.
4. 해제 사유에 원인·조치·표본 결과를 적는다: `--clear-halt --reason="원인: … / 조치: … / 표본 12범위 가드0 보관0.4% 삽입7%"`.
5. 원인을 고치지 못했으면 해제하지 않는다(해제 한 번에 약 20범위가 다시 바뀌고 멈춘다 — 리허설 2차).

## 4. 진행·중단·롤백 판단 기준

| 상황 | 판단 | 조치 |
|---|---|---|
| 각 단계 통과 기준 충족, 앱 응답 평균 < 100ms·최대 < 1초, load < 4 | **진행** | 다음 단계 |
| 앱 응답 1초 초과 3회 연속, load 4 초과 5분, 미승인 잠금 30초 초과, 활성 DB 세션 10 초과 지속, 디스크 여유 10GB 미만 | **일시 중단** | 재집계: `touch /opt/imjang/backups/reagg.stop`(현재 묶음 뒤 멈춤, `--resume`으로 재개). 재정합: `--set-halt` |
| 차단기 정지(알림 `ETL run stopped by breaker`) | **중단 + 원인 조사** | 정지는 자동. 중단 로그(사유·값·누적·마지막 범위) 확인 → 원인이 원천 이상이면 R4로 그 기간 롤백 여부 결정 → §3 거쳐 해제 |
| 원천 한도 초과(오류 메시지 `LIMITED_NUMBER_OF_SERVICE_REQUESTS`)로 차단기 정지 | **중단(데이터 이상 아님)** | 원인 확인 → 한도 재설정(KST 0시) 뒤 §3 표본 dry-run(호출 10회 안팎) → 해제 |
| 대기열을 비운 뒤에도 집계 차이 남음, 보관·삽입 비율이 dry-run(§14)의 2배 초과, 화면 이상 보고 | **롤백** | 원인 단계에 맞춰 R2~R4 |
| 마이그레이션 실패 | **롤백** | R1 |

## 5. 롤백 절차

| 코드 | 상황 | 절차 |
|---|---|---|
| R1 | 마이그레이션 실패(배포가 `migrate deploy`에서 멈춤 — 웹은 옛 버전 유지, ETL 이미지는 새 코드) | (운영 복제본에서 실패를 일부러 만들어 검증, §8-3) ① 수집 타이머 정지 유지(2단계) ② `$DC run --rm etl pnpm prisma migrate status`로 **실패한 마이그레이션 하나**를 확인. 마이그레이션은 하나씩 트랜잭션으로 적용돼, 실패한 것은 객체를 남기지 않고 앞서 성공한 것(예: S2 대기열 테이블)은 그대로 남는다 ③ **테이블을 지우지 않는다.** 성공한 마이그레이션의 테이블을 지우면 기록(적용됨)과 실제가 어긋난다. 실패한 마이그레이션의 객체가 혹시 남아 있으면 `SELECT count(*)`로 0행인지 확인한 뒤 그 객체만 지운다(행이 있으면 지우지 말고 중단 — `TransactionArchive`는 거래 원본 보관이라 지우면 복구 수단을 잃는다) ④ `$DC run --rm etl pnpm prisma migrate resolve --rolled-back <실패한 이름>` ⑤ 둘 중 하나: (a) 원인을 고쳐 같은 코드 재배포(실패한 마이그레이션만 다시 적용) 또는 (b) revert PR 머지·재배포 — 옛 코드는 남은 S2 기록·테이블을 무시한다("No pending migrations", "schema is up to date" 확인) ⑥ 수집 타이머 재개 |
| R2 | 앱 이상(화면·성능), 데이터는 정상 | ① `--set-halt` ② S3 변경이 이미 있으면 **먼저 R4로 재정합 일괄 롤백**(revert하면 롤백 도구가 사라진다) ③ 재집계를 했으면 R3 ④ revert PR 머지·배포. 새 테이블은 남겨도 무해 ⑤ 타이머 재개 |
| R3 | 재집계 결과 이상 | `$OPS scripts/ops/reaggregate-properties.ts --rollback=/backups/reagg/<파일>.jsonl` (묶음마다 UPDATE 전에 백업이 기록돼 있다) → 같은 대상 dry-run으로 원래 변경 수가 다시 보이는지 |
| R4 | 재정합 결과 이상 | ① `--halt-status`(아니면 `--set-halt`) ② `--rollback-since=<시각> [--rollback-until] [--source] [--sgg]` dry-run: 대상·예상·충돌 ③ 충돌이 있으면 기간·범위를 좁힌다 ④ `--apply --audit-dir=/backups/reconcile-rollback` ⑤ `verify.ok` 확인(아니면 감사 로그로 남은 실행 확인 후 같은 명령 재실행 — 끝난 실행은 건너뛴다) ⑥ 원인 수정 → §3 → 해제 |
| R5 | 최후 수단(데이터 손상 의심, R3·R4로 안 됨) | 사이트 점검 공지 → 모든 ETL 타이머 정지 → B3 덤프를 **새 데이터베이스**에 복원해 대조 → **S1~S3가 다루는 테이블만** 교체(`Transaction`·`Property`, 필요하면 `IngestionRun`·새 테이블 3개). 다른 테이블(구독·게시글·가이드·생활시설·건축물대장 등)은 백업 뒤 기록이 있을 수 있어 교체하지 않는다. 전체 교체는 별도 승인 |

## 6. D+1 이후

| 시점 | 할 일 | 통과 기준 |
|---|---|---|
| D+1 오전 | D0 밤 일일 결과 확인(§2 끝) | 차단기 없음, 정지 false, 대기열 0 |
| D+1 (02:00 UTC 전후) | **S5 전체 재집계**: `--target=all` dry-run(예상 약 8.5만 — 해제 아파트·첫 일일분 제외) → 1묶음 `--apply --max-batches=1` → 백업 롤백 검증 → `--max-batches=10` → 나머지 `--resume`. 묶음 2,000·휴식 2초, 정지 파일 `/backups/reagg.stop` | 각 단계 재 dry-run 변경 0, §4 진행 기준 |
| D+1 종료 | 색인 매물 수 변화 확인(§12-3: 36,209 → 약 35,600) | ±5% 안 |
| D+2 | `bash deploy/systemd/install-timers.sh` → `transactions-recheck`(매일 16:30 UTC)·`property-aggregates`(23:30)·`property-aggregate-check`(일 01:00) 시작 | 타이머 목록에 3개 추가 |
| D+3 ~ D+9 | 재확인 첫 주기(2~6개월 전) 매일 알림 확인 | 차단기 없음, 보관 ≤ 2% |
| D+9 이후 | 주간 점검을 `--enqueue-diff`로 전환(별도 승인) | 주간 차이 0 근처 |
| D+30 | 7~12개월 전 첫 바퀴 완료, P3 덤프 삭제 | — |

**재집계 대기열 확인(검토 결과)**: D0~D+2 사이 `property-aggregates` 타이머가 없어도 집계가 빠지지 않는다 — 재정합이 넣은 대기열은 같은 수집 프로세스 끝에서 비우고(하루 2회), 일괄 롤백도 스스로 비운다. 12개월 경계(타이머만 처리)는 D+1 S5가 전부 다시 계산하고, D+2 첫 타이머가 최근 3일을 겹쳐 본다(`overlapDays=3`). 단 ① 실행 단위 롤백(`--rollback-run`)은 대기열에 넣기만 하므로 직후 `$DC run --rm etl pnpm tsx scripts/ingest/property-aggregates/runner.ts --mode=daily`로 비운다(정지 상태에서는 수집이 돌지 않아 대기열이 그대로 남는다) ② 타이머 시작(D+2)은 **S5 완료 후 3일 안**이어야 경계가 빠지지 않는다(늦어지면 S5 대상 dry-run으로 차이 확인).

**타이머 정지·재개 순서 요약**: (정지) `transactions-daily` — D0 2단계 / (재개) D0 16단계 / (신규 시작) `transactions-recheck`·`property-aggregates`·`property-aggregate-check` — D+2. 다른 ETL(청약·관리비·건축물대장 등)은 거래 테이블을 쓰지 않아 그대로 둔다.

## 7. 남은 위험(배포를 막지는 않음)
- 정지 상태에서는 일일 수집도 멈춘다 — 정지 알림 후 빠른 확인이 필요하다.
- 차단기 기준은 표본에서 정한 상수다. 첫 주기 결과로 조정할 수 있다(배포 필요).
- 단지명 변경으로 매물이 갈리는 기존 문제, 병합 도구 재작성(`--apply` 차단 유지), 거래 0건 새 매물 정리는 후속 과제.
- 정기 외부 백업이 없다 — 이번 배포와 별개로 박스 밖 정기 백업 수단을 정해야 한다.

## 8. 사전 백업·복원 검증 결과 (2026-10-28 08:24~08:45 UTC)
- **보관:** `~/imjang-backups/imjang-prod-20261028.dump`(운영자 로컬, 저장소 밖, 권한 600·폴더 700, FileVault 암호화 디스크). 저장소·공개 경로에 없음. 복원용 임시 비밀번호 파일은 검증 뒤 삭제.
- **사전 확인:** 로컬 여유 226GB·Docker 413GB, 운영 load 0.58·수집 없음(다음 15:00 UTC). 개인정보가 있을 수 있는 `EmailSignup`은 스키마만(데이터 제외 — 운영도 0행).

### 8-1. 덤프
| 항목 | 값 |
|---|---|
| 방식 | 읽기 전용 세션, `nice -n 19`, `-Fc -Z3`, SSH로 로컬에 직접 저장(박스 디스크 사용 0) |
| 시간·크기 | 96초 · 880MB(49개 테이블 데이터) |
| 운영 영향(10초 간격 14샘플, 덤프 전후 대조 포함 약 2.5분) | load 평균 2.74·최대 3.66, CPU 평균 87%·최대 100%, 앱 응답 평균 96ms·최대 0.69초, 디스크 여유 14GB |
| 일관성 | 덤프 전·후 운영 대조 출력이 완전히 같음 |

### 8-2. 복원 대조(운영 vs 복원본, `verify.sql` 출력 `diff` = 차이 없음)
| 항목 | 값(운영 = 복원본) |
|---|---|
| 테이블 | 50개, 전체 11,904,047행(테이블별 정확한 행 수 일치) |
| 스키마 | 컬럼 873 · 인덱스 169 · 제약 67 지문 일치, 확장 pg_trgm 1.6·plpgsql 1.0·postgis 3.5.3, 마이그레이션 48개(마지막 `20261027000000_add_hospital_nemc_hours`) |
| Transaction | 8,133,304행, id 합·금액·보증금·월세·면적 합, 해제 35,690·해제일 32,821, 계약일 2023-01-01~2026-10-26, **행 내용 해시** 일치 |
| Property | 278,926행, 집계 컬럼 합 12종·리다이렉트 2,080·면적대 수, **행 내용 해시**(위치 좌표 포함) 일치 |
| Region | 23,848행 해시 일치 |
| 복원 시간 | 52초(4병렬), 복원 DB 5.2GB, 오류 0(`template0` 기반 DB) |

### 8-3. 마이그레이션 리허설(복원본 사본)
- **정상 적용:** 2개 1초. 기존 데이터(집계·행 해시) 변화 없음, 새 테이블 3개(0행)·컬럼 12·인덱스 7·제약 3만 늘어남.
- **실패 주입**(S3 테이블 이름 충돌): S2 적용 완료, S3 실패(P3018) — S3 객체는 남지 않음(트랜잭션 롤백). `migrate resolve --rolled-back` 후 (a) 옛 코드 마이그레이션 폴더로 `deploy`·`status` → "No pending", "up to date"(S2 테이블을 지울 필요 없음), (b) 원인 제거 후 같은 코드 재배포 → 정상 적용과 같은 상태(기록 1행 차이만). → R1 절차를 '테이블 삭제'에서 '실패한 것만 rolled-back 표시'로 고쳤다.
