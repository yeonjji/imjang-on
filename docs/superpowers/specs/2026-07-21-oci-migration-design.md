# Vercel + Supabase → Oracle Cloud 자립 마이그레이션 설계

- 작성일: 2026-07-21
- 상태: 설계 승인 대기
- 대상 도메인: imjangon.co.kr
- 목표 인프라: OCI Ampere A1 (aarch64, 2 OCPU / 11GB RAM / 45GB disk, Ubuntu 24.04) — `161.33.160.159`

---

## 1. 배경 & 목표

현재 Next.js 15 앱은 Vercel(hnd1/도쿄)에서 호스팅되고, DB는 Supabase Postgres/PostGIS를 사용한다. 최근 인프라 비용이 급증했다(3일 $16.20 ≈ 월 $160+). 주 원인은 (A) egress 전송비, (B) `/api/staticmap`을 두드리는 Azure 스크래퍼, (C) ISR 쓰기 쓰레싱이다.

**목표:** 앱과 DB를 모두 OCI 단일 인스턴스로 이전하여 **반복 인프라 비용을 $0**로 만든다(OCI always-free + Cloudflare free). Supabase를 완전히 폐기하고, 잃게 되는 Vercel 엣지 기능(CDN·WAF·TLS)은 Cloudflare 무료 플랜으로 대체한다.

**비목표(이번 범위 밖):** 성능 최적화, 멀티노드/HA, 재설계. 최소 변경으로 "동일 기능 · 다른 인프라"를 달성한다.

---

## 2. 확정된 결정 (브레인스토밍 산출)

| # | 항목 | 결정 | 근거 |
|---|---|---|---|
| 1 | 마이그레이션 범위 | **앱 + DB 완전 자립** (Supabase 폐기) | 반복 비용 $0 목표 |
| 2 | 전환 다운타임 | **유지보수 창(수십분~수시간) 허용** → big-bang | 단순·확실, 트래픽 규모상 수용 가능 |
| 3 | 엣지(CDN·WAF·TLS) | **Cloudflare 무료 플랜** | Vercel 엣지 대체, 스크래퍼 차단 |
| 4 | 앱↔CF 연결 | **Cloudflare Tunnel(cloudflared)** | 인바운드 포트 0, origin IP 은닉 |
| 5 | ETL 크론 9종 | **GitHub Actions 유지** → DB를 Tunnel TCP + CF Access로 접속 | 기존 워크플로 재사용 |
| 6 | 배포 | **Actions→SSH→온박스 `docker compose up -d --build`** | 레포 PUBLIC이라 self-hosted 러너 부적합 |

### 코드베이스 사전 확인 (마이그레이션 난이도 근거)
- **supabase-js 사용 0건** → Supabase Auth/Storage/Realtime/Edge Functions 의존 없음. **순수 Postgres만 이전**하면 됨.
- 필요한 확장: `postgis, pg_trgm, fuzzystrmatch, postgis_tiger_geocoder, postgis_topology` — 전부 `postgis/postgis:16` 이미지에 포함.
- Vercel 전용 코드: `app/layout.tsx`의 `@vercel/analytics` + `@vercel/speed-insights` 2줄뿐 (GA·AdSense는 무관).
- Prisma 마이그레이션 33개 → `prisma migrate deploy`로 스키마 재현 가능.
- 레포: `yeonjji/imjang-on` **PUBLIC**.

---

## 3. 목표 아키텍처

```
사용자
  │  HTTPS (imjangon.co.kr)
  ▼
Cloudflare (DNS · CDN · WAF · 자동 TLS · Bot/DDoS 방어)
  │  Cloudflare Tunnel (아웃바운드 전용)
  ▼
OCI 박스 (Ampere A1, Ubuntu 24.04)
  ├─ cloudflared        : 터널 클라이언트 (인바운드 포트 없음)
  └─ docker compose
       ├─ web  : Next.js 15 standalone (ARM) — :3000 (localhost)
       └─ db   : postgis/postgis:16 — :5432 (localhost, named volume)

인바운드 개방 포트: SSH(22)뿐. HTTP/HTTPS/Postgres 포트는 외부 미개방.
```

**두 개의 터널 경로:**
1. **HTTP 경로** — `imjangon.co.kr` → CF → Tunnel → `web:3000`. 일반 사용자 트래픽.
2. **TCP 경로(DB)** — `db-tunnel.imjangon.co.kr` (TCP 타입) → Tunnel → `db:5432`. **Cloudflare Access 서비스토큰으로 보호**. GitHub Actions ETL만 `cloudflared access tcp`로 접속.

- **ISR**: Next standalone은 온디스크 캐시로 ISR을 단일 노드에서 그대로 지원(멀티노드 아님 → 공유 캐시 불필요).
- **이미지 최적화**: `next/image`가 sharp(ARM)로 온박스 처리.
- **스크래퍼 방어**: origin IP가 은닉되고 인바운드가 없으므로 origin 직격 불가. `/api/staticmap` 남용은 Cloudflare WAF/rate-limit 규칙으로 엣지에서 차단.

---

## 4. 구성요소 상세

### 4.1 OCI 프로비저닝
- Docker Engine + docker compose plugin 설치 (arm64).
- Ubuntu `ufw`: 22(SSH)만 허용. OCI 콘솔의 **Security List / NSG도 동일하게** 22만 인그레스 허용(HTTP/HTTPS/5432 미개방).
- 스왑 없음 확인됨 → `next build`/Postgres 안정성 위해 **4~8GB 스왑파일 추가** 권장(11GB RAM이지만 빌드 피크 대비).
- 디스크 45GB → DB 볼륨·이미지·ISR 캐시 배치. 여유 충분하나 사용량 모니터링. OCI always-free 블록스토리지 200GB까지 무료 확장 가능.

### 4.2 Docker Compose 스택
- `web`: 멀티스테이지 `Dockerfile`(deps→build→runner), `output: 'standalone'` 산출물 실행. `restart: unless-stopped`. 환경변수는 `.env.production`.
- `db`: `postgis/postgis:16`, named volume `pgdata`, `restart: unless-stopped`, localhost 바인딩(`127.0.0.1:5432`). 초기 컨테이너 postgres 슈퍼유저로 `--data-only` 로드 시 `--disable-triggers` 사용 가능.
- `cloudflared`: 별도 systemd 서비스 또는 compose 서비스로 상시 기동. 터널 토큰 보관.

### 4.3 앱 코드 변경 (최소·외과적)
1. `next.config.mjs`: `output: 'standalone'` 추가. 기존 `outputFileTracingIncludes`(OG 폰트)는 standalone에서도 유지되도록 확인.
2. `app/layout.tsx`: `@vercel/analytics`·`@vercel/speed-insights` import 및 `<Analytics/>`·`<SpeedInsights/>` 제거. package.json에서 해당 devDep도 제거.
3. `.env.production` 신규:
   - `DATABASE_URL` / `DIRECT_URL` → `postgresql://...@localhost:5432/imjang_on`(Supabase 풀러 URL 폐기, 두 값 동일하게).
   - `SITE_URL` → `https://imjangon.co.kr`(Cloudflare 공개 도메인). **Vercel 배포보호 URL 아님** → revalidate 401 이슈류 소멸.
   - 나머지 키(PUBLIC_DATA_KEY, NAVER, GA, Sentry 등) 그대로 이전.
4. `Dockerfile`, `docker-compose.yml`, `.dockerignore` 신규 추가.
5. 그 외 앱 로직·Prisma 스키마·Sentry·GA·AdSense는 **불변**.

### 4.4 DB 이전 (권장: 스키마=Prisma, 데이터만 복사)
1. OCI에서 `db` 컨테이너 기동 → `prisma migrate deploy`로 33개 마이그레이션 적용 → 깨끗한 스키마 + 확장 생성.
2. **유지보수 창 진입**: ETL 워크플로 일시중지(disable) + 앱 쓰기 중단.
3. Supabase에서 `pg_dump --data-only --schema=public`(+ 필요시 `--disable-triggers`), PostGIS `spatial_ref_sys` 등 확장 소유 테이블 **제외**.
4. OCI DB로 로드 → **행 수 / 주요 테이블 체크섬 검증**.
5. `prisma migrate status`로 정합성 확인.
- **대안(단순)**: 전체 `pg_dump`/`pg_restore`(`--no-owner --no-acl`). 간단하나 Supabase 역할/스키마 노이즈 동반 → 데이터만 복사를 우선.
- **사전 측정**: `SELECT pg_size_pretty(pg_database_size(...))` 로 실제 용량 확인(예상 <10GB).

### 4.5 ETL 접속 (GitHub Actions 유지)
- Cloudflare Tunnel에 **TCP 타입 public hostname**(예: `db-tunnel.imjangon.co.kr`) 추가 + **Cloudflare Access 애플리케이션(서비스토큰)** 으로 보호.
- 각 ETL 워크플로 앞단에: `cloudflared access tcp --hostname db-tunnel... --url localhost:5432` 실행 → 스크립트는 `localhost:5432`로 접속.
- GH Secrets: `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, DB 접속 문자열.
- 영향받는 워크플로: DB에 접속하는 모든 워크플로(스케줄 9종 — `ingest-transactions-daily`, `backfill-transactions-loop`, `ingest-subscriptions`, `ingest-loan`, `ingest-jeonse-guarantee`, `ingest-amenities`, `generate-board-posts`, `seed-regions`, `pg-dump-backup` — 및 수동 트리거 `generate-guides`, `warm-hub-cache`, `regeocode-properties`, `restructure-articles` 등). 공통 composite action으로 터널 셋업을 1곳에 둔다.
- **revalidate/warm**: 이제 `SITE_URL`이 공개 Cloudflare 도메인 → 정상 동작.

### 4.6 배포 (CD)
- `push → main` 시 GitHub Actions:
  1. lint/typecheck/test 게이트(기존 ci.yml 재사용).
  2. SSH 배포키(GH Secret)로 박스 접속.
  3. `git pull` → `docker compose build web` → **`docker compose run --rm web pnpm prisma migrate deploy`** → `docker compose up -d`.
- **효과**: 마이그레이션이 배포에 포함되어 기존 "Vercel은 마이그레이션 미적용 → 수동 deploy 필요" 갭이 제거됨.
- 빌드는 온박스(2 OCPU) — `next build` 수 분. 스왑으로 OOM 방지.

### 4.7 백업 (직접 소유)
- 온박스 nightly cron: `pg_dump | gzip` → **OCI Object Storage(always-free 10GB)** 업로드 + 보존정책(예: 일 7 / 주 4).
- 기존 `pg-dump-backup.yml`(주간) 대체 또는 이중화.
- 월 1회 복원 리허설(재해복구 검증)은 향후 과제.

### 4.8 모니터링
- Sentry 유지.
- 업타임: UptimeRobot 무료 또는 Cloudflare Health Checks.
- 컨테이너: `restart: unless-stopped` + `docker compose` healthcheck. 필요시 경량 대시보드(dozzle/netdata)는 선택.

---

## 5. 컷오버 런북 (순서)

1. **준비(무중단):** OCI 프로비저닝 → Docker/스왑/ufw → 앱 코드 변경(standalone, Vercel 제거, Dockerfile/compose) 브랜치 작성·테스트.
2. **터널:** Cloudflare 계정에 도메인 연결(네임서버 이전) → Tunnel(HTTP+TCP) 구성 → Access 서비스토큰 발급.
3. **스키마:** OCI `db` 기동 → `prisma migrate deploy`.
4. **드라이런:** Supabase → OCI 데이터 로드 리허설 1회(용량/시간 측정, 검증 스크립트 확정).
5. **유지보수 창 진입:** ETL 워크플로 disable, 공지.
6. **최종 데이터 복사:** `pg_dump --data-only` → OCI 로드 → 검증(행 수·체크섬).
7. **앱 기동:** `docker compose up -d`(web) → Tunnel로 스테이징 검증.
8. **DNS 전환:** Cloudflare에서 `imjangon.co.kr`을 Tunnel로 → 전파 확인.
9. **ETL 재개:** 워크플로에 CF Access 터널 셋업 반영 후 재활성화.
10. **관측:** Sentry/업타임/비용 24~72h 모니터링.
11. **정리:** 안정 확인 후 Vercel 프로젝트 중지, Supabase 프로젝트 유지(롤백 대비) → 수일 후 폐기.

---

## 6. 리스크 & 완화

| 리스크 | 영향 | 완화 |
|---|---|---|
| **단일 인스턴스 SPOF** | 박스 다운 시 전체 다운(HA 없음) | 완전 자립 선택의 근본 트레이드오프. `restart:unless-stopped`, 스냅샷 백업, 빠른 재기동 런북. 필요 시 향후 이중화. |
| **ETL over Tunnel 지연** | 대량 insert(실거래가)에서 터널+TLS 오버헤드로 ETL 시간 증가 | 배치 크기/트랜잭션 튜닝. 심하면 해당 크론만 온박스 systemd로 이전(설계 D 대안). |
| **OCI 리전 지연** | origin 동적 응답 TTFB(한국 사용자) | 리전 확인(가급적 ap-seoul/ap-chuncheon/ap-tokyo). 정적은 CF CDN이 커버. |
| **디스크 45GB 포화** | DB/ISR/이미지 증가 | 사용량 모니터, 200GB까지 무료 확장. |
| **빌드 OOM(온박스)** | 배포 실패 | 스왑 4~8GB, `docker compose build` 단독 실행. |
| **Cloudflare 무료 한도/의존** | 벤더 종속 | 표준적·무료. TLS·WAF·DDoS 이득이 종속보다 큼. |
| **컷오버 중 데이터 유실/불일치** | 정합성 | 유지보수 창에 쓰기 중단 + 체크섬 검증 + Supabase 유지(롤백). |

---

## 7. 롤백 전략

- DNS만 Supabase-백드 Vercel로 되돌리면 즉시 복구(컷오버 후 수일간 Vercel·Supabase 유지).
- 데이터는 컷오버 시점 이후 OCI에만 쌓이므로, 롤백 시 OCI→Supabase 역동기화 또는 창 재확보 필요 → **안정화 확인 전까지 이중 운영 유지**.

---

## 8. 성공 기준

- [ ] `imjangon.co.kr`가 OCI origin에서 Cloudflare 경유로 정상 서빙(주요 라우트 200, ISR 동작).
- [ ] Supabase 접속 0건(앱·ETL 모두 OCI DB 사용).
- [ ] 9종 ETL 워크플로가 CF Access 터널로 OCI DB에 접속·성공.
- [ ] 배포 파이프라인이 `migrate deploy` 포함해 push→main으로 동작.
- [ ] nightly 백업이 OCI Object Storage에 적재.
- [ ] 인바운드 개방 포트 SSH뿐. origin IP 비노출.
- [ ] Vercel·Supabase 반복 비용 $0(중지/폐기 후).
- [ ] Sentry 에러율·응답시간이 이전 대비 회귀 없음.

---

## 9. 오픈 이슈 (구현 전 측정/확인 필요)

1. Supabase 실제 DB 용량(pg_size) — 45GB 대비·덤프 소요시간 산정.
2. OCI 인스턴스 리전(한국 사용자 지연) 확인.
3. `regeocode-properties` 등 좌표/네이버 API 크론이 KAKAO/네이버 키 의존 여부(온박스/CI 접속 키 정리).
4. Cloudflare 계정·도메인 네임서버 이전 가능 여부(현재 DNS 등록기관).
5. OG 이미지 라우트가 standalone에서 폰트 트레이싱 정상인지 스테이징 검증.

---

## 10. 범위 밖 / 향후

- HA/멀티노드, 로드밸런싱, 읽기복제.
- WAL 아카이빙 기반 PITR(현재는 nightly 덤프로 충분).
- ETL 전량 온박스 이전(설계 D 대안) — ETL 지연이 문제될 때 재검토.
- 관측 스택 고도화(Grafana 등).
