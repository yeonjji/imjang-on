# S1·S2 운영 배포 런북 (S3 보류)

- 작성일: 2026-10-31 · 상태: **승인 대기** · 배포 예정: 2026-11-03(화) 오전
- 대상 PR: **#345**(S2, S1 포함 — 기준을 main으로 변경). #344(S1)는 #345 머지로 함께 들어간다. **#346(S3)은 보류**(초안).
- 원본: S1~S3 런북 `docs/superpowers/plans/2026-10-28-s1-s3-deploy-runbook.md`(S3 브랜치) — 이 문서는 그중 S1·S2에 해당하는 단계만 옮겼다. 설계: `docs/superpowers/specs/2026-10-27-property-aggregate-integrity-design.md`.
- 원칙: 각 단계는 **통과 기준을 만족해야 다음으로** 간다. 운영 쓰기가 있는 단계는 승인자가 지켜본다.

## 0. 결정·범위 (2026-10-31)

| 항목 | 내용 |
|---|---|
| 하는 것 | **S1** 유효 거래 기준 통일(해제 거래를 통계·비교·집계에서 제외) + 실거래 내역 해제 표시 · **S2** 재집계 대기열·12개월 경계·재집계 도구, 해제 아파트(D0)·전체(D+1) 재집계 |
| 안 하는 것 | **S3 거래 재정합**(거래 행 추가·보관, 매일 재확인 잡, 추가 API 호출, 정지·일괄 롤백 도구) — 운영 부담을 줄이려 보류. 늦게 신고된 거래 미반영은 그대로 남는다 |
| 거래 행 | **바꾸지 않는다.** S1·S2는 `Property` 집계 컬럼만 다시 계산한다(+ 새 테이블 `PropertyAggregateQueue`) |
| 마이그레이션 | 1개: `20261028000000_add_property_aggregate_queue`(새 테이블만). 운영에 이미 적용된 `20261030000000`보다 이름이 앞서지만 `migrate deploy`가 미적용분으로 적용함을 main 상태 로컬 DB에서 확인(2026-10-31) |
| 머지 | #345 **merge commit**(squash 금지). main이 움직이면 #345에 main merge → CI 다시 |
| 새 정기 잡(D+2부터) | `property-aggregates`(매일 23:30 UTC — 12개월 경계 + 대기열 비우기), `property-aggregate-check`(일 01:00 UTC — 읽기 전용 점검). S3의 `transactions-recheck`는 없다 |
| 알림 | 박스에 `DISCORD_WEBHOOK_URL` 없음 — 웹훅 없이 진행(사용자 결정). D0·D+1은 단계마다 직접 확인 |

### 사전 확인(2026-10-31)
| 항목 | 결과 |
|---|---|
| main 합침 | `a776eb0` — 충돌은 `deploy/run-etl.sh`·`install-timers.sh`(S2 잡·타이머 vs 목록 점수 잡·타이머) 양쪽 유지, 타이머 15개 |
| 로컬 전체 검증 | lint·typecheck·unit 2,012·integration 163·build 통과(main 상태 + S2 마이그레이션 DB) |
| 디스크·WAL | 여유 14GB(기준 12GB 이상, 당일 재확인) · WAL 384MB / max 1GB |
| API 한도 | 국토부 6종 각 10,000건 — S1·S2는 호출을 늘리지 않는다 |

## 1. D0 — 11/3(화) 오전 (수집 타이머 없는 시간, 소요 약 1시간)

박스 약칭:
```bash
cd /opt/imjang
DC="docker compose -f deploy/docker-compose.yml --profile tools --env-file deploy/.env.production"
OPS="$DC run --rm -v /opt/imjang/backups:/backups etl pnpm tsx"
sudo mkdir -p /opt/imjang/backups/reagg && sudo chown -R ubuntu /opt/imjang/backups
```

### 1-0. 백업과 데이터 동결
| # | 할 일 | 명령 | 통과 기준(→ 아니면) |
|---|---|---|---|
| B1 | 실행 중인 ETL 없음 | `systemctl list-units 'imjang-etl@*' --state=active` | 없음(`building-register` 보통 22:40 UTC = 07:40 KST 종료) |
| B2 | 거래 수집 타이머 정지 | `sudo systemctl stop imjang-etl@transactions-daily.timer` | `inactive` — 배포 중 새 ETL 이미지가 옛 스키마에 붙지 않게 |
| B3 | 백업(로컬로 직접, `umask 077`) | `ssh <box> 'cd /opt/imjang/deploy && docker compose --env-file .env.production exec -T db sh -c "PGOPTIONS=\"-c default_transaction_read_only=on\" nice -n 19 pg_dump -U \$POSTGRES_USER -d \$POSTGRES_DB -Fc -Z3 --exclude-table-data=\"\\\"EmailSignup\\\"\""' > ~/imjang-backups/imjang-prod-20261103.dump` | 종료 0, 약 0.9GB, 권한 600 |
| B4 | 백업 확인 | 덤프 직전·직후 운영에서 `~/imjang-backups/verify.sql` 실행 → `diff` | 차이 없음 |
| B5 | 머지 직전 변동 확인 | `verify.sql` 다시 실행해 B4와 비교 | 거래·매물·지역·`IngestionRun` 같음(→ 다르면 원인 확인 후 B3부터) |

### 1-1. 배포와 재집계
| # | 할 일 | 명령 | 통과 기준(→ 아니면) |
|---|---|---|---|
| 1 | 시작 전 상태 | `df -BG /` · `uptime` · `git log --oneline -1` | 여유 12GB 이상, load 2 이하, 박스 = main 최신(2026-10-31 기준 `0091ba7`) |
| 2 | 머지 → 자동 배포 | #345 merge commit → `ci` → `deploy` | deploy 성공, 박스 `git log -1` = 머지 커밋, 웹 200(→ 마이그레이션 실패 R1, 앱 이상 R2) |
| 3 | 마이그레이션 확인 | `$DC run --rm etl pnpm prisma migrate status` · `PropertyAggregateQueue` 테이블 존재 | up to date(→ R1) |
| 4 | 화면 확인(S1) | 해제 거래가 있는 아파트 3곳·없는 곳 2곳, 모바일 포함 | 해제 배지·범례·정상/해제 건수 정상(→ R2) |
| 5 | 해제 아파트 재집계 dry-run | `$OPS scripts/ops/reaggregate-properties.ts --target=cancelled-apartments` | 변경 예정 약 14,900(S4: 14,923). ±10% 밖이면 중단·확인 |
| 6 | **1묶음 적용** | `... --target=cancelled-apartments --apply --max-batches=1 --backup-dir=/backups/reagg --checkpoint=/backups/reagg/cp.json --stop-file=/backups/reagg.stop` | 백업 행 수 = 변경 행 수, 앱 응답 1초 미만 |
| 7 | **1묶음 롤백 검증** | `--rollback=/backups/reagg/<파일>.jsonl` → 같은 `--max-batches=1` dry-run이 다시 같은 변경 수 | 복원 행 수 = 백업 행 수(→ 다르면 R3, 중단) |
| 8 | 해제 아파트 전체 적용 | 6에서 `--max-batches` 빼고(체크포인트 새로) | 완료, 재 dry-run 변경 0, 화면 3곳 상단 최근가 = 그래프 최근가 |
| 9 | 거래 수집 재개 | `sudo systemctl start imjang-etl@transactions-daily.timer` | 다음 실행 15:00 UTC 예약 |
| 10 | 종료 기록 | `df` · WAL · load · 앱 응답 | 여유 11GB 이상 |

## 2. D+1 이후
| 시점 | 할 일 | 통과 기준 |
|---|---|---|
| 11/4(수) 오전 | 밤 일일 수집 결과 확인(종료 0, 대기열에 쌓인 매물 수) | 수집 정상 |
| 11/4(수) 02:00 UTC 전후 | **전체 재집계**: `--target=all` dry-run(예상 약 8.5만) → `--apply --max-batches=1` → 백업 롤백 검증 → `--max-batches=10` → 나머지 `--resume`(정지 파일 `/backups/reagg.stop`) | 각 단계 재 dry-run 변경 0 |
| 11/4 종료 | 색인 매물 수 변화(약 36,209 → 35,600) | ±5% 안 |
| 11/5(목) | `bash deploy/systemd/install-timers.sh` → `property-aggregates`·`property-aggregate-check` 시작(목록 점수 타이머는 이미 있음) | 타이머 목록에 2개 추가 |
| ~11/12 | 매일 `property-aggregates` 결과 확인 | 오류 0 |
| 한 달 뒤 | B3 덤프 삭제(필요 없으면) | — |

## 3. 되돌리기
| # | 상황 | 조치 |
|---|---|---|
| R1 | 마이그레이션 실패(배포가 `migrate deploy`에서 멈춤 — 웹은 옛 버전 유지) | ① 수집 타이머 정지 유지 ② `$DC run --rm etl pnpm prisma migrate status`로 실패한 마이그레이션 확인(트랜잭션 단위라 실패분은 객체를 남기지 않는다) ③ **테이블을 지우지 않는다.** 혹시 남은 객체는 `SELECT count(*)`가 0행일 때만 지운다 ④ `$DC run --rm etl pnpm prisma migrate resolve --rolled-back 20261028000000_add_property_aggregate_queue` ⑤ 원인 수정 후 재배포 또는 revert PR 머지·재배포("schema is up to date" 확인) ⑥ 수집 타이머 재개 |
| R2 | 앱 이상, 데이터는 정상 | 재집계를 했으면 R3 → revert PR 머지·배포(새 테이블은 남겨도 무해) → 타이머 재개 |
| R3 | 재집계 결과 이상 | `$OPS scripts/ops/reaggregate-properties.ts --rollback=/backups/reagg/<파일>.jsonl`(묶음마다 UPDATE 전 백업) → 같은 대상 dry-run으로 원래 변경 수 확인 |
| R5 | 최후 수단(데이터 손상 의심) | 점검 공지 → ETL 타이머 정지 → B3 덤프를 새 DB에 복원해 대조 → **`Property`(필요하면 `PropertyAggregateQueue`)만** 교체. 거래 행은 S1·S2가 바꾸지 않으므로 교체 대상 아님 |

## 4. 남은 위험
- **늦게 신고·정정·해제된 거래 미반영**(S3 보류 대가) — 원천 대비 약 8%(표본 dry-run) 거래가 빠진 채 남는다.
- **매물 병합 도구 `--apply` 차단은 S3에 들어 있다** → S1·S2만 배포하면 차단되지 않는다. 병합 도구는 재정합 키 기준 수정 전 **사용 금지**(운영 규칙으로 유지).
- 알림 웹훅 없음 — 정기 잡 실패는 직접 확인해야 보인다.
