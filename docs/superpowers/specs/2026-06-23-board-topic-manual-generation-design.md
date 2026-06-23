# 주제 입력형 게시글 생성(어드민) — 설계

- 작성일: 2026-06-23
- 상태: 설계 합의 완료 (구현 계획 대기) · 적대적 검증(실현가능성/법적/일관성) 1회 반영
- 한 줄: 어드민이 **주제만 입력**하면 시스템이 공공저작물(공공누리 확인)에서 근거를 모아 OpenAI로 초안을 만들고, 기존 검수 플로우로 게시한다.
- 관련 선행: [`2026-06-15-auto-board-content-pipeline-design.md`](./2026-06-15-auto-board-content-pipeline-design.md)(자동 파이프라인), [`2026-06-18-board-topic-generate-from-source-design.md`](./2026-06-18-board-topic-generate-from-source-design.md)(출처 붙여넣기형 CLI 경로)
- **중요:** 본 기능은 2026-06-18 설계가 비범위/Phase 2('수 주·높은 난도, 오선택·원칙 충돌')로 미뤄둔 **"주제 자동 검색"**을 실제로 구현하는 것이다. 따라서 난도·리스크가 낮지 않으며, 핵심 신규 모듈(검색 발견 + 공공누리 판정 + 본문 추출)이 작업의 대부분이다.

---

## 1. 목표 & 범위

### 문제 진단
현재 `/board`의 자동 글은 매번 "현재 청약 일정 정리"로 보인다. 주제가 하드코딩이라서가 아니라, **안정적으로 통과하는 소재 출처가 청약 집계 하나뿐**이기 때문이다.

- 일일 크론(`scripts/ingest/posts/runner.ts`, 11:00 KST)이 3개 출처에서 후보를 모아 1건만 생성: ① 정책브리핑·한국은행 RSS ② 우리 DB 청약 집계(FIRST_PARTY) ③ 네이버 뉴스(랭킹용).
- ①은 부처 화이트리스트 + 카테고리 키워드 + 제외어 + 본문 1,000자 사전필터에 더해 생성 후 가드레일(의견 금지·1,000~2,200자)까지 통과해야 해서 **정책 발표가 있는 날만** 살아남는다.
- ②는 우리 DB라 거의 항상 후보가 되지만 `dedupeKey`가 주 단위(`fp:subscription:{주시작일}`)라 **주 1회** 생성된다.
- 결과적으로 안정적으로 나오는 자동 글이 사실상 청약 집계뿐 → "매번 같은 주제"로 느껴진다.

→ **다양화 = 소재 출처 늘리기 문제.** 자동으로는 우리가 가진 공공데이터 범위에 묶이므로, **사람이 주제를 골라 주는 수동 경로**를 주력으로 삼는다.

### 목표
어드민이 주제(예: "전세 사기 예방 제도")를 입력하면, 시스템이 그 주제로 **공공저작물 근거**를 검색·수집(공공누리 이용가능 확인 포함)하고 OpenAI로 초안(DRAFT)을 생성한다. 어드민은 같은 화면에서 검수·게시한다.

### 비범위 (이번엔 안 함)
- 자동 크론 제거 (제거가 아니라 **빈도 축소**로 유지 — 슬로우데이 안전망)
- 회원/로그인 (어드민 기존 Basic Auth로 충분)
- 생성형 AI 이미지 (기존 정책대로 OG 템플릿 썸네일 재사용)
- 뉴스 기사 본문 재가공 (저작권 — 뉴스는 발견 신호로만)
- 자동 게시 (생성은 항상 DRAFT까지만)
- Prisma 스키마 변경 (라이선스 메타는 MVP에서 `sourceExcerpt` 헤더에 기록, 전용 필드는 향후)

---

## 2. 핵심 결정 (확정 — 브레인스토밍 합의)

| # | 결정 | 선택 |
|---|---|---|
| 다양성 확보 방식 | 자동 다양화 / **수동 주제 입력** / 하이브리드 | **수동 주제 입력** |
| 근거 처리 | 붙여넣기 / **주제만 → 시스템 검색** / 자유작성 | **주제만 → 시스템 검색** |
| 입력 경로 | **어드민 폼** / GitHub Actions / 주제 큐 | **어드민 폼** |
| 자동 크론 | 유지 / 끄기 / **빈도 축소** | **빈도 축소(주 1회)** |
| 근거 소스 | — | **법적 안전 우선 = 공공누리 이용가능 확인된 공공저작물** |
| 생성 실행 방식 | 동기 / 비동기 | **동기 Server Action + 단계별 타임박스**(하루 1건·검수 전제) |
| 수동 모델 | — | **gpt-4.1 고정**(env 기본 mini와 분리 — §8) |

### 코드 레벨로 강제하는 원칙
1. **LLM은 주입된 근거 텍스트 안에서만 작성** — 자기 지식 사용 금지 (기존 `SYSTEM_PROMPT` 그대로).
2. **근거 없으면 글 없음** — 이용가능 공공저작물 근거를 못 모으면 생성하지 않고 붙여넣기 폴백으로 전환.
3. **생성과 게시 분리** — 수동 경로도 DRAFT까지만, PUBLISHED는 반드시 사람 손.
4. **변이 동작은 전부 `/admin` 하위 Server Action** — Basic Auth가 자동 보호.
5. **(신규) 저작권 안전** — 근거 본문은 **공공누리 이용가능(주로 제1유형)이 확인된** 공공저작물에서만. **공공누리 유형을 확인할 수 없는(unknown) 소스는 근거에서 기본 배제.** 뉴스 기사 본문 비복제. 출처표시는 전 유형 공통 필수.
6. **(신규) topic은 검색어로만 사용** — `generateDraft`는 `topic`을 인자로 받지 않는다. 주제 문자열은 `research`의 검색 질의로만 쓰이고, 생성 근거는 수집된 `sourceText`뿐이다(원칙 1 보존). topic을 프롬프트에 주입하지 않는다.

---

## 3. 동작 흐름

```
어드민(/admin/posts) "주제로 새 글 생성" 폼
   │  ① 주제 타이핑 (예: "전세 사기 예방 제도")  →  [생성] 버튼
   ▼
Server Action  generateFromTopicAction(topic, pastedSource?)   ※ Basic Auth 뒤, 서버 전용, 동기
   │  ⓪ 설정 가드: env.OPENAI_API_KEY 없으면 즉시 { status:'config_error' } 반환
   │  ② 근거 수집  lib/board/research.ts (신규)            [pastedSource 있으면 ②~③ 건너뜀]
   │      - 발견: 네이버 검색으로 주제 관련 후보 URL 수집 → 공식 도메인 필터(1차, 뉴스 배제)
   │      - 본문: 후보 페이지 추출 + 공공누리 유형 판정 → 이용가능(제1유형 등)만 채택, unknown 배제
   │      - 데이터: 주제가 데이터형이면 우리 DB(청약·실거래·대출) 집계 digest
   │      - 스니펫은 후보 메타로만 보관(근거 텍스트 경로와 분리, 산출물 비전재)
   │  ③ 근거 판정 + collapse(§4 '대표 출처 규칙')
   │      ├ 충분(≥ MIN_SOURCE_CHARS, 이용가능 소스 1건↑) → generateDraft({sourceText, sourceName}, 'gpt-4.1')
   │      │        → createDraft()[기존, DRAFT]
   │      └ 부족/전부 unknown → { status:'insufficient', sources[] } 반환 (붙여넣기 폴백 유도)
   ▼
   ④ 같은 화면에서 결과 표시
      - 성공: 채택 출처 목록(+공공누리 유형) + 생성 초안 /admin/posts/[id] 이동 링크
      - 부족: 찾은 후보 링크 + "공식 자료 직접 붙여넣기" textarea → 재호출(pastedSource 경로)
   ▼
   ⑤ 검수·게시: 기존 /admin/posts/[id] 플로우 그대로 (수정/게시/반려)
```

---

## 4. 근거 수집 — 법적 안전 (핵심 신규 모듈 `lib/board/research.ts`)

"법적 문제 없는 선"이라는 제약을 다음과 같이 구체화한다. **도메인 필터만으로는 자유 이용을 보증하지 못한다** — 공공누리 적용 여부·유형은 도메인이 아니라 **문서(페이지) 단위**로 부여되기 때문이다.

### 4.1 2단계 게이트 (도메인 1차 → 공공누리 2차)

| 단계 | 출처/처리 | 비고 |
|---|---|---|
| 발견(discovery) | 네이버 검색 API로 주제 검색 → 후보 URL·메타 수집 | 검색은 URL **발견·랭킹 신호**용. 스니펫은 산출 근거/본문에 전달 금지 |
| 1차 필터(뉴스 배제) | 후보 도메인이 `korea.kr` 또는 **검증된 공공기관 도메인 allowlist**에 속하는지 | 도메인 통과 ≠ 이용 허락. **`*.or.kr` 와일드카드 금지**(민간 협회·재단도 사용) → 개별 등재 allowlist만 |
| 2차 게이트(공공누리) | 추출 페이지에서 **공공누리 마커·유형 탐지** → 제1유형(상업·변형 자유) 등 이용가능만 채택 | **마커 미발견(unknown)·제2~4유형은 근거 배제** (원칙 5) |
| 제3자 콘텐츠 배제 | 본문 중 외부 기고·인용 보고서·민간 제공 통계/표 등 **기관 자체 저작이 아닌 구간 배제** | 텍스트에도 제3자 권리물이 섞임 — "텍스트라서 안전" 아님 |
| 근거 데이터 | 우리 DB(청약·실거래·대출) 집계 | 우리 가공물(원자료 공공데이터). 항상 이용가능 |
| 폴백 | 위에서 이용가능 근거 미달 | 어드민이 **공식 자료 직접 붙여넣기** 후 재생성(사용자 확인 하) |

- **공공기관 도메인 allowlist(초기):** `korea.kr`, `*.go.kr`(정부), 그리고 개별 등재된 공공기관(예: `bok.or.kr`). `.or.kr`은 TLD 와일드카드가 아니라 **검증된 호스트 단위**로만 등재. 신규 추가는 한 줄(레지스트리 SSOT 패턴).
- **공공누리 유형 탐지:** 페이지 HTML/푸터의 공공누리 라이선스 마커(유형 1~4)를 파싱. 탐지 불가 시 `unknown` → 배제. *(구현 spike 대상: korea.kr·주요 go.kr의 마커 패턴 실측)*

### 4.2 다중 출처 → 단일 Post 필드 collapse (대표 출처 규칙)

`createDraft`는 단일 `sourceName/sourceUrl/sourceDate/sourceExcerpt`를 받고, `runGuardrails`는 `sourceName`·`sourceUrl`이 비면 거부한다. 여러 공공저작물을 모았을 때:

- **대표 출처**(canonical) 선정: 1순위 `korea.kr` → 2순위 기타 이용가능 공식 페이지 → 3순위 우리 DB. 대표 출처의 기관명/URL/발표일을 `sourceName/sourceUrl/sourceDate`로.
- `sourceText`(generateDraft 입력) = 채택된 본문들을 **출처 헤더와 함께 concat**.
- `sourceExcerpt`(≤4000자) = 대표 출처 본문 + **선두에 라이선스 메타 헤더**(예: `[출처: 국토교통부 · 공공누리 제1유형 · {url}]`) → 검수자가 이용범위를 바로 확인(스키마 변경 없이 기존 read-only 패널에 노출).
- `dedupeKey` = `manual:{slug}:{YYYY-MM-DD(KST)}`, `detectedFrom` = `topic:{slug}` (§6 slug 규칙).

### 4.3 검수자 안전장치 강화
- 채택 출처별 **공공누리 유형·마커 발견 여부·제3자 의심 플래그**를 결과/`sourceExcerpt` 헤더에 노출 → "사람 검수가 최종 안전장치"가 실효를 갖도록 판단 재료 제공.
- `unknown` 소스는 **기본 배제**(검수자가 직접 붙여넣기로 명시 채택하지 않는 한 근거 미사용).

---

## 5. 어드민 UI (신규 폼)

기존 `app/admin/posts` 확장. Basic Auth(`middleware.ts`)가 자동 보호. **현재 `/admin/posts`에는 폼/`useActionState`/생성 액션이 없으므로 폼·액션은 신규 작성**이다(기존 재사용 아님).

- **`/admin/posts` 상단 "주제로 새 글 생성" 카드(신규)**: 주제 입력칸 + [생성] 버튼.
- 생성 중 로딩 표시(검색+추출+생성 동기, 약 15~40초).
- 결과:
  - 성공 → 채택 출처 목록(+공공누리 유형) + 생성 초안 `/admin/posts/[id]` 이동 링크.
  - 근거 부족 → 후보 링크 + **공식 자료 붙여넣기 textarea(신규)** → `generateFromTopicAction(topic, pastedSource)` 재호출.
- 검수·게시 화면은 **기존 `/admin/posts/[id]` 그대로** — 신규 검수 UI 없음.

---

## 6. 재사용 vs 신규 (컴포넌트 경계) — *검증 반영*

### 재사용 (이미 존재, 시그니처 확인됨)
| 단위 | 책임 | 확인 |
|---|---|---|
| `lib/board/generate.ts` `generateDraft(client, {sourceText, sourceName}, model)` | 근거 텍스트 → structured 초안. **topic 미수신** | 시그니처 일치 |
| `lib/board/guardrails.ts` `runGuardrails` | 의견 금지·출처(sourceName·sourceUrl 필수)·분량(1,000~2,200) | 일치 |
| `lib/board/create-draft.ts` `createDraft({gen, sourceName, sourceUrl, sourceDate, sourceExcerpt, dedupeKey, dateISO, detectedFrom})` → `'created'|'duplicate'|'rejected'` | dedupe+가드레일+slug+DRAFT insert | 일치 |
| `lib/slug.ts` `normalizeName` | 주제 slug 정규화 | 재사용 |
| `app/admin/posts/[id]` + `actions.ts`(save/publish/reject/delete) | 검수·게시 | 일치 |
| 네이버 검색 **HTTP 호출 패턴**(URL·헤더·AbortController·실패 시 빈배열) + env 자격증명 plumbing | 호출 골격만 | 부분 재사용 |

### 신규 (검증에서 "재사용 아님"으로 정정)
| 단위 | 책임 | 의존 |
|---|---|---|
| `lib/board/research.ts` | 주제 → 검색 발견 + 도메인 1차필터 + **공공누리 유형 판정** + 본문 추출 + 대표출처 collapse | 네이버 검색, fetch, 도메인 allowlist, KOGL 마커 파서 |
| `generateFromTopicAction(topic, pastedSource?)` (in `app/admin/posts/actions.ts`) | 설정가드 → research(또는 pastedSource) → generateDraft('gpt-4.1') → createDraft, 결과/폴백 반환 | research, generate, create-draft |
| 어드민 폼 컴포넌트("주제로 새 글 생성" + 폴백 textarea) | 입력·로딩·결과·폴백 UI(폼/useActionState 신규) | server action |

- **네이버 발견은 신규다:** 기존 `naverNewsCount()`는 **정수 카운트만** 반환(`scripts/ingest/posts/detect-issues.ts`, 경로 주의 — `sources/` 아님), `collectNaverNewsCandidates()`는 **고정 4개 부처 쿼리**로 topic 인자 없음(`scripts/ingest/posts/sources/naver-news.ts`, `search/news.json`). topic 파라미터 검색 + 결과 originallink 도메인 필터(또는 `webkr` 검색) + 추출은 전부 신규. **4대 원칙(네이버=화제성 신호, 본문 사실 미사용)과의 화해:** 네이버는 여전히 **사실원이 아니라 URL 발견용**으로만 쓰며, 본문 사실은 추출된 공공저작물에서만 온다 → 원칙의 정신 유지.
- **slug 규칙:** `slug = normalizeName(topic.trim())`를 40자 컷. `dedupeKey`·`detectedFrom` 동일 함수 사용(표기 흔들림으로 인한 dedupe 우회 방지).

---

## 7. 자동 크론 빈도 축소

- **대상 파일은 `.github/workflows/generate-board-posts.yml` 1개의 cron 한 줄.** `generate-board-topic.yml`(workflow_dispatch 전용)은 **변경 없음**.
- `0 2 * * *`(매일) → **`0 2 * * 1`(월요일 1회, 11:00 KST)**.
- 근거: 청약 집계가 원래 주 1회 cadence라 월요일 1회로 자연 수렴. 수동 경로가 주력, 자동은 슬로우데이 안전망. 결과물은 여전히 DRAFT → 원치 않으면 반려.

---

## 8. 배포 · 환경 · 비용 — *검증 반영*

### 환경변수 (Vercel 운영 env에 추가, 전제 조건)
`OPENAI_API_KEY`, `NAVER_SEARCH_CLIENT_ID`, `NAVER_SEARCH_CLIENT_SECRET`, **그리고 `OPENAI_MODEL`(또는 코드에서 모델 고정 — 아래)**.
- 현재 이 키들은 GitHub Actions Secret에만 존재. 어드민 생성이 Vercel 서버 런타임에서 호출하므로 운영 env 추가 필요.
- **서버 전용**(`NEXT_PUBLIC_` 아님) → 클라이언트 번들·브라우저 노출 없음. 어드민 라우트는 Basic Auth 뒤. (공개 페이지는 여전히 OpenAI 미호출 — 완화는 어드민 경로 한정)
- **env 검증 동작(lib/env.ts):** import 시점에 zod로 검증하고 실패하면 **앱 전체가 부팅 크래시**. 단 위 키들은 `.optional()`이라 **누락돼도 크래시는 안 나고**, 호출 시점에 조용히 실패한다(`createOpenAiClient`가 'OPENAI_API_KEY 미설정' throw, 네이버는 `[]`). → ⓪ 설정 가드로 `{status:'config_error'}` 친절 반환. **신규 필수 변수를 env.ts에 추가하면 앱 전체가 import 크래시하므로, 새 변수는 반드시 `.optional()`로.**

### 모델 (gpt-4.1 강제)
- `env.OPENAI_MODEL` 기본값은 `gpt-4.1-mini`이고 짧은 출처에서 1,000자 하한 미달이 잦다(선행 설계 실증). 수동 경로는 품질을 위해 **gpt-4.1 고정**이 필요.
- **메커니즘(택1, 구현 시 확정):** (a) `generateFromTopicAction`이 `env.OPENAI_MODEL` 대신 리터럴 `'gpt-4.1'`을 `generateDraft`에 전달, 또는 (b) 신규 `OPENAI_BOARD_MODEL`(.optional, 기본 gpt-4.1) 추가. **(a) 권장**(env 추가 없음, 단순). Vercel env에 `OPENAI_MODEL`만 넣고 (a)를 안 쓰면 조용히 mini로 돌아 하한 미달 발생 → 반드시 (a) 또는 (b) 명시.

### 타임아웃 (maxDuration — 신규 도입, 위치 주의)
- 리포에 `maxDuration` 선례 없음(신규). **`'use server'` 모듈(actions.ts)에 두면 효과 없음** — Route Handler/페이지 세그먼트에만 적용된다.
- 따라서 **폼을 호스팅하는 라우트/페이지 세그먼트**(`app/admin/posts/page.tsx` 등)에 `export const maxDuration = 60`. Vercel 플랜 상한(Hobby 60s / Pro 300s) 확인 필요 → §10.
- 동기 생성이 60s를 위협하면 **추출 단계 타임박스**(후보 N개·페이지당 fetch 타임아웃)로 상한을 건다.

### 비용
- OpenAI gpt-4.1, 하루 1건 수준 → 비용 미미. 네이버 검색 무료 쿼터 내.

---

## 9. 가드레일 · 검증 기준 — *검증 반영*

### 가드레일 (기존 코드 강제 그대로)
- 의견·예측 금지표현 정규식 필터.
- **분량 1,000~2,200자** — `guardrails.ts checkLength`가 SSOT(시스템 프롬프트의 '1,000~2,000자'는 안내 문구일 뿐, 게이트는 2,200 상한). 코드 수정 비범위.
- 출처 필수(sourceName·sourceUrl null이면 저장 거부) → §4.2 대표 출처가 채움.
- 근거 부족 시 생성하지 않음(폴백 전환).

### 성공 기준 (이게 되면 끝)
1. 어드민에서 주제 입력 → 공공누리 이용가능 근거로 DRAFT 1건 생성 → 검수·게시까지 동작.
2. 근거 부족/전부 unknown 주제 → 붙여넣기 폴백으로 생성 동작.
3. 생성 글에 출처(+공공누리 유형) 표기 + 가드레일 통과.
4. **근거 게이트 단위 테스트**: (a) 뉴스 도메인은 1차 필터에서 배제, (b) 공공누리 마커 미발견(unknown) 소스는 근거 배제, (c) `.or.kr`은 allowlist 등재 호스트만 통과.
5. **네이버 스니펫이 generateDraft 입력/산출 본문에 포함되지 않음** 단위 테스트.
6. **topic이 generateDraft 프롬프트에 주입되지 않음** 확인(검색어로만).
7. 자동 크론 주 1회로 축소 확인(generate-board-posts.yml 한 파일).
8. 키는 서버 전용 — 클라이언트 번들에 노출 없음. 미설정 시 `config_error` 친절 반환.

---

## 10. 알려진 리스크
- **추출/마커 탐지 실패**: 임의 공식 페이지(JS 렌더·리다이렉트)에서 본문 추출·공공누리 마커 탐지 실패 → 1순위 korea.kr·우리 DB + 붙여넣기 폴백으로 방어. 구현 전 **spike로 마커 탐지 신뢰도 실측**.
- **근거 빈약·strict 게이트로 폴백 빈도↑**: unknown 기본 배제 때문에 에버그린 주제는 폴백이 잦을 수 있음 → 이는 "법적 안전" 제약의 의도된 트레이드오프. 붙여넣기로 보완(사람 검수 전제).
- **레이턴시/타임아웃**: 동기 15~40초 + Hobby 60s 한도 → maxDuration(페이지 세그먼트) + 추출 타임박스. Hobby면 필요 시 Pro 승격 판단.
- **공공누리 예외(제3자 콘텐츠)**: 텍스트에도 외부 기고·인용 통계가 섞임 → 기관 자체 저작 구간만 근거화 + 수치는 1차 공공출처 확인 + 검수.

---

## 11. 열린 항목 (구현 spike에서 확정)
- **공공누리 마커 탐지 방식**: korea.kr·주요 go.kr 페이지의 라이선스 마커 HTML 패턴 실측 → 파서 구현 가능성/정확도.
- **검색 발견 엔드포인트**: 네이버 `news`(originallink 도메인 필터) vs `webkr`(웹문서) — 공식 도메인 발견에 어느 쪽이 나은지, korea.kr 자체 검색 엔드포인트 가용성.
- `MIN_SOURCE_CHARS`(수동 경로 근거 충분 임계값) 값.
- gpt-4.1 강제 메커니즘 (a)리터럴 vs (b)`OPENAI_BOARD_MODEL` — (a) 권장, 구현 시 1개 확정.
- Vercel 플랜의 `maxDuration` 상한 확인.
- 어드민 폼 위치: 목록 상단 카드 vs 별도 `/admin/posts/new` — 카드 우선.
