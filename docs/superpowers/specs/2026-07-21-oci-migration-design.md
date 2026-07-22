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
| 5 | ETL 크론 | **온박스 systemd 타이머로 이전** (localhost DB) | 터널 대량전송 취약·13개 배선 부담 회피, 더 단순·빠름 |
| 6 | 배포 | **Actions→SSH→온박스 `docker compose up -d --build`** | 레포 PUBLIC이라 self-hosted 러너 부적합 |

### 코드베이스 사전 확인 (마이그레이션 난이도 근거)
- **supabase-js 사용 0건** → Supabase Auth/Storage/Realtime/Edge Functions 의존 없음. **순수 Postgres만 이전**하면 됨.
- 앱이 실제 쓰는 확장은 **postgis + pg_trgm뿐**(마이그레이션이 생성). Prisma `extensions`의 `fuzzystrmatch·tiger·topology`는 선언만 되고 prod 미설치·미사용(→ §2.5).
- Vercel 전용 코드: `app/layout.tsx`의 `@vercel/analytics` + `@vercel/speed-insights` 2줄뿐 (GA·AdSense는 무관).
- Prisma 마이그레이션 33개 → `prisma migrate deploy`로 스키마 재현 가능.
- 레포: `yeonjji/imjang-on` **PUBLIC**.

---

## 2.5 사전검증 결과 (2026-07-21, 실측)

착수 전 OCI·Supabase·DNS를 실측해 가정을 검증했다(아래 수정 반영).

**인프라**
- OCI: `VM.Standard.A1.Flex`, **리전 `ap-tokyo-1`**, 스왑 0, 80/443 미사용. → 리전이 Vercel(hnd1)·Supabase(`aws-1-ap-northeast-1`)와 **동일 도쿄** → origin 지연 불변, 앱+DB 코로케이션으로 DB 지연 개선.
- Supabase: **PostgreSQL 17.6 / PostGIS 3.3.7**, **DB 5.2GB**(Transaction 3.97GB·7.36M행 지배). → 45GB 디스크 충분. **타깃을 PG17로 상향**.
- 설치 확장: `postgis, pg_trgm, pg_stat_statements, pgcrypto, uuid-ossp, supabase_vault, plpgsql`.

**코드/스키마**
- 앱 실사용 확장 = **postgis + pg_trgm뿐**(마이그레이션이 생성). `fuzzystrmatch·tiger·topology`는 Prisma 선언만·**prod 미설치·미사용**. `pgcrypto·uuid-ossp·supabase_vault`는 Supabase 기본설치일 뿐 앱 미사용(`uuid_generate_v4/gen_random_uuid/crypt` 사용 0건). → **`--data-only`+Prisma 스키마가 정답 확정**(전체 덤프는 `supabase_vault` 등으로 실패).
- PK 30종 모두 **BigInt `autoincrement()`**(시퀀스) → 데이터 이전 시 **setval 필수**(`--data-only` 기본 포함, 로드 후 검증).
- 접속 URL: `DATABASE_URL`=트랜잭션 풀러(:6543), `DIRECT_URL`=세션 풀러(:5432) — **둘 다 `pooler.supabase.com`**(진짜 직결 아님). pg_dump는 세션 풀러로 가능하나 드라이런 필요.

**DNS**
- NS=**`ns1/ns2.vercel-dns.com`**(현 Vercel DNS), **MX 없음, apex TXT 없음**. → 이메일 이관 불필요. GSC/네이버SA/AdSense는 apex TXT 아님(HTML/메타 추정) → NS 이전 후 **재검증 필수**, 존 전량 복제 후 전환.

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
  ├─ systemd timers     : ETL 크론 → docker compose run --rm etl ...
  └─ docker compose
       ├─ web  : Next.js 15 standalone (ARM) — :3000 (localhost)
       ├─ etl  : 빌더 이미지(dev deps+tsx+scripts) — on-demand, localhost db
       └─ db   : imresamu/postgis:17-3.5 (ARM64) — :5432 (localhost, named volume)

인바운드 개방 포트: SSH(22)뿐. HTTP/HTTPS/Postgres 포트는 외부 미개방.
```

**터널 경로 (HTTP 단일):**
- `imjangon.co.kr` → CF → Tunnel → `web:3000`. 사용자 트래픽만. **DB는 외부 노출 0** — ETL·백업 모두 온박스 localhost, 관리 접속은 SSH 터널. (CF TCP 터널·Access 토큰 불필요 — ETL 온박스화로 소거)

- **ISR**: Next standalone은 온디스크 캐시로 ISR을 단일 노드에서 그대로 지원(멀티노드 아님 → 공유 캐시 불필요).
- **이미지 최적화**: `next/image`가 sharp(ARM)로 온박스 처리.
- **스크래퍼 방어**: origin IP가 은닉되고 인바운드가 없으므로 origin 직격 불가. `/api/staticmap` 남용은 Cloudflare WAF/rate-limit로 차단하고, **PNG는 파라미터 결정적이라 CF Cache Rule로 엣지 캐시 → origin 미도달**(비용 문제의 근원 벡터 B를 무력화).

---

## 4. 구성요소 상세

### 4.1 OCI 프로비저닝
- Docker Engine + docker compose plugin 설치 (arm64).
- Ubuntu `ufw`: 22(SSH)만 허용. OCI 콘솔의 **Security List / NSG도 동일하게** 22만 인그레스 허용(HTTP/HTTPS/5432 미개방).
- 스왑 없음 확인됨 → `next build`/Postgres 안정성 위해 **4~8GB 스왑파일 추가** 권장(11GB RAM이지만 빌드 피크 대비).
- 디스크 45GB → DB 볼륨·이미지·ISR 캐시 배치. 여유 충분하나 사용량 모니터링. OCI always-free 블록스토리지 200GB까지 무료 확장 가능.

### 4.2 Docker Compose 스택
- `web`: 멀티스테이지 `Dockerfile`(deps→build→runner), `output: 'standalone'` 산출물 실행. `restart: unless-stopped`. 환경변수는 `.env.production`.
- `db`: `imresamu/postgis:17-3.5`(**ARM64 멀티아치** — 공식 `postgis/postgis`는 amd64-only라 Ampere A1 네이티브 미구동, Task D 확인). **데이터는 bind mount**(`/var/lib/imjang/pgdata`)로 영속·백업·모니터 명시화, `shm_size` 상향(병렬쿼리), `stop_grace_period`로 graceful shutdown, `restart: unless-stopped`, localhost 바인딩(`127.0.0.1:5432`). `--data-only` 로드 시 `--disable-triggers`.
- `cloudflared`: 별도 systemd 서비스 또는 compose 서비스로 상시 기동. 터널 토큰 보관.

### 4.3 앱 코드 변경 (최소·외과적)
1. `next.config.mjs`: `output: 'standalone'` 추가. 기존 `outputFileTracingIncludes`(OG 폰트)는 standalone에서도 유지되도록 확인.
2. `app/layout.tsx`: `@vercel/analytics`·`@vercel/speed-insights` import 및 `<Analytics/>`·`<SpeedInsights/>` 제거. package.json에서 해당 devDep도 제거.
3. `.env.production` 신규:
   - `DATABASE_URL` / `DIRECT_URL` → `postgresql://...@localhost:5432/imjang_on`(Supabase 풀러 URL 폐기, 두 값 동일하게).
   - `SITE_URL` → `https://imjangon.co.kr`(공개 도메인, **모든 컨텍스트 동일** — sitemap·OG·revalidate 대상). **localhost로 바꾸지 말 것**(`posts` 생성이 SITE_URL로 저장 link를 만듦 → 오염). **Vercel 배포보호 URL 아님** → revalidate 401 소멸.
   - **⚠️ 운영 env는 `.env.local`이 아니라 Vercel 대시보드에 있음** → `SITE_URL`·`REVALIDATE_TOKEN`·`SENTRY_*` 등 전체를 export해 박스 `.env`로 이관(`.env.local`은 로컬 서브셋).
   - 나머지 키(PUBLIC_DATA_KEY, NAVER, GA 등) 이전. 네이버 지도 키는 **도메인 바인딩**이나 도메인 불변이라 영향 없음.
4. `Dockerfile`, `docker-compose.yml`, `.dockerignore` 신규 추가. **`NEXT_PUBLIC_*`(NAVER_MAP_CLIENT_ID·GA_ID)는 빌드타임 번들** → Docker build-arg로 전달, 런타임 시크릿(DATABASE_URL·NAVER_MAP_CLIENT_SECRET·PUBLIC_DATA_KEY)은 env 주입. **Prisma 쿼리엔진 바이너리를 standalone 산출물에 포함**(누락 시 런타임 500 — Next+Prisma+standalone 알려진 마찰점) + schema.prisma `generator`에 arm64 `binaryTargets`(또는 컨테이너 내 빌드로 native 해결).
5. 그 외 앱 로직·Prisma 스키마·GA·AdSense는 **불변**(비즈니스/API/쿼리 변경 0).
6. **검증됨**: edge 런타임 0(전부 `nodejs`), OG는 프레임워크 네이티브 `next/og`(self-host 동작), `VERCEL_ENV` 참조 3곳은 graceful fallback. 단 `next.config.mjs`의 Sentry authToken이 `VERCEL_ENV==='production'` 게이트라 온박스 빌드 시 소스맵 미업로드 → 원하면 조건 1줄 교체(오류 캡처 자체는 정상).
7. **스모크 테스트**(코드변경 아님, standalone 빌드 후 확인): OG 폰트 트레이싱, `next/image`(sharp arm64), `middleware.ts`.

### 4.4 DB 이전 (권장: 스키마=Prisma, 데이터만 복사)
- **타깃 `imresamu/postgis:17-3.5`**(ARM64 멀티아치; 소스 PG17.6·PostGIS3.3.7과 major 일치). **pg_dump 클라이언트 ≥17 필수** — 박스의 `imresamu/postgis:17` 컨테이너로 dump/restore.
1. OCI `db` 기동 → `prisma migrate deploy`(33개) → postgis·pg_trgm 확장 + 스키마 생성.
2. **유지보수 창**: ETL disable + 앱 쓰기 중단.
3. Supabase `pg_dump --data-only --schema=public`(세션 풀러 :5432, user `postgres.<ref>`), `spatial_ref_sys` 등 확장소유 테이블 제외. `supabase_vault`·`pg_stat_statements`는 public 밖이라 자동 제외.
4. OCI 로드(`--disable-triggers`) → **행 수·체크섬 + 시퀀스 `last_value` 검증**.
5. `prisma migrate status` 정합성 확인.
- **성능**: Transaction 7.36M행 인덱스 유지 COPY는 느림 → 필요 시 대형 테이블 인덱스 drop→load→recreate. 5.2GB 전체는 유지보수 창 내 수용.
- **금지**: 전체 `pg_dump`/`pg_restore`는 `supabase_vault` 등 Supabase 전용 객체를 끌고 와 실패 → 데이터만 복사로 확정.

### 4.5 ETL (온박스 systemd 타이머)
- 모든 스케줄 ETL을 GitHub Actions → **박스 systemd 타이머**로 이전, localhost DB 직접 접속. **DB 외부 노출·CF TCP 터널·Access 토큰 전부 불필요**(설계 단순화).
- **런타임**: 프로덕션 `web`은 standalone이라 `scripts/`·tsx 미포함 → Dockerfile에 **`etl` 타깃**(빌더 스테이지: dev deps+source+tsx) 추가, compose에 `etl` 서비스(상시기동 아님). 타이머가 `docker compose run --rm etl pnpm ingest:xxx` 호출 → compose 네트워크로 `db` 접속. (npm 스크립트가 `dotenv -e .env.local`을 쓰므로 etl 컨테이너에 prod값 `.env.local` 제공 또는 호출 방식 조정.)
- **스케줄**: 기존 9개 cron식을 systemd `OnCalendar`로 이관. 박스 TZ=UTC 고정해 GH Actions와 동일 시각 유지(cron 주석의 KST 매핑 보존).
- **시크릿**: `PUBLIC_DATA_KEY`·`NAVER_*`·`OPENAI_API_KEY`·`KAKAO`(있으면) 등을 박스 `.env`에 배치(`EnvironmentFile`).
- **revalidate**: `revalidator.ts`가 `${SITE_URL}/api/revalidate` 호출 → **SITE_URL은 공개 도메인 유지**(localhost로 바꾸면 posts link 오염). 호출은 CF 경유(빈도 낮아 무해). `REVALIDATE_TOKEN` 세팅 + 공개 도메인이라 기존 401 소멸. (localhost 최적화 필요 시 revalidator에 전용 base 변수 1줄 추가)
- **로그/관측**: `journalctl -u <unit>` + 실패 알림(기존 채널 재사용). GitHub Actions 스케줄 워크플로는 비활성/삭제. `warm-hub-cache`도 온박스(로컬 curl) 또는 폐기(ISR 커버). `pg-dump-backup`은 §4.7.

### 4.6 배포 (CD)
- `push → main` 시 GitHub Actions:
  1. lint/typecheck/test 게이트(기존 ci.yml 재사용).
  2. SSH 배포키(GH Secret)로 박스 접속.
  3. `git pull` → `docker compose build web` → **`docker compose run --rm web pnpm prisma migrate deploy`** → `docker compose up -d`.
- **효과**: 마이그레이션이 배포에 포함되어 기존 "Vercel은 마이그레이션 미적용 → 수동 deploy 필요" 갭이 제거됨.
- 빌드는 온박스(2 OCPU) — `next build` 수 분. 스왑으로 OOM 방지.
- 배포 시 **`etl` 이미지도 함께 빌드**. systemd 타이머 유닛은 repo `deploy/systemd/`에 두고 배포 스크립트가 동기화(`daemon-reload`).

### 4.7 백업 (직접 소유)
- 온박스 nightly cron: `pg_dump | gzip` → **OCI Object Storage(always-free 10GB)** 업로드 + 보존정책(예: 일 7 / 주 4).
- 기존 GH `pg-dump-backup.yml`(주간)은 **폐기** — 온박스 localhost 덤프로 대체(터널 불필요).
- 월 1회 복원 리허설(재해복구 검증)은 향후 과제.

### 4.8 모니터링
- Sentry 유지.
- 업타임: UptimeRobot 무료 또는 Cloudflare Health Checks.
- 컨테이너: `restart: unless-stopped` + `docker compose` healthcheck. 필요시 경량 대시보드(dozzle/netdata)는 선택.

---

## 5. 컷오버 런북 (순서)

1. **준비(무중단):** OCI 프로비저닝 → Docker/스왑/ufw → 앱 코드 변경(standalone, Vercel 제거, Dockerfile/compose) 브랜치 작성·테스트.
2. **DNS/터널:** Cloudflare에 도메인 추가 → **Vercel DNS 존 전체를 CF에 복제**(MX 없음·apex TXT 없음 확인됨) → NS 위임 → Tunnel(HTTP 단일, web:3000) 구성. **전환 후 GSC·네이버SA·AdSense 재검증.**
3. **스키마:** OCI `db` 기동 → `prisma migrate deploy`.
4. **드라이런:** Supabase → OCI 데이터 로드 리허설 1회(용량/시간 측정, 검증 스크립트 확정).
5. **유지보수 창 진입:** ETL 워크플로 disable, 공지.
6. **최종 데이터 복사:** `pg_dump --data-only` → OCI 로드 → 검증(행 수·체크섬).
7. **앱 기동:** `docker compose up -d`(web) → Tunnel로 스테이징 검증.
8. **DNS 전환:** Cloudflare에서 `imjangon.co.kr`을 Tunnel로 → 전파 확인.
9. **ETL 전환:** GH Actions 스케줄 비활성 → 박스 systemd 타이머 활성화(첫 실행 수동 검증).
10. **관측:** Sentry/업타임/비용 24~72h 모니터링.
11. **정리:** 안정 확인 후 Vercel 프로젝트 중지, Supabase 프로젝트 유지(롤백 대비) → 수일 후 폐기.

---

## 6. 리스크 & 완화

| 리스크 | 영향 | 완화 |
|---|---|---|
| **단일 인스턴스 SPOF** | 박스 다운 시 전체 다운(HA 없음) | 완전 자립 선택의 근본 트레이드오프. `restart:unless-stopped`, 스냅샷 백업, 빠른 재기동 런북. 필요 시 향후 이중화. |
| **온박스 ETL 운영부담** | 로그가 journalctl로 이동, 시크릿·타이머를 박스가 보유, 박스 다운 시 ETL도 정지 | 배포로 유닛 동기화 + 실패 알림 배선. DB localhost라 성능·안정성은 오히려 향상. SPOF는 단일인스턴스 항목과 동일. |
| ~~OCI 리전 지연~~ ✅해소 | — | `ap-tokyo-1`(Vercel·Supabase와 동일). 지연 불변, DB 코로케이션으로 개선. |
| **디스크 45GB 포화** | DB/ISR/이미지 증가 | 사용량 모니터, 200GB까지 무료 확장. |
| **빌드 OOM(온박스)** | 배포 실패 | 스왑 4~8GB, `docker compose build` 단독 실행. |
| **Cloudflare 무료 한도/의존** | 벤더 종속 | 표준적·무료. TLS·WAF·DDoS 이득이 종속보다 큼. |
| **컷오버 중 데이터 유실/불일치** | 정합성 | 유지보수 창에 쓰기 중단 + 체크섬 검증 + Supabase 유지(롤백). |
| **DNS 인증 유실** | NS 이전 시 GSC·네이버SA·AdSense 사이트 인증 깨짐 | Vercel DNS 존 전량 복제 후 전환 + 전환 후 재검증(§2.5). |
| **ISR 콜드·배포 블립** | 배포마다 컨테이너 교체 → `.next/cache` 소실로 재생성 폭주, 수초 502 | `.next/cache`를 named volume 마운트. 단일 컨테이너 교체 블립은 짧게 수용(필요 시 blue-green). |
| **Prisma 엔진 누락(standalone)** | 런타임 500 | Dockerfile에서 query engine 바이너리 포함 검증(스테이징 스모크). |

---

## 7. 롤백 전략

- DNS만 Supabase-백드 Vercel로 되돌리면 즉시 복구(컷오버 후 수일간 Vercel·Supabase 유지).
- 데이터는 컷오버 시점 이후 OCI에만 쌓이므로, 롤백 시 OCI→Supabase 역동기화 또는 창 재확보 필요 → **안정화 확인 전까지 이중 운영 유지**.

---

## 8. 성공 기준

- [ ] `imjangon.co.kr`가 OCI origin에서 Cloudflare 경유로 정상 서빙(주요 라우트 200, ISR 동작).
- [ ] Supabase 접속 0건(앱·ETL 모두 OCI DB 사용).
- [ ] 모든 ETL이 박스 systemd 타이머로 localhost DB에 접속·성공, GH Actions 스케줄 비활성.
- [ ] 배포 파이프라인이 `migrate deploy` 포함해 push→main으로 동작.
- [ ] nightly 백업이 OCI Object Storage에 적재.
- [ ] 인바운드 개방 포트 SSH뿐. origin IP 비노출.
- [ ] Vercel·Supabase 반복 비용 $0(중지/폐기 후).
- [ ] Sentry 에러율·응답시간이 이전 대비 회귀 없음.

---

## 9. 오픈 이슈 (대부분 §2.5에서 해소)

- [x] Supabase DB 용량 → **5.2GB**.
- [x] OCI 리전 지연 → **도쿄, 불변**.
- [x] 확장 의존성 → **postgis+pg_trgm뿐**.
- [ ] **DNS 재검증**: NS 이전 전 Vercel DNS 존 전량 export→CF 재생성. 전환 후 GSC·네이버SA·AdSense 사이트 인증 재확인(apex TXT 없음 → HTML/메타 방식 확인).
- [ ] **pg_dump 드라이런**: 세션 풀러(:5432)로 소량 `--data-only` 테스트. 실패 시 진짜 직결(`db.<ref>.supabase.co`, IPv4 애드온 가능성) 또는 `supabase db dump` CLI 폴백.
- [ ] **.co.kr 레지스트라 NS 위임** 가능 여부 확인.
- [x] ETL 접속 경로 → **온박스 systemd**(결정).
- [ ] OG 이미지 라우트 standalone 폰트 트레이싱 스테이징 검증.

---

## 10. 범위 밖 / 향후

- HA/멀티노드, 로드밸런싱, 읽기복제.
- WAL 아카이빙 기반 PITR(현재는 nightly 덤프로 충분).
- (완료) ETL 온박스 이전은 §4.5로 확정. 향후: 대량 ingest COPY 최적화, 실패 알림 고도화.
- 관측 스택 고도화(Grafana 등).

---

## 부록 A. 환경변수 이전 매핑 (실측 2026-07-21)

운영 env는 **두 곳**에 분산: Vercel Production(16, 웹) + GitHub Actions Secrets(11, ETL). 박스에서 하나의 `.env`(+ build-arg)로 통합한다.

| 박스 목적지 | 변수 |
|---|---|
| **웹 빌드타임**(build-arg) | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`, `NEXT_PUBLIC_KAKAO_JS_KEY`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_SENTRY_DSN`†, `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`†, `NEXT_PUBLIC_NAVER_SITE_VERIFICATION`† |
| **웹 런타임** | `DATABASE_URL`·`DIRECT_URL`(→localhost), `NAVER_MAP_CLIENT_SECRET`, `REVALIDATE_TOKEN`, `ADMIN_USER`, `ADMIN_PASSWORD`, `BOARD_PREVIEW_TOKEN`, `SENTRY_DSN`† |
| **ETL 런타임** | `PUBLIC_DATA_KEY`, `NEIS_API_KEY`‡, `CHILDCARE_API_KEY`‡, `KAKAO_REST_KEY`, `OPENAI_API_KEY`, `NAVER_SEARCH_CLIENT_ID`·`NAVER_SEARCH_CLIENT_SECRET`, `SITE_URL`, `REVALIDATE_TOKEN`, `DISCORD_WEBHOOK_URL`† |
| **빌드(선택: Sentry 소스맵)** | `SENTRY_AUTH_TOKEN`†, `SENTRY_ORG`†, `SENTRY_PROJECT`† |
| **버림** | `VERCEL_ENV`(자동·graceful), `NODE_ENV`(런타임) |

- **†** = Vercel·GH 어느 목록에도 없음 → 현재 Sentry↔Vercel 통합 자동주입 또는 미설정. 박스엔 **직접 세팅** 필요(없으면 조용히 미작동).
- **‡** = GH Secrets에만 존재하고 값 조회 불가(write-only) + Vercel에 없음 → 원본 보관본 없으면 공공데이터포털 재발급.
- **함정 1**: 웹은 `NEXT_PUBLIC_SITE_URL`, ETL revalidator는 **plain `SITE_URL`**(폴백이 죽은 도메인 `imjang-on.com`) → 박스에 **둘 다** `https://imjangon.co.kr`.
- **함정 2**: `NEXT_PUBLIC_*`는 빌드타임 번들 → 런타임 주입만으론 부족, build-arg 필수.
- **값 확보**: 대시보드는 변수당 환경별(Prod/Preview/Dev)로 행이 중복돼 ~23행처럼 보이나 **유니크 이름은 16개**(+ Vercel 시스템 `VERCEL_*`는 자동·이전 대상 아님). 박스는 **Production 값만** 필요 → `vercel env pull --environment=production`(기본이 Development이니 반드시 지정)으로 일괄 복호화(gitignore). 겹치는 GH 키도 대부분 회수. 진짜 GH-only는 `NEIS_API_KEY`·`CHILDCARE_API_KEY`뿐.
